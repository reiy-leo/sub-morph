// Google OAuth 2.0（authorization-code flow）→ HMAC 签名的 session cookie。
// 改编自 onm-personal 的实现（复制而非共享）。任意 Google 账号都能注册，首次登录写入 users 表；
// ADMIN_EMAILS 里的邮箱是管理员（每次请求重新判断）。
//
//   GET  /auth/login     写 state cookie，302 到 Google（scope: openid email profile）
//   GET  /auth/callback  校验 state → 换 code → 校验 id_token → upsert users → session cookie → 302
//   POST /auth/logout
//
// 回调出错时 302 到 "/?login_error=<code>"，由首页解释原因。
import { googleConfigured, isAdminEmail, isAuthDisabled, type Env } from "./env.ts";
import { randomId } from "./crypto.ts";
import { getCookie, randomToken, setCookie, sign, verify } from "./session.ts";

export const SESSION_COOKIE = "sm_session";
export const STATE_COOKIE = "sm_oauth_state";
export const SESSION_TTL = 60 * 60 * 24 * 30; // 30 天
const STATE_TTL = 600;

export interface SessionUser { uid: string; email: string; name?: string; picture?: string; exp: number }
interface OAuthState { nonce: string; oidcNonce: string; returnTo: string; exp: number }

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

import type { LoginError, SessionInfo } from "./shared/types.ts";

const now = () => Math.floor(Date.now() / 1000);
const isSecure = (req: Request) => new URL(req.url).protocol === "https:";
const redirectUri = (req: Request, env: Env) => env.OAUTH_REDIRECT_URI || new URL("/auth/callback", req.url).toString();

/** 当前登录用户；未登录、会话过期或账号被停用都返回 null。 */
export async function getUser(req: Request, env: Env): Promise<SessionInfo | null> {
  if (isAuthDisabled(env, req)) {
    const email = (env.ADMIN_EMAILS ?? "dev@localhost").split(",")[0]!.trim().toLowerCase() || "dev@localhost";
    const id = await upsertUser(env, { sub: "dev", email, name: "本地开发" });
    return { id, email, name: "本地开发", admin: true };
  }
  if (!env.SESSION_SECRET) return null;
  const s = await verify<SessionUser>(getCookie(req, SESSION_COOKIE), env.SESSION_SECRET);
  if (!s) return null;
  const row = await env.DB.prepare("SELECT disabled FROM users WHERE id=?1").bind(s.uid).first<{ disabled: number }>();
  if (!row || row.disabled) return null;
  return { id: s.uid, email: s.email, ...(s.name ? { name: s.name } : {}), ...(s.picture ? { picture: s.picture } : {}), admin: isAdminEmail(env, s.email) };
}

async function upsertUser(env: Env, u: { sub: string; email: string; name?: string; picture?: string }): Promise<string> {
  const now = Date.now();
  const row = await env.DB.prepare(
    `INSERT INTO users (id, google_sub, email, name, picture, created_at, last_login_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
     ON CONFLICT (google_sub) DO UPDATE SET email=?3, name=?4, picture=?5, last_login_at=?6 RETURNING id, disabled`,
  )
    .bind(randomId(8), u.sub, u.email, u.name ?? null, u.picture ?? null, now)
    .first<{ id: string; disabled: number }>();
  if (row?.disabled) throw new Error("disabled");
  return row!.id;
}

function safeReturnTo(v: string | null | undefined): string {
  if (!v || !v.startsWith("/") || v.startsWith("//") || v.startsWith("/\\")) return "/";
  // 登录成功后不要再带着上一次的 login_error 回去
  const u = new URL(v, "https://x.invalid");
  u.searchParams.delete("login_error");
  return u.pathname + u.search + u.hash;
}

const backHome = (req: Request, error: LoginError) => {
  const headers = new Headers({ Location: `/?login_error=${error}`, "Cache-Control": "no-store" });
  headers.append("Set-Cookie", setCookie(STATE_COOKIE, "", { maxAge: 0, secure: isSecure(req), path: "/auth" }));
  return new Response(null, { status: 302, headers });
};

