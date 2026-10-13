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
  return stringify(v, { lineWidth: 0, aliasDuplicateObjects: false });
}

export const countClashProxies = (v: unknown) => {
  const p = (v as { proxies?: unknown } | null)?.proxies;
  return Array.isArray(p) ? p.length : null;
};
