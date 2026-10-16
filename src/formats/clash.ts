// Clash / Mihomo YAML ⇄ 对象（yaml 库，eemeli/yaml，ISC）。
import { parse, stringify } from "yaml";

export function looksLikeClash(text: string): boolean {
  return /^(proxies|proxy-groups|proxy-providers|rules|rule-providers|mixed-port|port)\s*:/m.test(text);
}

export function parseClash(text: string): Record<string, unknown> {
  const v = parse(text.replace(/^\uFEFF/, ""), { maxAliasCount: 200, merge: true, uniqueKeys: false });
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("YAML 顶层不是对象");
  return v as Record<string, unknown>;
}

export function serializeClash(v: unknown): string {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("脚本需要返回配置对象");
  // 字符串一律双引号（JSON 转义）：避免 on/yes/0123/1e3 之类被 YAML 1.1 解析器当成布尔/数字，兼容更多客户端。键保持不加引号。
  return stringify(v, { lineWidth: 0, aliasDuplicateObjects: false, defaultStringType: "QUOTE_DOUBLE", defaultKeyType: "PLAIN", doubleQuotedAsJSON: true });
}

export const countClashProxies = (v: unknown) => {
  const p = (v as { proxies?: unknown } | null)?.proxies;
  return Array.isArray(p) ? p.length : null;
};
