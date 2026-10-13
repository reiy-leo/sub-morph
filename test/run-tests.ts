// 用 node:sqlite 模拟 D1、内存 Map 模拟 KV、替换全局 fetch 模拟原订阅与脚本地址，跑一遍核心流程：
//   node --experimental-strip-types test/run-tests.ts（pnpm test）
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import worker from "../src/index.ts";
import type { Env } from "../src/env.ts";
import { parseQx, serializeQx } from "../src/formats/qx.ts";
import { maskHost, scrubUrls } from "../src/urls.ts";

// ---- 假 D1 ----
const sqlite = new DatabaseSync(":memory:");
sqlite.exec(readFileSync(new URL("../migrations/0001_init.sql", import.meta.url), "utf8"));
class Stmt {
  args: unknown[] = [];
  sql: string;
  constructor(sql: string) { this.sql = sql; }
  bind(...a: unknown[]) { this.args = a.map((x) => (x === undefined ? null : typeof x === "boolean" ? Number(x) : x)); return this; }
  private st() { return sqlite.prepare(this.sql); }
  async first<T>() { return (this.st().get(...(this.args as never[])) as T) ?? null; }
  async all<T>() { return { results: this.st().all(...(this.args as never[])).map((r) => ({ ...r })) as T[] }; }
  async run() { const r = this.st().run(...(this.args as never[])); return { success: true, meta: { changes: Number(r.changes) } }; }
}
const DB = {
  prepare: (sql: string) => new Stmt(sql),
  async batch(stmts: Stmt[]) {
    sqlite.exec("BEGIN");
    try { for (const s of stmts) await s.run(); sqlite.exec("COMMIT"); } catch (e) { sqlite.exec("ROLLBACK"); throw e; }
    return [];
  },
};
// ---- 假 KV ----
const kv = new Map<string, string>();
const CACHE = { get: async (k: string) => kv.get(k) ?? null, put: async (k: string, v: string) => void kv.set(k, v), delete: async (k: string) => void kv.delete(k) };
const SHELL = "<!doctype html><html><head><title>x</title><!--PAGE_DATA--></head><body><div id=root></div></body></html>";
const ASSETS = { fetch: async (u: string | URL | Request) => new URL(u instanceof Request ? u.url : u).pathname === "/index.html" ? new Response(SHELL) : new Response("nf", { status: 404 }) };
const pageOf = async (r: Response) => JSON.parse((await r.text()).match(/<script id="page-data" type="application\/json">(.*?)<\/script>/)![1]!);

// ---- 假上游 ----
const CLASH = `mixed-port: 7890
proxies:
  - { name: HK 01, type: ss, server: 1.2.3.4, port: 443, cipher: aes-128-gcm, password: pw }
  - { name: JP 01, type: trojan, server: jp.example.com, port: 443, password: pw }
proxy-groups:
  - { name: Proxy, type: select, proxies: [HK 01, JP 01] }
rules:
  - MATCH,Proxy
`;
const QX = `shadowsocks=1.2.3.4:443, method=aes-128-gcm, password=pw, fast-open=false, udp-relay=false, tag=HK 01
trojan=jp.example.com:443, password=pw, over-tls=true, tls-host=jp.example.com, tag=JP 01
`;
let upstream: { status: number; body: string } = { status: 200, body: CLASH };
let scriptBody = "function main(c){ c.proxies = c.proxies.filter(p => !/JP/.test(p.name)); console.log('kept', c.proxies.length); return c }";
const seenUA: string[] = [];
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const u = new URL(input instanceof Request ? input.url : String(input));
  const ua = new Headers(init?.headers).get("User-Agent") ?? "";
  if (u.hostname === "airport.example.com") {
    seenUA.push(ua);
    if (u.pathname === "/qx") return new Response(QX);
    if (upstream.status !== 200) return new Response("nope", { status: upstream.status });
    return new Response(upstream.body, { headers: { "subscription-userinfo": "upload=1; download=2; total=100; expire=2000000000", "profile-update-interval": "24" } });
  }
  if (u.hostname === "scripts.example.com") return new Response(scriptBody);
  throw new Error("unexpected fetch " + u);
}) as typeof fetch;

