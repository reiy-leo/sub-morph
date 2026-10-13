// 投稿：用户在添加 / 编辑订阅时把自己的覆写脚本提交为官方脚本候选，管理员审核。
// 同一订阅只保留一条待审核投稿，再次提交会覆盖它。通过时生成一条官方脚本（管理员可改正则等）。
import type { Env } from "./env.ts";
import { InputError } from "./errors.ts";
import { randomId } from "./crypto.ts";
import { createOfficial, type OfficialInput } from "./official.ts";
import type { SubmissionStatus, SubmissionView } from "./shared/types.ts";

export interface SubmissionRow {
  id: string;
  user_id: string;
  sub_id: string | null;
  sub_name: string;
  source_host: string;
  suggested_pattern: string;
  source_type: "url" | "inline";
  script_url: string;
  script_content: string;
  note: string;
  status: SubmissionStatus;
  official_id: string | null;
  review_note: string;
  created_at: number;
  updated_at: number;
  reviewed_at: number | null;
  user_email?: string | null;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** 按原订阅主机名生成建议正则（整串匹配）：该主机及其子域名下的任意地址。 */
export const suggestPattern = (host: string) => `https?://([^/?#]*\\.)?${escapeRe(host.toLowerCase())}(:\\d+)?([/?#].*)?`;

export const submissionView = (r: SubmissionRow, full: boolean): SubmissionView => ({
  id: r.id,
  subId: r.sub_id,
  subName: r.sub_name,
  status: r.status,
  reviewNote: r.review_note,
  officialId: r.official_id,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  reviewedAt: r.reviewed_at,
  ...(full
    ? {
        userEmail: r.user_email ?? "",
        sourceHost: r.source_host,
        suggestedPattern: r.suggested_pattern,
        sourceType: r.source_type,
        scriptUrl: r.script_url,
        scriptContent: r.script_content,
      }
    : {}),
});

/** 提交或覆盖该订阅的待审核投稿。 */
export async function submitScript(
  env: Env,
  p: { userId: string; subId: string; subName: string; url: string; scriptMode: string; scriptUrl: string; scriptContent: string },
): Promise<void> {
  if (p.scriptMode !== "url" && p.scriptMode !== "inline") throw new InputError("只有「脚本地址」或「脚本内容」可以提交为官方脚本");
  const host = new URL(p.url).hostname;
  const sourceType = p.scriptMode;
  const now = Date.now();
  const pending = await env.DB.prepare("SELECT id FROM script_submissions WHERE sub_id=?1 AND status='pending'").bind(p.subId).first<{ id: string }>();
  if (pending) {
    await env.DB.prepare(
      "UPDATE script_submissions SET sub_name=?2, source_host=?3, suggested_pattern=?4, source_type=?5, script_url=?6, script_content=?7, updated_at=?8 WHERE id=?1",
    )
      .bind(pending.id, p.subName, host, suggestPattern(host), sourceType, sourceType === "url" ? p.scriptUrl : "", sourceType === "inline" ? p.scriptContent : "", now)
      .run();
    return;
  }
  const { n } = (await env.DB.prepare("SELECT COUNT(*) AS n FROM script_submissions WHERE user_id=?1 AND status='pending'").bind(p.userId).first<{ n: number }>()) ?? { n: 0 };
  if (n >= 20) throw new InputError("待审核的投稿太多了（最多 20 条），请等管理员处理后再提交", 429);
  await env.DB.prepare(
    `INSERT INTO script_submissions (id, user_id, sub_id, sub_name, source_host, suggested_pattern, source_type, script_url, script_content, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)`,
  )
    .bind(randomId(6), p.userId, p.subId, p.subName, host, suggestPattern(host), sourceType, sourceType === "url" ? p.scriptUrl : "", sourceType === "inline" ? p.scriptContent : "", now)
    .run();
}

/** 每个订阅最近一条投稿（给本人看状态）。 */
export async function latestSubmissions(env: Env, userId: string): Promise<Map<string, SubmissionRow>> {
  const rows = (
    await env.DB.prepare("SELECT * FROM script_submissions WHERE user_id=?1 AND sub_id IS NOT NULL ORDER BY created_at DESC").bind(userId).all<SubmissionRow>()
  ).results;
  const m = new Map<string, SubmissionRow>();
  for (const r of rows) if (r.sub_id && !m.has(r.sub_id)) m.set(r.sub_id, r);
  return m;
}

export async function listSubmissions(env: Env, status: string | null): Promise<SubmissionRow[]> {
  const where = status === "pending" || status === "approved" || status === "rejected" ? "WHERE s.status=?1" : "";
  const q = env.DB.prepare(
    `SELECT s.*, u.email AS user_email FROM script_submissions s LEFT JOIN users u ON u.id=s.user_id ${where}
     ORDER BY CASE s.status WHEN 'pending' THEN 0 ELSE 1 END, s.updated_at DESC LIMIT 200`,
  );
  return (await (where ? q.bind(status) : q).all<SubmissionRow>()).results;
}

const getSubmission = (env: Env, id: string) => env.DB.prepare("SELECT * FROM script_submissions WHERE id=?1").bind(id).first<SubmissionRow>();

/** 通过：按管理员（可能改过的）内容新建官方脚本。 */
export async function approveSubmission(env: Env, id: string, b: OfficialInput, maxScriptBytes: number) {
  const s = await getSubmission(env, id);
  if (!s) throw new InputError("投稿不存在", 404);
  if (s.status !== "pending") throw new InputError("这条投稿已经处理过了", 409);
  const official = await createOfficial(env, b, maxScriptBytes);
  await env.DB.prepare("UPDATE script_submissions SET status='approved', official_id=?2, reviewed_at=?3, updated_at=?3 WHERE id=?1").bind(id, official.id, Date.now()).run();
  return official;
}

export async function rejectSubmission(env: Env, id: string, note: unknown) {
  const s = await getSubmission(env, id);
  if (!s) throw new InputError("投稿不存在", 404);
  if (s.status !== "pending") throw new InputError("这条投稿已经处理过了", 409);
  const n = typeof note === "string" ? note.trim().slice(0, 300) : "";
  await env.DB.prepare("UPDATE script_submissions SET status='rejected', review_note=?2, reviewed_at=?3, updated_at=?3 WHERE id=?1").bind(id, n, Date.now()).run();
}
