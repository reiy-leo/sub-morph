// 推送模式：原订阅拦截机房 IP（如 Cloudflare WAF「Sorry, you have been blocked」）时，
// 由用户自己的设备（家庭网络）定时拉原订阅，再 PUT 到 /p/:token。服务端加密保存最近一次成功推送，
// 客户端拉输出地址时用它代替直连原订阅，脚本照常在服务端执行。
//
// PUT /p/:token
//   body                     原订阅响应体（原样）
//   X-Upstream-Status        设备拉原订阅得到的状态码；非 2xx 只记录，不覆盖已保存的内容
//   X-Upstream-Headers       可选，base64 的原订阅响应头（多行 "name: value"），只取流量 / 到期等透传头
import { maxSubBytes, type Env } from "./env.ts";
import { decrypt, encrypt, fromB64url } from "./crypto.ts";
import { detectFormat, FormatError, parseConfig, countProxies } from "./formats/index.ts";
import { bumpMinute } from "./quota.ts";
import { statusLabel } from "./shared/status.ts";
import { encKey, findByPushToken, type SubRow } from "./subs.ts";

export const PUSH_PASS_HEADERS = ["subscription-userinfo", "profile-update-interval", "profile-web-page-url", "content-disposition", "support-url"];
const PUSH_TTL = 30 * 86400;

export interface PushedCopy {
  text: string;
  headers: Record<string, string>;
  status: number;
  at: number;
}

const reply = (status: number, msg: string) =>
  new Response(`sub-morph 推送：${statusLabel(status)}\n${msg}\n`, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

function parseHeaderBlob(b64: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!b64) return out;
  let text = "";
  try {
    text = new TextDecoder().decode(fromB64url(b64.trim().replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")));
  } catch {
    return out;
  }
  for (const line of text.split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i <= 0) continue;
    const k = line.slice(0, i).trim().toLowerCase();
    const v = line.slice(i + 1).trim();
    if (PUSH_PASS_HEADERS.includes(k) && v && v.length <= 500) out[k] = v;
  }
  return out;
}

export async function receivePush(req: Request, env: Env, token: string): Promise<Response> {
  if (req.method !== "PUT" && req.method !== "POST") return reply(405, "只支持 PUT");
  const sub = await findByPushToken(env, token);
  if (!sub) return reply(404, "推送地址不存在或已重置，请在 Subscription Braces 里重新复制安装命令");
  if (sub.archived_at) return reply(410, "这个订阅已归档，停止接收推送");
  if ((await bumpMinute(env, `push:${sub.id}`)) > 10) return reply(429, "推送太频繁（每分钟最多 10 次）");

  const upStatus = Number(req.headers.get("X-Upstream-Status") ?? 200) || 0;
  const now = Date.now();
  if (upStatus < 200 || upStatus >= 300) {
    await env.DB.prepare("UPDATE subscriptions SET push_status=?2 WHERE id=?1").bind(sub.id, upStatus).run();
    return reply(200, `已记录：设备拉原订阅得到 ${statusLabel(upStatus)}，保留上次推送的内容`);
  }
  const max = maxSubBytes(env);
  if (Number(req.headers.get("content-length") ?? 0) > max) return reply(413, `内容超过 ${max / 1024 / 1024} MB 上限`);
  const text = await req.text();
  if (text.length > max) return reply(413, `内容超过 ${max / 1024 / 1024} MB 上限`);
  if (!text.trim()) return reply(422, "推送内容为空");
  let proxies: number | null;
  try {
    const format = detectFormat(text, sub.format);
    proxies = countProxies(parseConfig(text, format), format);
  } catch (e) {
    const msg = e instanceof FormatError ? e.message : "无法识别订阅格式";
    await env.DB.prepare("UPDATE subscriptions SET push_status=?2 WHERE id=?1").bind(sub.id, 422).run();
    return reply(422, `${msg}（可能拿到的是拦截页面，检查这台设备能否直接打开原订阅）`);
  }
  const copy: PushedCopy = { text, headers: parseHeaderBlob(req.headers.get("X-Upstream-Headers")), status: upStatus, at: now };
  await env.CACHE.put(`push:${sub.id}`, await encrypt(JSON.stringify(copy), encKey(env)), { expirationTtl: PUSH_TTL });
  await env.DB.prepare("UPDATE subscriptions SET pushed_at=?2, push_status=?3 WHERE id=?1").bind(sub.id, now, upStatus).run();
  return reply(200, `已收到 ${proxies ?? "?"} 个节点`);
}

export async function readPushed(env: Env, sub: SubRow): Promise<PushedCopy | null> {
  const raw = await env.CACHE.get(`push:${sub.id}`);
  if (!raw) return null;
  return JSON.parse(await decrypt(raw, encKey(env))) as PushedCopy;
}
