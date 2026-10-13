// 解析订阅要用的覆写脚本：内联 / 远端 URL / 官方脚本。远端脚本缓存在 D1 script_cache（默认 300 秒）并记录 hash。
import { scriptCacheSeconds, limitsOf, type Env } from "./env.ts";
import { sha256Hex } from "./crypto.ts";
import { getOfficial } from "./official.ts";
import { statusLabel } from "./shared/status.ts";
import type { ScriptMode } from "./shared/types.ts";
import { scrubUrls } from "./urls.ts";

export class ScriptFetchError extends Error {}

export interface ResolvedScript {
  code: string;
  hash: string;
  /** 官方脚本 id（用于更新 official_scripts 的 hash 记录）。 */
  officialId?: string;
}

async function fetchScript(env: Env, url: string): Promise<{ code: string; hash: string }> {
  const urlHash = await sha256Hex(url);
  const ttl = scriptCacheSeconds(env) * 1000;
  const cached = await env.DB.prepare("SELECT content, hash, fetched_at FROM script_cache WHERE url_hash=?1").bind(urlHash).first<{ content: string; hash: string; fetched_at: number }>();
  if (cached && Date.now() - cached.fetched_at < ttl) return { code: cached.content, hash: cached.hash };

  const max = limitsOf(env).maxScriptKB * 1024;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "sub-morph/1.0 (+https://sub-morph.rei8t.dev)", Accept: "text/plain, application/javascript, */*" }, signal: AbortSignal.timeout(10_000), redirect: "follow" });
    if (!res.ok) throw new ScriptFetchError(`脚本地址返回 ${statusLabel(res.status)}`);
    const code = await res.text();
    if (new TextEncoder().encode(code).length > max) throw new ScriptFetchError(`脚本超过 ${max / 1024} KB 上限`);
    if (/^\s*<(!doctype|html)/i.test(code)) throw new ScriptFetchError("脚本地址返回的是网页，不是 JS（链接是否指向 raw 文件？）");
    const hash = await sha256Hex(code);
    await env.DB.prepare(
      "INSERT INTO script_cache (url_hash, content, hash, fetched_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT (url_hash) DO UPDATE SET content=?2, hash=?3, fetched_at=?4",
    )
      .bind(urlHash, code, hash, Date.now())
      .run();
    return { code, hash };
  } catch (e) {
    // 拉取失败但有旧缓存：用旧版本继续工作
    if (cached) return { code: cached.content, hash: cached.hash };
    if (e instanceof ScriptFetchError) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    throw new ScriptFetchError(/timed? ?out|abort/i.test(msg) ? "拉取脚本超时（408 请求超时）" : `拉取脚本失败：${scrubUrls(msg)}`);
  }
}

export interface ScriptSource {
  script_mode: ScriptMode;
  official_id: string | null;
  script_url: string;
  script_content: string;
}

export async function resolveScript(env: Env, s: ScriptSource): Promise<ResolvedScript | null> {
  if (s.script_mode === "inline") return s.script_content.trim() ? { code: s.script_content, hash: await sha256Hex(s.script_content) } : null;
  if (s.script_mode === "url") return s.script_url ? fetchScript(env, s.script_url) : null;
  if (s.script_mode === "official" && s.official_id) {
    const o = await getOfficial(env, s.official_id);
    if (!o) throw new ScriptFetchError("所选官方脚本已被删除");
    if (!o.enabled) throw new ScriptFetchError("所选官方脚本已停用");
    const r = o.source_type === "inline" ? { code: o.script_content, hash: await sha256Hex(o.script_content) } : await fetchScript(env, o.script_url);
    const now = Date.now();
    if (r.hash !== o.last_hash) {
      await env.DB.prepare("UPDATE official_scripts SET last_hash=?2, last_fetched_at=?3, last_changed_at=?3 WHERE id=?1").bind(o.id, r.hash, now).run();
    } else if (o.source_type === "url") {
      await env.DB.prepare("UPDATE official_scripts SET last_fetched_at=?2 WHERE id=?1").bind(o.id, now).run();
    }
    return { ...r, officialId: o.id };
  }
  return null;
}

/** 管理员「立即拉取」：跳过缓存，返回最新 hash 与是否变化。 */
export async function refreshOfficial(env: Env, id: string): Promise<{ hash: string; changed: boolean }> {
  const o = await getOfficial(env, id);
  if (!o) throw new ScriptFetchError("官方脚本不存在");
  if (o.source_type === "url") await env.DB.prepare("DELETE FROM script_cache WHERE url_hash=?1").bind(await sha256Hex(o.script_url)).run();
  const before = o.last_hash;
  const r = await resolveScript(env, { script_mode: "official", official_id: id, script_url: "", script_content: "" });
  return { hash: r!.hash, changed: before !== null && before !== r!.hash };
}
