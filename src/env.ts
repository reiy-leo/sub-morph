import type { Limits } from "./shared/types.ts";

export interface Env {
  /** D1：users / subscriptions / official_scripts / fetch_logs / script_cache / usage / revoked_tokens（migrations/）。 */
  DB: D1Database;
  /** KV：兜底缓存（加密的上次成功输出），key `fb:<subId>`。 */
  CACHE: KVNamespace;
  /** Workers Static Assets：web/ 构建出的前端（public/）。 */
  ASSETS?: Fetcher;

  // secrets
  SESSION_SECRET?: string;
  /** 加密原订阅地址、输出密钥与兜底缓存（AES-GCM），与 SESSION_SECRET 分开。 */
  ENCRYPTION_KEY?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;

  // vars
  /** 管理员 Google 邮箱，逗号分隔。 */
  ADMIN_EMAILS?: string;
  /** 每个用户最多订阅数，默认 20。 */
  MAX_SUBS?: string;
  /** 每个订阅每天最多被客户端拉取次数，默认 300。 */
  DAILY_PULLS?: string;
  /** 每个用户每天最多试运行次数，默认 100。 */
  DAILY_PREVIEWS?: string;
  /** 每个 IP 每分钟最多拉取输出地址次数，默认 30。 */
  IP_PER_MINUTE?: string;
  /** 脚本大小上限（KB），默认 256。 */
  MAX_SCRIPT_KB?: string;
  /** 脚本执行超时（毫秒），默认 3000。 */
  SCRIPT_TIMEOUT_MS?: string;
  /** 脚本内存上限（MB），默认 48。 */
  SCRIPT_MEMORY_MB?: string;
  /** 远端脚本缓存秒数，默认 300。 */
  SCRIPT_CACHE_SECONDS?: string;
  /** 原订阅大小上限（MB），默认 5。 */
  MAX_SUB_MB?: string;
  OAUTH_REDIRECT_URI?: string;
  /** "true" = 跳过登录（假用户）。只对 localhost 生效，仅供本地开发。 */
  AUTH_DISABLED?: string;
}

export const isAuthDisabled = (env: Env, req: Request) => {
  if ((env.AUTH_DISABLED ?? "").trim().toLowerCase() !== "true") return false;
  const host = new URL(req.url).hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
};

export const googleConfigured = (env: Env) => Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.SESSION_SECRET);

export const adminEmails = (env: Env): string[] =>
  (env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

export const isAdminEmail = (env: Env, email: string) => adminEmails(env).includes(email.toLowerCase());

const num = (v: string | undefined, d: number, max = Infinity) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : d;
};

export const limitsOf = (env: Env): Limits => ({
  maxSubs: num(env.MAX_SUBS, 20),
  dailyPulls: num(env.DAILY_PULLS, 300),
  dailyPreviews: num(env.DAILY_PREVIEWS, 100),
  maxScriptKB: num(env.MAX_SCRIPT_KB, 256, 1024),
  scriptTimeoutMs: num(env.SCRIPT_TIMEOUT_MS, 3000, 20000),
  scriptMemoryMB: num(env.SCRIPT_MEMORY_MB, 48, 96),
});

export const ipPerMinute = (env: Env) => num(env.IP_PER_MINUTE, 30);
export const scriptCacheSeconds = (env: Env) => num(env.SCRIPT_CACHE_SECONDS, 300);
export const maxSubBytes = (env: Env) => num(env.MAX_SUB_MB, 5, 20) * 1024 * 1024;
