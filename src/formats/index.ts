import type { DetectedFormat, SubFormat } from "../shared/types.ts";
import { countClashProxies, looksLikeClash, parseClash, serializeClash } from "./clash.ts";
import { looksLikeQx, parseQx, serializeQx } from "./qx.ts";

export class FormatError extends Error {}

/** 按内容识别格式；format 不是 auto 时以用户选择为准。 */
export function detectFormat(text: string, want: SubFormat): DetectedFormat {
  if (want === "clash" || want === "qx") return want;
  if (looksLikeClash(text)) return "clash";
  if (looksLikeQx(text)) return "qx";
  const compact = text.trim();
  if (/^[A-Za-z0-9+/=_-\s]+$/.test(compact) && compact.length > 16) {
    throw new FormatError("看起来是 Base64 节点列表（V2Ray / SS 订阅），暂不支持。可在机场后台改用 Clash 或 Quantumult X 订阅链接，或在高级设置里填 User-Agent（如 clash.meta）让机场返回 Clash 格式");
  }
  if (/<html|<!doctype/i.test(compact.slice(0, 200))) throw new FormatError("原订阅返回的是网页而不是订阅内容（可能需要登录、链接失效或被风控）");
  throw new FormatError("无法识别订阅格式：既不是 Clash/Mihomo YAML，也不是 Quantumult X");
}

export function parseConfig(text: string, f: DetectedFormat): unknown {
  try {
    return f === "clash" ? parseClash(text) : parseQx(text);
  } catch (e) {
    throw new FormatError(`${f === "clash" ? "YAML" : "Quantumult X"} 解析失败：${e instanceof Error ? e.message : String(e)}`);
  }
}

export function serializeConfig(v: unknown, f: DetectedFormat): string {
  try {
    return f === "clash" ? serializeClash(v) : serializeQx(v);
  } catch (e) {
    throw new FormatError(`输出${f === "clash" ? " YAML" : " Quantumult X"} 失败：${e instanceof Error ? e.message : String(e)}`);
  }
}

export function countProxies(v: unknown, f: DetectedFormat): number | null {
  if (f === "clash") return countClashProxies(v);
  const p = (v as { proxies?: unknown } | null)?.proxies;
  return Array.isArray(p) ? p.length : null;
}

export const contentType = (f: DetectedFormat) => (f === "clash" ? "text/yaml; charset=utf-8" : "text/plain; charset=utf-8");