const L = "http://localhost:8787";
const base = { DB, CACHE, ASSETS, ADMIN_EMAILS: "reiy.leoz@gmail.com", ENCRYPTION_KEY: "k".repeat(32), SCRIPT_TIMEOUT_MS: "800" };
const admin = { ...base, AUTH_DISABLED: "true" } as unknown as Env;
const guest = { ...base, SESSION_SECRET: "x".repeat(32) } as unknown as Env;

const call = (env: Env, path: string, init: RequestInit = {}) =>
  worker.fetch(new Request(L + path, { ...init, headers: { Origin: L, ...(init.headers ?? {}) } }) as never, env);
const api = async <T = Record<string, unknown>>(path: string, method = "GET", body?: unknown, env: Env = admin): Promise<{ status: number; data: T }> => {
  const r = await call(env, path, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, data: (await r.json()) as T };
};
const pull = (url: string, ua = "FlClash/v0.8 clash-verge Platform/android") => worker.fetch(new Request(url, { headers: { "User-Agent": ua, "CF-Connecting-IP": "9.9.9.9" } }) as never, admin);

// ---- 工具函数 ----
assert.equal(maskHost("https://sub.example.com/api?token=abc"), "su*.ex*****.com");
assert.ok(!scrubUrls("failed https://a.b.com/x?token=secret").includes("secret"));
const qx = parseQx(QX);
assert.equal(qx.kind, "list");
assert.equal(qx.proxies.length, 2);
assert.deepEqual(qx.proxies[0], { type: "shadowsocks", server: "1.2.3.4", port: 443, tag: "HK 01", params: { method: "aes-128-gcm", password: "pw", "fast-open": "false", "udp-relay": "false" } });
assert.equal(serializeQx(qx), QX);
const full = parseQx("[general]\nnetwork_check_url=http://x\n[policy]\nstatic=Proxy, HK 01, direct, img-url=a.png\n[server_local]\n" + QX + "[filter_local]\nhost-suffix, google.com, Proxy\nfinal, direct\n");
assert.equal(full.kind, "full");
assert.deepEqual(full.policies[0], { type: "static", name: "Proxy", members: ["HK 01", "direct"], params: { "img-url": "a.png" } });
assert.equal(full.rules.length, 2);
assert.match(serializeQx(full), /\[policy\]\nstatic=Proxy, HK 01, direct, img-url=a\.png\n/);

// ---- 权限 ----
assert.equal((await api("/api/subs", "GET", undefined, guest)).status, 401, "访客不能看订阅");
assert.equal((await api("/api/admin/official", "GET", undefined, guest)).status, 401);
assert.equal((await call(admin, "/api/subs", { method: "POST", headers: { Origin: "https://evil.example", "Content-Type": "application/json" }, body: "{}" })).status, 403);
assert.equal((await pageOf(await call(guest, "/admin"))).kind, "admin", "访客打开后台：页面让他登录");

// ---- 官方脚本 ----
let r = await api<{ script: { id: string } }>("/api/admin/official", "POST", { name: "示例机场", pattern: "airport\\.example\\.com", sourceType: "url", scriptUrl: "https://scripts.example.com/a.js" });
assert.equal(r.status, 201);
const officialId = r.data.script.id;
assert.equal((await api("/api/admin/official", "POST", { name: "x", pattern: "(", sourceType: "inline", scriptContent: "x" })).status, 400, "坏正则");
const match = await api<{ match: { id: string } | null }>("/api/match", "POST", { url: "https://airport.example.com/sub?token=1" });
assert.equal(match.data.match?.id, officialId);
assert.equal((await api<{ match: null }>("/api/match", "POST", { url: "https://other.example.com/" })).data.match, null);

