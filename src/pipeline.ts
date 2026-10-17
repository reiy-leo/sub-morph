// 核心流程：拉取原订阅 → 识别格式 → 解析 → 套用覆写脚本（QuickJS 沙箱）→ 序列化 → 输出。
// 每次执行写一条 fetch_logs（不含完整 URL、不含节点内容），并更新订阅的「最近拉取」状态。
import { limitsOf, maxSubBytes, type Env } from "./env.ts";
import { decrypt, encrypt } from "./crypto.ts";
import { contentType, countProxies, detectFormat, FormatError, parseConfig, serializeConfig } from "./formats/index.ts";
import { runScript, ScriptError } from "./sandbox.ts";
import { resolveScript, ScriptFetchError } from "./scripts.ts";
import { statusLabel } from "./shared/status.ts";
import type { DetectedFormat, FetchTrigger, PreviewResult, Served } from "./shared/types.ts";
import { encKey, type SubRow } from "./subs.ts";
import { scrubUrls } from "./urls.ts";
import { readPushed } from "./push.ts";

/** 透传给客户端的原订阅响应头（流量 / 到期 / 更新间隔 / 文件名）。 */
const PASS_HEADERS = ["subscription-userinfo", "profile-update-interval", "profile-web-page-url", "content-disposition", "support-url"];

const DEFAULT_UA: Record<string, string> = { auto: "clash.meta", clash: "clash.meta", qx: "Quantumult%20X/1.0" };

class UpstreamError extends Error {
  status: number;
  upstream: number | null;
  constructor(message: string, status: number, upstream: number | null) {
    super(message);
    this.status = status;
    this.upstream = upstream;
  }
}

export interface PipelineResult {
  status: number;
  body: string;
  headers: Record<string, string>;
  served: Served;
  preview: PreviewResult;
}

interface FallbackCache {
  body: string;
  format: DetectedFormat;
  headers: Record<string, string>;
  at: number;
}

function pickUserAgent(sub: SubRow, clientUA: string | null): string {
  if (sub.user_agent) return sub.user_agent;
  // 客户端拉取时透传客户端自己的 UA（机场按 UA 返回对应格式），试运行时用默认值
  if (clientUA && !/mozilla|chrome|safari/i.test(clientUA)) return clientUA;
  return DEFAULT_UA[sub.format] ?? "clash.meta";
}

/** 失败时说明是谁拒绝的：server 头、Cloudflare 拦截标记（cf-mitigated）、是否经过 Cloudflare（cf-ray）。不含 URL。 */
function blockerHint(res: Response): string {
  const parts: string[] = [];
  const server = res.headers.get("server");
  if (server) parts.push(`server: ${server.slice(0, 40)}`);
  const mitigated = res.headers.get("cf-mitigated");
  if (mitigated) parts.push(`cf-mitigated: ${mitigated.slice(0, 20)}（被 Cloudflare 安全规则拦截）`);
  else if (res.headers.get("cf-ray") && /cloudflare/i.test(server ?? "")) parts.push("经过 Cloudflare");
  return parts.length ? `（${parts.join("，")}）` : "";
}

async function fetchUpstream(env: Env, url: string, ua: string): Promise<{ text: string; headers: Record<string, string>; status: number }> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { "User-Agent": ua, Accept: "*/*" }, redirect: "follow", signal: AbortSignal.timeout(15_000) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/timed? ?out|abort/i.test(msg)) throw new UpstreamError("原订阅响应超时（超过 15 秒）", 504, null);
    throw new UpstreamError(`连接原订阅失败：${scrubUrls(msg)}`, 502, null);
  }
  if (!res.ok) throw new UpstreamError(`原订阅返回 ${statusLabel(res.status)}${blockerHint(res)}`, 502, res.status);
  const max = maxSubBytes(env);
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > max) throw new UpstreamError(`原订阅超过 ${max / 1024 / 1024} MB 上限`, 502, res.status);
  const text = await res.text();
  if (text.length > max) throw new UpstreamError(`原订阅超过 ${max / 1024 / 1024} MB 上限`, 502, res.status);
  if (!text.trim()) throw new UpstreamError("原订阅返回空内容", 502, res.status);
  const headers: Record<string, string> = {};
  for (const h of PASS_HEADERS) {
    const v = res.headers.get(h);
    if (v) headers[h] = v;
  }
  return { text, headers, status: res.status };
}

