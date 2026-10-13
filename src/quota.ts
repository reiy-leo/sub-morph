// 限流与每日配额：D1 计数表 usage(key, day, count)，原子 upsert。
import type { Env } from "./env.ts";

const today = () => new Date().toISOString().slice(0, 10);
const minute = () => new Date().toISOString().slice(0, 16);

/** 计数 +1 并返回新值。 */
export async function bump(env: Env, key: string, bucket: string): Promise<number> {
  const row = await env.DB.prepare(
    "INSERT INTO usage (key, day, count) VALUES (?1, ?2, 1) ON CONFLICT (key, day) DO UPDATE SET count = count + 1 RETURNING count",
  )
    .bind(key, bucket)
    .first<{ count: number }>();
  return row?.count ?? 1;
}

export const bumpDaily = (env: Env, key: string) => bump(env, key, today());
export const bumpMinute = (env: Env, key: string) => bump(env, key, minute());

/** 清理两天前的计数（定时任务里调用）。 */
export async function pruneUsage(env: Env) {
  const cutoff = new Date(Date.now() - 2 * 86400_000).toISOString().slice(0, 10);
  await env.DB.prepare("DELETE FROM usage WHERE day < ?1").bind(cutoff).run();
}