// ---- 订阅：官方脚本 + Clash ----
assert.equal((await api("/api/subs", "POST", { url: "http://127.0.0.1/x" })).status, 400, "内网地址");
assert.equal((await api("/api/subs", "POST", { url: "http://localhost:8787/s/abc" })).status, 400, "不能套娃");
r = await api<{ sub: { id: string; outputUrl: string; url: string; host: string } }>("/api/subs", "POST", { name: "我的机场", url: "https://airport.example.com/sub?token=SECRET", scriptMode: "official", officialId });
assert.equal(r.status, 201);
const sub = r.data.sub;
assert.equal(sub.url, "https://airport.example.com/sub?token=SECRET");
assert.match(sub.outputUrl, /^http:\/\/localhost:8787\/s\/[A-Za-z0-9_-]{32}$/);
assert.equal(sub.host, "ai*****.ex*****.com");
const stored = sqlite.prepare("SELECT source_enc FROM subscriptions").get() as { source_enc: string };
assert.ok(!stored.source_enc.includes("SECRET"), "原订阅地址加密存储");

let res = await pull(sub.outputUrl);
assert.equal(res.status, 200);
assert.equal(res.headers.get("subscription-userinfo"), "upload=1; download=2; total=100; expire=2000000000", "透传流量头");
assert.equal(res.headers.get("profile-update-interval"), "24");
let text = await res.text();
assert.match(text, /HK 01/);
assert.doesNotMatch(text, /name: JP 01/, "脚本生效");
assert.equal(seenUA.at(-1), "FlClash/v0.8 clash-verge Platform/android", "透传客户端 UA");

// 预览
let p = await api<{ result: { ok: boolean; proxies: number; console: string[]; scriptChanged: boolean; upstreamText?: string | null } }>(`/api/subs/${sub.id}/preview`, "POST");
assert.equal(p.data.result.ok, true);
assert.match(p.data.result.upstreamText ?? "", /name: JP 01/, "试运行回显原订阅内容");
assert.equal(p.data.result.proxies, 1);
assert.deepEqual(p.data.result.console, ["kept 1"]);
assert.equal(p.data.result.scriptChanged, false);

// 脚本变化被记录（官方脚本缓存 300 秒：管理员「立即拉取」跳过缓存）
scriptBody = "function main(c){ c.proxies = c.proxies.map(p => ({ ...p, name: '🇭🇰 ' + p.name })); return c }";
const rf = await api<{ changed: boolean }>(`/api/admin/official/${officialId}/refresh`, "POST");
assert.equal(rf.data.changed, true);
p = await api(`/api/subs/${sub.id}/preview`, "POST");
assert.equal(p.data.result.scriptChanged, true);
assert.equal(p.data.result.proxies, 2);

// 日志不含完整 URL
const logs = await api<{ logs: { scriptChanged: boolean; httpStatus: number }[] }>(`/api/subs/${sub.id}/logs`);
assert.equal(logs.data.logs.length, 3);
assert.equal(logs.data.logs[0]!.scriptChanged, true);
assert.ok(!JSON.stringify(sqlite.prepare("SELECT * FROM fetch_logs").all()).includes("SECRET"));

// ---- 失败：错误码 / 兜底 ----
upstream = { status: 403, body: "" };
res = await pull(sub.outputUrl);
assert.equal(res.status, 502, "原订阅 403 → 502");
assert.match(await res.text(), /502 网关错误\n原订阅返回 403 禁止访问/);
// 打开兜底：先成功一次写缓存，再失败返回缓存
upstream = { status: 200, body: CLASH };
const cur = (await api<{ sub: Record<string, unknown> }>(`/api/subs/${sub.id}`)).data.sub;
assert.equal((await api(`/api/subs/${sub.id}`, "PUT", { ...cur, fallback: true })).status, 200);
assert.equal((await pull(sub.outputUrl)).status, 200);
upstream = { status: 500, body: "" };
res = await pull(sub.outputUrl);
assert.equal(res.status, 200);
assert.equal(res.headers.get("X-Sub-Morph-Fallback"), "1");
assert.match(await res.text(), /HK 01/);
upstream = { status: 200, body: CLASH };

