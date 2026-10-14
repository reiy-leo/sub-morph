// 订阅 CRUD + 输出地址密钥。
import { limitsOf, type Env } from "./env.ts";
import { InputError } from "./errors.ts";
import { decrypt, encrypt, randomId, randomSecret, sha256Hex } from "./crypto.ts";
import { getOfficial } from "./official.ts";
import type { FetchLogView, ScriptMode, SubFormat, SubView } from "./shared/types.ts";
import { checkRemoteUrl, maskHost } from "./urls.ts";
import { submissionView, submitScript, type SubmissionRow } from "./submissions.ts";

export interface SubRow {
  id: string;
  user_id: string;
  name: string;
  source_enc: string;
  source_host: string;
  format: SubFormat;
  detected_format: "clash" | "qx" | null;
  user_agent: string;
  script_mode: ScriptMode;
  official_id: string | null;
  script_url: string;
  script_content: string;
  fallback: number;
  token_hash: string;
  token_enc: string;
  created_at: number;
  updated_at: number;
  last_at: number | null;
  last_served: "fresh" | "fallback" | "error" | null;
  last_http: number | null;
  last_upstream: number | null;
  last_error: string | null;
  last_proxies: number | null;
  last_script_hash: string | null;
  script_changed_at: number | null;
  archived_at: number | null;
}

export const encKey = (env: Env) => {
  if (!env.ENCRYPTION_KEY) throw new InputError("服务端未配置 ENCRYPTION_KEY（503 服务暂不可用）", 503);
  return env.ENCRYPTION_KEY;
};

export const outputUrl = (origin: string, token: string) => `${origin}/s/${token}`;

export async function toSubView(env: Env, r: SubRow & { official_name?: string | null }, opts: { origin: string; owner: boolean }): Promise<SubView> {
  const view: SubView = {
    id: r.id,
    name: r.name,
    host: r.source_host,
    format: r.format,
    detectedFormat: r.detected_format,
    userAgent: r.user_agent,
    scriptMode: r.script_mode,
    officialId: r.official_id,
    officialName: r.official_name ?? null,
    scriptUrl: r.script_url,
    scriptContent: opts.owner ? r.script_content : "",
    fallback: Boolean(r.fallback),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    archivedAt: r.archived_at ?? null,
    last: r.last_at
      ? {
          at: r.last_at,
          served: r.last_served ?? "error",
          httpStatus: r.last_http ?? 0,
          upstreamStatus: r.last_upstream,
          error: r.last_error,
          scriptHash: r.last_script_hash,
          scriptChangedAt: r.script_changed_at,
          proxies: r.last_proxies,
        }
      : null,
  };
  if (opts.owner) {
    const key = encKey(env);
    view.url = await decrypt(r.source_enc, key);
    view.outputUrl = outputUrl(opts.origin, await decrypt(r.token_enc, key));
    const sub = await env.DB.prepare("SELECT * FROM script_submissions WHERE sub_id=?1 ORDER BY created_at DESC LIMIT 1").bind(r.id).first<SubmissionRow>();
    view.submission = sub ? submissionView(sub, false) : null;
  }
  return view;
}

const SELECT = "SELECT s.*, o.name AS official_name FROM subscriptions s LEFT JOIN official_scripts o ON o.id = s.official_id";

/** archived=false 只列未归档的；true 只列已归档的（按归档时间倒序）。 */
export async function listSubs(env: Env, userId: string | null, archived = false) {
  const a = archived ? "s.archived_at IS NOT NULL" : "s.archived_at IS NULL";
  const order = archived ? "s.archived_at DESC" : "s.created_at DESC";
  const q = userId
    ? env.DB.prepare(`${SELECT} WHERE s.user_id=?1 AND ${a} ORDER BY ${order} LIMIT 500`).bind(userId)
    : env.DB.prepare(`${SELECT} WHERE ${a} ORDER BY ${order} LIMIT 500`);
  return (await q.all<SubRow & { official_name: string | null }>()).results;
}

export const getSub = (env: Env, id: string) => env.DB.prepare(`${SELECT} WHERE s.id=?1`).bind(id).first<SubRow & { official_name: string | null }>();

export interface SubInput {
  name?: unknown;
  url?: unknown;
  format?: unknown;
  userAgent?: unknown;
  scriptMode?: unknown;
  officialId?: unknown;
  scriptUrl?: unknown;
  scriptContent?: unknown;
  fallback?: unknown;
  /** 同时把覆写脚本提交为官方脚本候选（只对脚本地址 / 脚本内容有效）。 */
  submitOfficial?: unknown;
}

