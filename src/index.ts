// sub-morph（Subscription Braces / 订阅矫正）：拉取原订阅 → 套用覆写脚本 → 输出成品订阅。
//
// 输出（公开，靠不可猜的密钥）：
//   GET  /s/:token                 成品订阅（客户端导入这个地址）；刷新地址后旧地址返回 410 已失效
// 页面：/（首页 / 我的订阅）、/admin（管理后台）、/privacy（隐私与免责）、/licenses（第三方许可证）
// 登录：GET /auth/login | /auth/callback, POST /auth/logout（Google OAuth，任意 Google 账号）
// API（需登录）：
//   GET    /api/me
//   POST   /api/official {url}             命中该订阅地址的全部官方脚本（id / 名称 / 说明），供用户点选
//   GET    /api/subs                       我的订阅
//   POST   /api/subs                       新建
//   GET    /api/subs/:id                   详情
//   PUT    /api/subs/:id                   编辑（输出地址不变）
//   DELETE /api/subs/:id                   删除
//   POST   /api/subs/:id/rotate            刷新输出地址
//   POST   /api/subs/:id/preview           试运行（不影响客户端）
//   GET    /api/subs/:id/logs              最近拉取记录
//   POST   /api/match {url}                原订阅是否命中官方脚本
// 管理员 API：
//   GET/POST /api/admin/official, PUT/DELETE /api/admin/official/:id, POST /api/admin/official/:id/refresh
//   GET /api/admin/submissions?status=, POST /api/admin/submissions/:id/approve|reject   用户投稿的官方脚本候选
//   GET /api/admin/users, GET /api/admin/subs, GET /api/admin/logs?sub=&user=
import { callback, getUser, login, logout } from "./auth.ts";
import { approveSubmission, listSubmissions, rejectSubmission, submissionView } from "./submissions.ts";
import { googleConfigured, ipPerMinute, limitsOf, type Env } from "./env.ts";
import { InputError } from "./errors.ts";
import { renderPage } from "./html.ts";
import { createOfficial, deleteOfficial, getOfficial, listOfficial, matchAllOfficial, matchOfficial, officialView, updateOfficial } from "./official.ts";
import { runPipeline } from "./pipeline.ts";
import { bumpDaily, bumpMinute, pruneUsage } from "./quota.ts";
import { refreshOfficial, ScriptFetchError } from "./scripts.ts";
import { statusLabel } from "./shared/status.ts";
import type { LoginError, PageData, PageKind, SessionInfo, UserView } from "./shared/types.ts";
import { createSub, deleteSub, findByToken, getSub, listLogs, listSubs, rotateToken, toSubView, updateSub, type SubInput } from "./subs.ts";
import { isAdminEmail } from "./env.ts";

const LOGIN_ERRORS = new Set<LoginError>(["unconfigured", "denied", "state", "token", "id_token", "unverified", "disabled"]);

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

const sameOrigin = (req: Request) => {
  const o = req.headers.get("Origin");
  return o === null ? req.method === "GET" || req.method === "HEAD" : o === new URL(req.url).origin;
};

async function body<T>(req: Request): Promise<Partial<T>> {
  const b = await req.json().catch(() => null);
  if (!b || typeof b !== "object" || Array.isArray(b)) throw new InputError("请求体需要是 JSON 对象");
  return b as Partial<T>;
}

const ID = "([A-Za-z0-9]{6,16})";