// 脚本错误 → 422
r = await api("/api/subs", "POST", { name: "坏脚本", url: "https://airport.example.com/x", scriptMode: "inline", scriptContent: "function main(c){ while(true){} }" });
const bad = (r.data as { sub: { id: string; outputUrl: string } }).sub;
res = await pull(bad.outputUrl);
assert.equal(res.status, 422);
assert.match(await res.text(), /超时/);

// ---- QX ----
r = await api("/api/subs", "POST", { name: "QX", url: "https://airport.example.com/qx", scriptMode: "inline", scriptContent: "const main = (c) => { c.proxies.forEach(p => p.tag = '[QX] ' + p.tag); c.proxies.push({ type: 'http', server: '5.6.7.8', port: 80, tag: 'added', params: {} }); return c }" });
const q = (r.data as { sub: { id: string; outputUrl: string } }).sub;
res = await pull(q.outputUrl, "Quantumult%20X/1.7");
assert.equal(res.status, 200);
text = await res.text();
assert.equal(text, "shadowsocks=1.2.3.4:443, method=aes-128-gcm, password=pw, fast-open=false, udp-relay=false, tag=[QX] HK 01\ntrojan=jp.example.com:443, password=pw, over-tls=true, tls-host=jp.example.com, tag=[QX] JP 01\nhttp=5.6.7.8:80, tag=added\n");

// ---- 刷新地址：旧地址 410 ----
const rot = await api<{ sub: { outputUrl: string } }>(`/api/subs/${sub.id}/rotate`, "POST");
assert.notEqual(rot.data.sub.outputUrl, sub.outputUrl);
assert.equal((await pull(sub.outputUrl)).status, 410);
assert.equal((await pull(rot.data.sub.outputUrl)).status, 200);
assert.equal((await pull(L + "/s/" + "a".repeat(32))).status, 404);
// 编辑不改地址
const cur2 = (await api<{ sub: Record<string, unknown> }>(`/api/subs/${sub.id}`)).data.sub;
const ed = await api<{ sub: { outputUrl: string; name: string } }>(`/api/subs/${sub.id}`, "PUT", { ...cur2, name: "改名了" });
assert.equal(ed.data.sub.outputUrl, rot.data.sub.outputUrl);
assert.equal(ed.data.sub.name, "改名了");

// ---- 管理员视图：脱敏 ----
const as = await api<{ subs: { url?: string; outputUrl?: string; host: string; userEmail: string }[] }>("/api/admin/subs");
assert.equal(as.data.subs.length, 3);
assert.ok(as.data.subs.every((s) => !s.url && !s.outputUrl), "管理员看不到原订阅和输出地址");
const users = await api<{ users: { email: string; admin: boolean }[] }>("/api/admin/users");
assert.equal(users.data.users[0]!.admin, true);
const alogs = await api<{ logs: unknown[] }>("/api/admin/logs");
assert.ok(alogs.data.logs.length >= 8);

// ---- 删除 ----
assert.equal((await api(`/api/subs/${q.id}`, "DELETE")).status, 200);
assert.equal((await pull(q.outputUrl)).status, 410);

// ---- 限流 ----
for (let i = 0; i < 40; i++) await worker.fetch(new Request(L + "/s/x", { headers: { "CF-Connecting-IP": "1.1.1.1" } }) as never, admin);
assert.equal((await worker.fetch(new Request(L + "/s/x", { headers: { "CF-Connecting-IP": "1.1.1.1" } }) as never, admin)).status, 429);

console.log("✓ 全部测试通过");