async function validate(env: Env, b: SubInput, selfHost: string) {
  const url = typeof b.url === "string" ? b.url.trim() : "";
  if (!url) throw new InputError("请填写原订阅地址");
  const u = checkRemoteUrl(url, "原订阅地址", selfHost);
  const name = (typeof b.name === "string" ? b.name.trim() : "").slice(0, 60) || u.hostname;
  const format: SubFormat = b.format === "clash" || b.format === "qx" ? b.format : "auto";
  const userAgent = typeof b.userAgent === "string" ? b.userAgent.trim().slice(0, 200) : "";
  const scriptMode: ScriptMode = b.scriptMode === "official" || b.scriptMode === "url" || b.scriptMode === "inline" ? b.scriptMode : "none";
  let officialId: string | null = null;
  let scriptUrl = "";
  let scriptContent = "";
  if (scriptMode === "official") {
    officialId = typeof b.officialId === "string" ? b.officialId : null;
    const o = officialId ? await getOfficial(env, officialId) : null;
    if (!o || !o.enabled) throw new InputError("官方脚本不存在或已停用");
  } else if (scriptMode === "url") {
    scriptUrl = typeof b.scriptUrl === "string" ? b.scriptUrl.trim() : "";
    checkRemoteUrl(scriptUrl, "脚本地址", selfHost);
  } else if (scriptMode === "inline") {
    scriptContent = typeof b.scriptContent === "string" ? b.scriptContent : "";
    if (!scriptContent.trim()) throw new InputError("请填写脚本内容");
    if (new TextEncoder().encode(scriptContent).length > limitsOf(env).maxScriptKB * 1024) throw new InputError(`脚本超过 ${limitsOf(env).maxScriptKB} KB 上限`);
  }
  return { url: u.toString() === url ? url : url, host: maskHost(url), name, format, userAgent, scriptMode, officialId, scriptUrl, scriptContent, fallback: b.fallback === true ? 1 : 0 };
}