/** GET /auth/login[?returnTo=/edit/xxx] */
export async function login(req: Request, env: Env): Promise<Response> {
  if (!googleConfigured(env)) return backHome(req, "unconfigured");
  const url = new URL(req.url);
  const nonce = randomToken();
  const oidcNonce = randomToken();
  const state = await sign(
    { nonce, oidcNonce, returnTo: safeReturnTo(url.searchParams.get("returnTo")), exp: now() + STATE_TTL } satisfies OAuthState,
    env.SESSION_SECRET!,
  );
  const google = new URL(GOOGLE_AUTH_URL);
  google.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(req, env),
    response_type: "code",
    scope: "openid email profile",
    state: nonce,
    nonce: oidcNonce,
    prompt: "select_account",
  }).toString();
  return new Response(null, {
    status: 302,
    headers: {
      Location: google.toString(),
      "Cache-Control": "no-store",
      "Set-Cookie": setCookie(STATE_COOKIE, state, { maxAge: STATE_TTL, secure: isSecure(req), path: "/auth" }),
    },
  });
}

function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  const part = jwt.split(".")[1];
  if (!part) return null;
  try {
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((part.length + 3) % 4);
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const v = JSON.parse(new TextDecoder().decode(bytes));
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
}

/** GET /auth/callback?code=…&state=… */
export async function callback(req: Request, env: Env): Promise<Response> {
  if (!googleConfigured(env)) return backHome(req, "unconfigured");
  const url = new URL(req.url);
  if (url.searchParams.get("error")) return backHome(req, "denied");

  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");
  const state = await verify<OAuthState>(getCookie(req, STATE_COOKIE), env.SESSION_SECRET!);
  if (!code || !stateParam || !state || state.nonce !== stateParam) return backHome(req, "state");

  let idToken: string | undefined;
  try {
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID!,
        client_secret: env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: redirectUri(req, env),
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) {
      console.error("google token exchange failed", tokenRes.status, await tokenRes.text().catch(() => ""));
      return backHome(req, "token");
    }
    idToken = ((await tokenRes.json()) as { id_token?: string }).id_token;
  } catch (e) {
    console.error("google token exchange error", e);
    return backHome(req, "token");
  }
  if (!idToken) return backHome(req, "id_token");

  // id_token 直接来自 Google token 端点（TLS），按 OIDC Core §3.1.3.7 无需再验签，但 claims 必须匹配。
  const c = decodeJwtPayload(idToken);
  if (
    !c ||
    !GOOGLE_ISSUERS.includes(String(c.iss)) ||
    c.aud !== env.GOOGLE_CLIENT_ID ||
    typeof c.exp !== "number" || c.exp < now() ||
    c.nonce !== state.oidcNonce ||
    typeof c.sub !== "string" || typeof c.email !== "string"
  ) return backHome(req, "id_token");
  if (c.email_verified !== true && c.email_verified !== "true") return backHome(req, "unverified");

  const email = c.email.trim().toLowerCase();
  const name = typeof c.name === "string" ? c.name.slice(0, 100) : undefined;
  const picture = typeof c.picture === "string" && c.picture.startsWith("https://") && c.picture.length < 600 ? c.picture : undefined;
  let uid: string;
  try {
    uid = await upsertUser(env, { sub: c.sub, email, name, picture });
  } catch {
    return backHome(req, "disabled");
  }

  const user: SessionUser = { uid, email, ...(name ? { name } : {}), ...(picture ? { picture } : {}), exp: now() + SESSION_TTL };
  const session = await sign(user, env.SESSION_SECRET!);
  const headers = new Headers({ Location: safeReturnTo(state.returnTo), "Cache-Control": "no-store" });
  headers.append("Set-Cookie", setCookie(SESSION_COOKIE, session, { maxAge: SESSION_TTL, secure: isSecure(req) }));
  headers.append("Set-Cookie", setCookie(STATE_COOKIE, "", { maxAge: 0, secure: isSecure(req), path: "/auth" }));
  return new Response(null, { status: 302, headers });
}

/** POST /auth/logout */
export function logout(req: Request): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: "/", "Cache-Control": "no-store", "Set-Cookie": setCookie(SESSION_COOKIE, "", { maxAge: 0, secure: isSecure(req) }) },
  });
}