/** 推送模式：用设备最近一次推送的原订阅内容代替直连。 */
async function fromPushed(env: Env, sub: SubRow): Promise<{ text: string; headers: Record<string, string>; status: number }> {
  const p = await readPushed(env, sub);
  if (!p) throw new UpstreamError("推送模式：还没收到设备推送的原订阅（检查设备上的定时任务是否在运行）", 503, sub.push_status ?? null);
  return { text: p.text, headers: { ...p.headers, "x-sub-morph-pushed-at": new Date(p.at).toISOString() }, status: p.status };
}

export async function runPipeline(env: Env, sub: SubRow, opts: { trigger: FetchTrigger; clientUA: string | null }): Promise<PipelineResult> {
  const started = Date.now();
  const limits = limitsOf(env);
  let upstreamStatus: number | null = null;
  let format: DetectedFormat | null = null;
  let scriptHash: string | null = null;
  let consoleLines: string[] = [];
  let proxies: number | null = null;
  // 试运行时把原订阅内容回给本人看（不落库）；脚本出错时也能对照原文排查
  let upstreamText: string | null = null;
  let upstreamBytes: number | null = null;

  try {
    const up = sub.push_token_hash ? await fromPushed(env, sub) : await fetchUpstream(env, await decrypt(sub.source_enc, encKey(env)), pickUserAgent(sub, opts.clientUA));
    upstreamStatus = up.status;
    upstreamBytes = up.text.length;
    if (opts.trigger !== "client") upstreamText = up.text.slice(0, PREVIEW_MAX);
    format = detectFormat(up.text, sub.format);
    let config = parseConfig(up.text, format);

    const script = await resolveScript(env, sub);
    if (script) {
      scriptHash = script.hash;
      const r = await runScript(script.code, config, {
        timeoutMs: limits.scriptTimeoutMs,
        memoryMB: limits.scriptMemoryMB,
        meta: { name: sub.name, format, trigger: opts.trigger },
      });
      config = r.output;
      consoleLines = r.console;
    }
    proxies = countProxies(config, format);
    const body = serializeConfig(config, format);

    const headers: Record<string, string> = { ...up.headers, "Content-Type": contentType(format) };
    if (!headers["content-disposition"]) headers["content-disposition"] = `attachment; filename*=UTF-8''${encodeURIComponent(sub.name)}`;
    if (!headers["profile-update-interval"]) headers["profile-update-interval"] = "12";

    const scriptChanged = await record(env, sub, { trigger: opts.trigger, served: "fresh", httpStatus: 200, upstreamStatus, scriptHash, proxies, started, bytes: body.length, error: null, format });
    if (sub.fallback && opts.trigger === "client") {
      const cache: FallbackCache = { body, format, headers, at: Date.now() };
      await env.CACHE.put(`fb:${sub.id}`, await encrypt(JSON.stringify(cache), encKey(env)), { expirationTtl: 60 * 86400 }).catch((e) => console.error("fallback cache write failed", e));
    }
    return {
      status: 200,
      body,
      headers,
      served: "fresh",
      preview: { ok: true, served: "fresh", httpStatus: 200, upstreamStatus, error: null, format, proxies, scriptHash, scriptChanged, durationMs: Date.now() - started, bytes: body.length, console: consoleLines, outputHead: body.slice(0, PREVIEW_MAX), upstreamText, upstreamBytes },
    };
  } catch (e) {
    let status = 500;
    let message: string;
    if (e instanceof UpstreamError) {
      status = e.status;
      upstreamStatus = e.upstream ?? upstreamStatus;
      message = e.message;
    } else if (e instanceof FormatError || e instanceof ScriptError || e instanceof ScriptFetchError) {
      status = e instanceof ScriptFetchError ? 502 : 422;
      message = e.message;
      if (e instanceof ScriptError) consoleLines = (e as ScriptError & { console?: string[] }).console ?? [];
    } else {
      console.error("pipeline error", e);
      message = `内部错误：${scrubUrls(e instanceof Error ? e.message : String(e))}`;
    }
    message = scrubUrls(message).slice(0, 500);

    // 兜底：返回上次成功结果
    if (sub.fallback && opts.trigger === "client") {
      const raw = await env.CACHE.get(`fb:${sub.id}`);
      if (raw) {
        try {
          const cache = JSON.parse(await decrypt(raw, encKey(env))) as FallbackCache;
          const scriptChanged = await record(env, sub, { trigger: opts.trigger, served: "fallback", httpStatus: 200, upstreamStatus, scriptHash, proxies: null, started, bytes: cache.body.length, error: message, format: cache.format });
          const headers = { ...cache.headers, "X-Sub-Morph-Fallback": "1", "X-Sub-Morph-Error": encodeURIComponent(message).slice(0, 500) };
          return {
            status: 200,
            body: cache.body,
            headers,
            served: "fallback",
            preview: { ok: false, served: "fallback", httpStatus: 200, upstreamStatus, error: message, format: cache.format, proxies: null, scriptHash, scriptChanged, durationMs: Date.now() - started, bytes: cache.body.length, console: consoleLines, outputHead: null, upstreamText, upstreamBytes },
          };
        } catch (err) {
          console.error("fallback cache read failed", err);
        }
      }
    }

    const scriptChanged = await record(env, sub, { trigger: opts.trigger, served: "error", httpStatus: status, upstreamStatus, scriptHash, proxies: null, started, bytes: null, error: message, format });
    return {
      status,
      body: `sub-morph：${statusLabel(status)}\n${message}\n`,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
      served: "error",
      preview: { ok: false, served: "error", httpStatus: status, upstreamStatus, error: message, format, proxies: null, scriptHash, scriptChanged, durationMs: Date.now() - started, bytes: null, console: consoleLines, outputHead: null, upstreamText, upstreamBytes },
    };
  }
}

