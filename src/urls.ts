// URL 校验与脱敏。原订阅 URL 属于敏感信息：日志和管理后台只显示脱敏主机名。
import { InputError } from "./errors.ts";

const PRIVATE_HOST = /^(localhost|.*\.local|.*\.internal|.*\.localhost|0\.0\.0\.0|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|\[?::1\]?|\[?f[cd][0-9a-f]{2}:.*)$/i;

/** 校验外部 http(s) 地址；selfHost 用来防止把本服务的输出地址再当订阅源（死循环）。 */
export function checkRemoteUrl(raw: string, field: string, selfHost?: string): URL {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new InputError(`${field}不是合法链接`);
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new InputError(`${field}只支持 http / https`);
  if (PRIVATE_HOST.test(u.hostname)) throw new InputError(`${field}不能指向内网地址`);
  if (selfHost && u.hostname === selfHost) throw new InputError(`${field}不能是本服务自己的地址`);
  if (raw.length > 2048) throw new InputError(`${field}太长`);
  return u;
}

/** sub.example.com → su*.ex*****.com；IP → 1.2.*.* */
export function maskHost(raw: string): string {
  let host = raw;
  try {
    host = new URL(raw).hostname;
  } catch {
    /* 已经是主机名 */
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return host.split(".").slice(0, 2).join(".") + ".*.*";
  const parts = host.split(".");
  return parts
    .map((p, i) => (i === parts.length - 1 ? p : p.length <= 2 ? p[0] + "*" : p.slice(0, 2) + "*".repeat(Math.min(p.length - 2, 6))))
    .join(".");
}

/** 把错误信息里可能出现的 URL 替换成脱敏主机名，日志永远不记完整 URL。 */
export const scrubUrls = (s: string) => s.replace(/https?:\/\/[^\s"'<>]+/gi, (m) => `<${maskHost(m)}>`);