async function handleApi(req: Request, env: Env, path: string, url: URL): Promise<Response> {
  const user = await getUser(req, env);
  if (path === "/api/me") return json({ user, limits: limitsOf(env) });
  if (!user) return json({ error: "需要登录", code: "unauthorized" }, 401);
  if (req.method !== "GET" && !sameOrigin(req)) return json({ error: "来源不合法" }, 403);
  const m = req.method;
  const origin = url.origin;
  const selfHost = url.hostname;
  let r: RegExpExecArray | null;
  try {
    if (path === "/api/subs" && m === "GET") {
      const rows = await listSubs(env, user.id);
      return json({ subs: await Promise.all(rows.map((s) => toSubView(env, s, { origin, owner: true }))) });
    }
    if (path === "/api/subs" && m === "POST") {
      const row = await createSub(env, user.id, await body<SubInput>(req), selfHost);
      return json({ sub: await toSubView(env, row, { origin, owner: true }) }, 201);
    }
    if (path === "/api/official" && m === "POST") {
      // 「获取」按钮：返回命中该订阅地址的全部已启用官方脚本（名称和说明）
      const u = (await body<{ url: string }>(req)).url;
      if (typeof u !== "string" || !/^https?:\/\/\S+$/i.test(u.trim())) throw new InputError("请先填写原订阅地址");
      return json({ scripts: await matchAllOfficial(env, u.trim()) });
    }
    if (path === "/api/match" && m === "POST") {
      const u = (await body<{ url: string }>(req)).url;
      return json({ match: typeof u === "string" && u.trim() ? await matchOfficial(env, u.trim()) : null });
    }
    if ((r = new RegExp(`^/api/subs/${ID}(/[a-z]+)?$`).exec(path))) {
      const sub = await getSub(env, r[1]!);
      // 只能操作自己的订阅；管理员可以只读查看别人的日志
      const own = sub && sub.user_id === user.id;
      const action = r[2] ?? "";
      if (!sub || (!own && !(user.admin && action === "/logs" && m === "GET"))) return json({ error: "订阅不存在" }, 404);
      if (action === "" && m === "GET") return json({ sub: await toSubView(env, sub, { origin, owner: true }) });
      if (action === "" && m === "PUT") return json({ sub: await toSubView(env, await updateSub(env, sub, await body<SubInput>(req), selfHost), { origin, owner: true }) });
      if (action === "" && m === "DELETE") {
        await deleteSub(env, sub);
        return json({ ok: true });
      }
      if (action === "/rotate" && m === "POST") return json({ sub: await toSubView(env, await rotateToken(env, sub), { origin, owner: true }) });
      if (action === "/preview" && m === "POST") {
        const n = await bumpDaily(env, `preview:${user.id}`);
        if (n > limitsOf(env).dailyPreviews) return json({ error: `今天的试运行次数已用完（每天 ${limitsOf(env).dailyPreviews} 次，429 请求太频繁）` }, 429);
        const res = await runPipeline(env, sub, { trigger: "preview", clientUA: null });
        const fresh = await getSub(env, sub.id);
        return json({ result: res.preview, sub: fresh ? await toSubView(env, fresh, { origin, owner: true }) : null });
      }
      if (action === "/logs" && m === "GET") return json({ logs: await listLogs(env, { subId: sub.id, limit: Number(url.searchParams.get("limit") ?? 30) }) });
    }

    // ---------- 管理员 ----------
    if (path.startsWith("/api/admin/")) {
      if (!user.admin) return json({ error: "只有管理员可以访问（403 禁止访问）" }, 403);
      const maxScript = limitsOf(env).maxScriptKB * 1024;
      if (path === "/api/admin/official" && m === "GET") return json({ scripts: (await listOfficial(env)).map(officialView) });
      if (path === "/api/admin/official" && m === "POST") return json({ script: officialView(await createOfficial(env, await body(req), maxScript)) }, 201);
      if ((r = new RegExp(`^/api/admin/official/${ID}(/refresh)?$`).exec(path))) {
        const id = r[1]!;
        if (r[2] && m === "POST") {
          try {
            const res = await refreshOfficial(env, id);
            return json({ ...res, script: officialView((await getOfficial(env, id))!) });
          } catch (e) {
            if (e instanceof ScriptFetchError) return json({ error: e.message }, 502);
            throw e;
          }
        }
        if (m === "PUT") return json({ script: officialView(await updateOfficial(env, id, await body(req), maxScript)) });
        if (m === "DELETE") return (await deleteOfficial(env, id)) ? json({ ok: true }) : json({ error: "官方脚本不存在" }, 404);
      }
      if (path === "/api/admin/submissions" && m === "GET") {
        return json({ submissions: (await listSubmissions(env, url.searchParams.get("status"))).map((x) => submissionView(x, true)) });
      }
      if ((r = new RegExp(`^/api/admin/submissions/${ID}/(approve|reject)$`).exec(path)) && m === "POST") {
        if (r[2] === "approve") return json({ script: officialView(await approveSubmission(env, r[1]!, await body(req), maxScript)) });
        await rejectSubmission(env, r[1]!, (await body<{ note: string }>(req)).note);
        return json({ ok: true });
      }
      if (path === "/api/admin/users" && m === "GET") {
        const rows = (
          await env.DB.prepare(
            "SELECT u.*, (SELECT COUNT(*) FROM subscriptions s WHERE s.user_id=u.id) AS subs FROM users u ORDER BY u.last_login_at DESC LIMIT 500",
          ).all<{ id: string; email: string; name: string | null; picture: string | null; created_at: number; last_login_at: number; subs: number }>()
        ).results;
        const users: UserView[] = rows.map((u) => ({ id: u.id, email: u.email, name: u.name, picture: u.picture, createdAt: u.created_at, lastLoginAt: u.last_login_at, subs: u.subs, admin: isAdminEmail(env, u.email) }));
        return json({ users });
      }
      if (path === "/api/admin/subs" && m === "GET") {
        const rows = await listSubs(env, url.searchParams.get("user"));
        const emails = new Map(
          (await env.DB.prepare("SELECT id, email FROM users").all<{ id: string; email: string }>()).results.map((u) => [u.id, u.email]),
        );
        // 管理员只看脱敏主机名，不解密原订阅地址和输出地址
        const subs = await Promise.all(rows.map(async (s) => ({ ...(await toSubView(env, s, { origin, owner: false })), userEmail: emails.get(s.user_id) ?? "" })));
        return json({ subs });
      }
      if (path === "/api/admin/logs" && m === "GET") {
        const p = url.searchParams;
        return json({ logs: await listLogs(env, { subId: p.get("sub") ?? undefined, userId: p.get("user") ?? undefined, limit: Number(p.get("limit") ?? 100) }) });
      }
    }
    return json({ error: "未找到（404 不存在）" }, 404);
  } catch (e) {
    if (e instanceof InputError) return json({ error: e.message }, e.status);
    console.error("api error", e);
    return json({ error: e instanceof Error ? e.message : "服务器错误" }, 500);
  }
}