export async function createSub(env: Env, userId: string, b: SubInput, selfHost: string): Promise<SubRow> {
  const { n } = (await env.DB.prepare("SELECT COUNT(*) AS n FROM subscriptions WHERE user_id=?1 AND archived_at IS NULL").bind(userId).first<{ n: number }>()) ?? { n: 0 };
  const max = limitsOf(env).maxSubs;
  if (n >= max) throw new InputError(`每个账号最多 ${max} 个订阅`, 429);
  const v = await validate(env, b, selfHost);
  if (b.submitOfficial === true && v.scriptMode !== "url" && v.scriptMode !== "inline") throw new InputError("只有「脚本地址」或「脚本内容」可以提交为官方脚本");
  const key = encKey(env);
  const token = randomSecret();
  const id = randomId(6);
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO subscriptions (id, user_id, name, source_enc, source_host, format, user_agent, script_mode, official_id, script_url, script_content, fallback, token_hash, token_enc, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?15)`,
  )
    .bind(id, userId, v.name, await encrypt(v.url, key), v.host, v.format, v.userAgent, v.scriptMode, v.officialId, v.scriptUrl, v.scriptContent, v.fallback, await sha256Hex(token), await encrypt(token, key), now)
    .run();
  if (b.submitOfficial === true) await submitScript(env, { userId, subId: id, subName: v.name, url: v.url, scriptMode: v.scriptMode, scriptUrl: v.scriptUrl, scriptContent: v.scriptContent });
  return (await getSub(env, id))!;
}

/** 编辑订阅：输出地址不变。 */
export async function updateSub(env: Env, sub: SubRow, b: SubInput, selfHost: string): Promise<SubRow> {
  const v = await validate(env, b, selfHost);
  if (b.submitOfficial === true && v.scriptMode !== "url" && v.scriptMode !== "inline") throw new InputError("只有「脚本地址」或「脚本内容」可以提交为官方脚本");
  const key = encKey(env);
  await env.DB.prepare(
    `UPDATE subscriptions SET name=?2, source_enc=?3, source_host=?4, format=?5, user_agent=?6, script_mode=?7, official_id=?8, script_url=?9, script_content=?10, fallback=?11, updated_at=?12 WHERE id=?1`,
  )
    .bind(sub.id, v.name, await encrypt(v.url, key), v.host, v.format, v.userAgent, v.scriptMode, v.officialId, v.scriptUrl, v.scriptContent, v.fallback, Date.now())
    .run();
  if (!v.fallback) await env.CACHE.delete(`fb:${sub.id}`);
  if (b.submitOfficial === true) await submitScript(env, { userId: sub.user_id, subId: sub.id, subName: v.name, url: v.url, scriptMode: v.scriptMode, scriptUrl: v.scriptUrl, scriptContent: v.scriptContent });
  return (await getSub(env, sub.id))!;
}

/** 刷新输出地址：旧地址立即失效（返回 410 已失效）。 */
export async function rotateToken(env: Env, sub: SubRow): Promise<SubRow> {
  const key = encKey(env);
  const token = randomSecret();
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO revoked_tokens (token_hash, sub_id, revoked_at) VALUES (?1, ?2, ?3)").bind(sub.token_hash, sub.id, now),
    env.DB.prepare("UPDATE subscriptions SET token_hash=?2, token_enc=?3, updated_at=?4 WHERE id=?1").bind(sub.id, await sha256Hex(token), await encrypt(token, key), now),
  ]);
  return (await getSub(env, sub.id))!;
}

/** 归档：此后只读，输出地址停止服务；删掉兜底缓存（节点内容），保留拉取记录供查看。不可撤销。 */
export async function archiveSub(env: Env, sub: SubRow): Promise<SubRow> {
  await env.DB.prepare("UPDATE subscriptions SET archived_at=?2 WHERE id=?1 AND archived_at IS NULL").bind(sub.id, Date.now()).run();
  await env.CACHE.delete(`fb:${sub.id}`);
  return (await getSub(env, sub.id))!;
}

export async function deleteSub(env: Env, sub: SubRow) {
  await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO revoked_tokens (token_hash, sub_id, revoked_at) VALUES (?1, ?2, ?3)").bind(sub.token_hash, sub.id, Date.now()),
    env.DB.prepare("DELETE FROM fetch_logs WHERE sub_id=?1").bind(sub.id),
    env.DB.prepare("DELETE FROM subscriptions WHERE id=?1").bind(sub.id),
  ]);
  await env.CACHE.delete(`fb:${sub.id}`);
}

export async function findByToken(env: Env, token: string): Promise<{ sub: SubRow | null; revoked: boolean }> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return { sub: null, revoked: false };
  const h = await sha256Hex(token);
  const sub = await env.DB.prepare("SELECT * FROM subscriptions WHERE token_hash=?1").bind(h).first<SubRow>();
  if (sub) return { sub, revoked: false };
  const rev = await env.DB.prepare("SELECT 1 AS x FROM revoked_tokens WHERE token_hash=?1").bind(h).first();
  return { sub: null, revoked: Boolean(rev) };
}

interface LogRow {
  id: number;
  sub_id: string;
  user_id: string;
  at: number;
  trigger: "client" | "preview";
  served: "fresh" | "fallback" | "error";
  http_status: number;
  upstream_status: number | null;
  script_hash: string | null;
  script_changed: number;
  proxies: number | null;
  duration_ms: number;
  bytes: number | null;
  error: string | null;
  sub_name?: string;
  user_email?: string;
}

const logView = (r: LogRow): FetchLogView => ({
  id: r.id,
  subId: r.sub_id,
  ...(r.sub_name ? { subName: r.sub_name } : {}),
  ...(r.user_email ? { userEmail: r.user_email } : {}),
  at: r.at,
  trigger: r.trigger,
  served: r.served,
  httpStatus: r.http_status,
  upstreamStatus: r.upstream_status,
  scriptHash: r.script_hash,
  scriptChanged: Boolean(r.script_changed),
  proxies: r.proxies,
  durationMs: r.duration_ms,
  bytes: r.bytes,
  error: r.error,
});

export async function listLogs(env: Env, f: { subId?: string; userId?: string; limit?: number }): Promise<FetchLogView[]> {
  const where: string[] = [];
  const args: unknown[] = [];
  if (f.subId) {
    args.push(f.subId);
    where.push(`l.sub_id=?${args.length}`);
  }
  if (f.userId) {
    args.push(f.userId);
    where.push(`l.user_id=?${args.length}`);
  }
  args.push(Math.min(Math.max(f.limit ?? 50, 1), 200));
  const sql = `SELECT l.*, s.name AS sub_name, u.email AS user_email FROM fetch_logs l
    LEFT JOIN subscriptions s ON s.id=l.sub_id LEFT JOIN users u ON u.id=l.user_id
    ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY l.id DESC LIMIT ?${args.length}`;
  return (await env.DB.prepare(sql).bind(...args).all<LogRow>()).results.map(logView);
}
