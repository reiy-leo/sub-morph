// 官方脚本：管理员维护的「正则 + 脚本」对。正则整串匹配原订阅 URL（从开头到结尾），命中后用户可一键使用。
import type { Env } from "./env.ts";
import { InputError } from "./errors.ts";
import { randomId } from "./crypto.ts";
import { compilePattern } from "./shared/pattern.ts";
import type { OfficialMatch, OfficialScriptView } from "./shared/types.ts";

export interface OfficialRow {
  id: string;
  name: string;
  description: string;
  pattern: string;
  source_type: "url" | "inline";
  script_url: string;
  script_content: string;
  enabled: number;
  priority: number;
  last_hash: string | null;
  last_fetched_at: number | null;
  last_changed_at: number | null;
  created_at: number;
  updated_at: number;
}

export const officialView = (r: OfficialRow): OfficialScriptView => ({
  id: r.id,
  name: r.name,
  description: r.description,
  pattern: r.pattern,
  sourceType: r.source_type,
  scriptUrl: r.script_url,
  scriptContent: r.script_content,
  enabled: Boolean(r.enabled),
  priority: r.priority,
  lastHash: r.last_hash,
  lastFetchedAt: r.last_fetched_at,
  lastChangedAt: r.last_changed_at,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export async function listOfficial(env: Env): Promise<OfficialRow[]> {
  return (await env.DB.prepare("SELECT * FROM official_scripts ORDER BY priority DESC, created_at ASC").all<OfficialRow>()).results;
}

export const getOfficial = (env: Env, id: string) => env.DB.prepare("SELECT * FROM official_scripts WHERE id = ?1").bind(id).first<OfficialRow>();

const compile = compilePattern;

/** 第一个命中的已启用官方脚本（priority 大的优先）。 */
export async function matchOfficial(env: Env, url: string): Promise<OfficialMatch | null> {
  for (const r of await listOfficial(env)) {
    if (!r.enabled) continue;
    if (compile(r.pattern)?.test(url)) return { id: r.id, name: r.name, description: r.description };
  }
  return null;
}

export interface OfficialInput {
  name?: unknown;
  description?: unknown;
  pattern?: unknown;
  sourceType?: unknown;
  scriptUrl?: unknown;
  scriptContent?: unknown;
  enabled?: unknown;
  priority?: unknown;
}

function validate(b: OfficialInput, maxScriptBytes: number) {
  const name = typeof b.name === "string" ? b.name.trim().slice(0, 60) : "";
  if (!name) throw new InputError("请填写名称");
  const pattern = typeof b.pattern === "string" ? b.pattern.trim() : "";
  if (!pattern || pattern.length > 500) throw new InputError("请填写正则（不超过 500 字）");
  if (!compile(pattern)) throw new InputError("正则语法不正确");
  const sourceType = b.sourceType === "inline" ? "inline" : "url";
  const scriptUrl = typeof b.scriptUrl === "string" ? b.scriptUrl.trim() : "";
  const scriptContent = typeof b.scriptContent === "string" ? b.scriptContent : "";
  if (sourceType === "url" && !/^https?:\/\/\S+$/i.test(scriptUrl)) throw new InputError("脚本地址需要是 http(s) 链接");
  if (sourceType === "inline" && !scriptContent.trim()) throw new InputError("请填写脚本内容");
  if (new TextEncoder().encode(scriptContent).length > maxScriptBytes) throw new InputError("脚本太大");
  return {
    name,
    description: typeof b.description === "string" ? b.description.trim().slice(0, 300) : "",
    pattern,
    sourceType,
    scriptUrl: sourceType === "url" ? scriptUrl : "",
    scriptContent: sourceType === "inline" ? scriptContent : "",
    enabled: b.enabled === false ? 0 : 1,
    priority: Number.isFinite(Number(b.priority)) ? Math.trunc(Number(b.priority)) : 0,
  };
}

export async function createOfficial(env: Env, b: OfficialInput, maxScriptBytes: number): Promise<OfficialRow> {
  const v = validate(b, maxScriptBytes);
  const id = randomId(6);
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO official_scripts (id, name, description, pattern, source_type, script_url, script_content, enabled, priority, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)`,
  )
    .bind(id, v.name, v.description, v.pattern, v.sourceType, v.scriptUrl, v.scriptContent, v.enabled, v.priority, now)
    .run();
  return (await getOfficial(env, id))!;
}

export async function updateOfficial(env: Env, id: string, b: OfficialInput, maxScriptBytes: number): Promise<OfficialRow> {
  const old = await getOfficial(env, id);
  if (!old) throw new InputError("官方脚本不存在", 404);
  const v = validate(b, maxScriptBytes);
  const sourceChanged = v.sourceType !== old.source_type || v.scriptUrl !== old.script_url || v.scriptContent !== old.script_content;
  await env.DB.prepare(
    `UPDATE official_scripts SET name=?2, description=?3, pattern=?4, source_type=?5, script_url=?6, script_content=?7, enabled=?8, priority=?9, updated_at=?10
     ${sourceChanged ? ", last_hash=NULL, last_fetched_at=NULL" : ""} WHERE id=?1`,
  )
    .bind(id, v.name, v.description, v.pattern, v.sourceType, v.scriptUrl, v.scriptContent, v.enabled, v.priority, Date.now())
    .run();
  return (await getOfficial(env, id))!;
}

export async function deleteOfficial(env: Env, id: string): Promise<boolean> {
  // 用到它的订阅改为「不使用脚本」，避免悬空
  await env.DB.prepare("UPDATE subscriptions SET script_mode='none', official_id=NULL, updated_at=?2 WHERE official_id=?1").bind(id, Date.now()).run();
  const r = await env.DB.prepare("DELETE FROM official_scripts WHERE id=?1").bind(id).run();
  return (r.meta.changes ?? 0) > 0;
}