const MAX_LOGS_PER_SUB = 100;
/** 试运行回显的原订阅 / 输出内容上限（字符）。 */
const PREVIEW_MAX = 256 * 1024;

/** 写日志 + 更新订阅状态；返回脚本是否变化（与上次记录的 hash 不同）。 */
async function record(
  env: Env,
  sub: SubRow,
  r: { trigger: FetchTrigger; served: Served; httpStatus: number; upstreamStatus: number | null; scriptHash: string | null; proxies: number | null; started: number; bytes: number | null; error: string | null; format: DetectedFormat | null },
): Promise<boolean> {
  const now = Date.now();
  const changed = Boolean(r.scriptHash && sub.last_script_hash && r.scriptHash !== sub.last_script_hash);
  const newHash = r.scriptHash ?? sub.last_script_hash;
  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO fetch_logs (sub_id, user_id, at, trigger, served, http_status, upstream_status, script_hash, script_changed, proxies, duration_ms, bytes, error)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)`,
      ).bind(sub.id, sub.user_id, now, r.trigger, r.served, r.httpStatus, r.upstreamStatus, r.scriptHash, changed ? 1 : 0, r.proxies, now - r.started, r.bytes, r.error),
      env.DB.prepare(
        `UPDATE subscriptions SET last_at=?2, last_served=?3, last_http=?4, last_upstream=?5, last_error=?6, last_proxies=?7, last_script_hash=?8,
           script_changed_at=CASE WHEN ?9 THEN ?2 ELSE script_changed_at END, detected_format=COALESCE(?10, detected_format) WHERE id=?1`,
      ).bind(sub.id, now, r.served, r.httpStatus, r.upstreamStatus, r.error, r.proxies, newHash, changed ? 1 : 0, r.format),
      env.DB.prepare(
        `DELETE FROM fetch_logs WHERE sub_id=?1 AND id <= (SELECT id FROM fetch_logs WHERE sub_id=?1 ORDER BY id DESC LIMIT 1 OFFSET ${MAX_LOGS_PER_SUB})`,
      ).bind(sub.id),
    ]);
  } catch (e) {
    console.error("record fetch log failed", e);
  }
  return changed;
}