const textResponse = (status: number, msg: string, extra: Record<string, string> = {}) =>
  new Response(`sub-morph：${statusLabel(status)}\n${msg}\n`, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...extra },
  });

/** GET /s/:token —— 成品订阅。 */
async function serveOutput(req: Request, env: Env, token: string): Promise<Response> {
  const ip = req.headers.get("CF-Connecting-IP") ?? "unknown";
  if ((await bumpMinute(env, `ip:${ip}`)) > ipPerMinute(env)) return textResponse(429, "请求太频繁，请稍后再试", { "Retry-After": "60" });
  const { sub, revoked } = await findByToken(env, token);
  if (!sub) return revoked ? textResponse(410, "这个订阅地址已被刷新或删除，请在 Subscription Braces 里复制新的地址") : textResponse(404, "订阅地址不存在");
  const limit = limitsOf(env).dailyPulls;
  if ((await bumpDaily(env, `pull:${sub.id}`)) > limit) return textResponse(429, `这个订阅今天已被拉取超过 ${limit} 次，明天自动恢复`, { "Retry-After": "3600" });
  const res = await runPipeline(env, sub, { trigger: "client", clientUA: req.headers.get("User-Agent") });
  return new Response(req.method === "HEAD" ? null : res.body, {
    status: res.status,
    headers: { ...res.headers, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "X-Sub-Morph-Served": res.served },
  });
}

const PAGES: Record<string, PageKind> = { "/": "home", "/admin": "admin", "/privacy": "privacy", "/licenses": "licenses" };

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const readMethod = req.method === "GET" || req.method === "HEAD";
    let r: RegExpExecArray | null;

    if ((r = /^\/s\/([A-Za-z0-9_-]+)$/.exec(path))) {
      if (!readMethod) return textResponse(405, "只支持 GET");
      return serveOutput(req, env, r[1]!);
    }
    if (path === "/auth/login" && req.method === "GET") return login(req, env);
    if (path === "/auth/callback" && req.method === "GET") return callback(req, env);
    if (path === "/auth/logout" && req.method === "POST") return logout(req);
    if (path.startsWith("/api/")) return handleApi(req, env, path, url);
    if (path === "/health") return json({ ok: true });
    if (path === "/robots.txt") return new Response("User-agent: *\nAllow: /$\nAllow: /privacy\nDisallow: /\n", { headers: { "Content-Type": "text/plain" } });
    if (path.startsWith("/assets/") && env.ASSETS) return env.ASSETS.fetch(req);
    if (!readMethod) return new Response("405 不支持该方法", { status: 405 });

    const user: SessionInfo | null = await getUser(req, env).catch(() => null);
    const kind = PAGES[path] ?? "notfound";
    const err = url.searchParams.get("login_error") as LoginError | null;
    const data: PageData = {
      kind: kind === "admin" && !user?.admin ? (user ? "notfound" : "admin") : kind,
      user,
      loginError: !user && err && LOGIN_ERRORS.has(err) ? err : null,
      limits: limitsOf(env),
      origin: url.origin,
      loginReady: googleConfigured(env),
    };
    return renderPage(env, req, data, data.kind === "notfound" ? 404 : 200);
  },

  async scheduled(_c: ScheduledController, env: Env): Promise<void> {
    const cutoff = Date.now() - 30 * 86400_000;
    await pruneUsage(env);
    await env.DB.batch([
      env.DB.prepare("DELETE FROM fetch_logs WHERE at < ?1").bind(cutoff),
      env.DB.prepare("DELETE FROM script_cache WHERE fetched_at < ?1").bind(Date.now() - 7 * 86400_000),
      env.DB.prepare("DELETE FROM revoked_tokens WHERE revoked_at < ?1").bind(Date.now() - 180 * 86400_000),
    ]);
  },
} satisfies ExportedHandler<Env>;
