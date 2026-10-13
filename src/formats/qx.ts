// Quantumult X 配置 ⇄ 结构化对象。约定见 docs/PRODUCT.md「脚本对 Quantumult X 的约定」。
//
// 支持两种输入：
//   - "list"：纯节点列表（服务器订阅 / server_remote 资源），每行一个节点，没有 [段落]
//   - "full"：完整配置，有 [general] [server_local] [policy] [filter_local] 等段落
//
// 结构化后：
//   proxies   [server_local] 或纯列表里的节点   → { type, server, port, tag, params }
//   policies  [policy] 里的策略组               → { type, name, members, params }
//   rules     [filter_local] 的每一行（原样字符串，如 "host-suffix, google.com, proxy"）
//   sections  其余段落的原样行（general、dns、server_remote、filter_remote、rewrite_remote、
//             rewrite_local、task_local、http_backend、mitm…），key 为小写段名
//   order     段落输出顺序（小写段名）

export interface QxProxy {
  type: string;
  server: string;
  port: number;
  tag: string;
  params: Record<string, string>;
}
export interface QxPolicy {
  type: string;
  name: string;
  members: string[];
  params: Record<string, string>;
}
export interface QxConfig {
  format: "quantumultx";
  kind: "list" | "full";
  proxies: QxProxy[];
  policies: QxPolicy[];
  rules: string[];
  sections: Record<string, string[]>;
  order: string[];
}

const SECTION_RE = /^\s*\[([A-Za-z_][\w-]*)\]\s*$/;
const NODE_TYPES = ["shadowsocks", "vmess", "vless", "trojan", "http", "socks5", "ssr", "hysteria2", "tuic", "wireguard"];
const NODE_RE = new RegExp(`^\\s*(${NODE_TYPES.join("|")})\\s*=\\s*[^,\\s]+:\\d+`, "i");
const POLICY_TYPES = ["static", "available", "round-robin", "dest-hash", "url-latency-benchmark", "ssid"];

const isComment = (l: string) => /^\s*(#|;|\/\/)/.test(l) || l.trim() === "";

/** 按逗号切分，忽略引号里的逗号。 */
function splitComma(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quote = "";
  for (const ch of line) {
    if (quote) {
      if (ch === quote) quote = "";
      cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
    } else if (ch === ",") {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function kv(part: string): [string, string] {
  const i = part.indexOf("=");
  return i < 0 ? [part.trim(), ""] : [part.slice(0, i).trim(), part.slice(i + 1).trim()];
}

export function parseQxProxy(line: string): QxProxy | null {
  if (!NODE_RE.test(line)) return null;
  const parts = splitComma(line);
  const [type, addr] = kv(parts[0]!);
  const colon = addr.lastIndexOf(":");
  let server = addr.slice(0, colon);
  if (server.startsWith("[") && server.endsWith("]")) server = server.slice(1, -1);
  const port = Number(addr.slice(colon + 1));
  const params: Record<string, string> = {};
  let tag = "";
  for (const p of parts.slice(1)) {
    const [k, v] = kv(p);
    if (!k) continue;
    if (k.toLowerCase() === "tag") tag = v;
    else params[k] = v;
  }
  return { type: type.toLowerCase(), server, port, tag, params };
}

export function serializeQxProxy(p: QxProxy): string {
  const host = p.server.includes(":") ? `[${p.server}]` : p.server;
  const parts = [`${p.type}=${host}:${p.port}`];
  for (const [k, v] of Object.entries(p.params ?? {})) {
    if (k.toLowerCase() === "tag") continue;
    parts.push(v === "" ? k : `${k}=${v}`);
  }
  if (p.tag) parts.push(`tag=${p.tag}`);
  return parts.join(", ");
}

function parsePolicy(line: string): QxPolicy | null {
  const parts = splitComma(line);
  const [type, name] = kv(parts[0] ?? "");
  if (!POLICY_TYPES.includes(type.toLowerCase()) || !name) return null;
  const members: string[] = [];
  const params: Record<string, string> = {};
  for (const p of parts.slice(1)) {
    if (p.includes("=")) {
      const [k, v] = kv(p);
      params[k] = v;
    } else if (p) members.push(p);
  }
  return { type: type.toLowerCase(), name, members, params };
}

function serializePolicy(p: QxPolicy): string {
  const parts = [`${p.type}=${p.name}`, ...(p.members ?? [])];
  for (const [k, v] of Object.entries(p.params ?? {})) parts.push(`${k}=${v}`);
  return parts.join(", ");
}

export function looksLikeQx(text: string): boolean {
  const lines = text.split(/\r?\n/).filter((l) => !isComment(l));
  if (!lines.length) return false;
  if (lines.some((l) => /^\s*\[(server_local|server_remote|general|policy|filter_local|filter_remote|rewrite_remote|mitm)\]\s*$/i.test(l))) return true;
  const nodes = lines.filter((l) => NODE_RE.test(l)).length;
  return nodes > 0 && nodes >= lines.length * 0.6;
}

export function parseQx(text: string): QxConfig {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const hasSections = lines.some((l) => SECTION_RE.test(l));
  const cfg: QxConfig = { format: "quantumultx", kind: hasSections ? "full" : "list", proxies: [], policies: [], rules: [], sections: {}, order: [] };
  let section = hasSections ? "" : "server_local";
  if (!hasSections) cfg.order.push("server_local");
  for (const raw of lines) {
    const m = SECTION_RE.exec(raw);
    if (m) {
      section = m[1]!.toLowerCase();
      if (!cfg.order.includes(section)) cfg.order.push(section);
      continue;
    }
    if (!section) {
      // 第一个段落之前的内容（一般是注释）
      if (raw.trim()) (cfg.sections["_head"] ??= []).push(raw);
      if (!cfg.order.includes("_head")) cfg.order.unshift("_head");
      continue;
    }
    if (section === "server_local") {
      if (isComment(raw)) continue;
      const p = parseQxProxy(raw);
      if (p) cfg.proxies.push(p);
      else (cfg.sections["server_local"] ??= []).push(raw.trim());
    } else if (section === "policy") {
      if (isComment(raw)) continue;
      const p = parsePolicy(raw);
      if (p) cfg.policies.push(p);
      else (cfg.sections["policy"] ??= []).push(raw.trim());
    } else if (section === "filter_local") {
      if (raw.trim() === "") continue;
      cfg.rules.push(raw.trim());
    } else {
      if (raw.trim() === "") continue;
      (cfg.sections[section] ??= []).push(raw);
    }
  }
  return cfg;
}

const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));

/** 把脚本返回的对象序列化回 QX 文本；字段类型不对时抛错（提示给用户）。 */
export function serializeQx(input: unknown): string {
  if (!input || typeof input !== "object") throw new Error("脚本需要返回配置对象");
  const c = input as Partial<QxConfig>;
  const proxies = Array.isArray(c.proxies) ? c.proxies : [];
  const policies = Array.isArray(c.policies) ? c.policies : [];
  const rules = Array.isArray(c.rules) ? c.rules : [];
  const sections = c.sections && typeof c.sections === "object" ? c.sections : {};
  const proxyLines = proxies.map((p, i) => {
    if (!p || typeof p !== "object" || !p.type || !p.server || !Number.isFinite(Number(p.port))) {
      throw new Error(`proxies[${i}] 缺少 type / server / port`);
    }
    return serializeQxProxy({ type: str(p.type), server: str(p.server), port: Number(p.port), tag: str(p.tag), params: (p.params ?? {}) as Record<string, string> });
  });
  if (c.kind !== "full") return proxyLines.join("\n") + "\n";

  const policyLines = policies.map((p, i) => {
    if (!p || typeof p !== "object" || !p.type || !p.name) throw new Error(`policies[${i}] 缺少 type / name`);
    return serializePolicy({ type: str(p.type), name: str(p.name), members: (p.members ?? []).map(str), params: (p.params ?? {}) as Record<string, string> });
  });
  const order = [...(Array.isArray(c.order) ? c.order.map((s) => str(s).toLowerCase()) : [])];
  for (const s of ["general", "dns", "policy", "server_remote", "filter_remote", "rewrite_remote", "server_local", "filter_local", "rewrite_local", "task_local", "http_backend", "mitm", ...Object.keys(sections)]) {
    const has = s === "server_local" ? proxyLines.length > 0 : s === "policy" ? policyLines.length > 0 : s === "filter_local" ? rules.length > 0 : Boolean((sections as Record<string, unknown>)[s]);
    if (has && !order.includes(s)) order.push(s);
  }
  const out: string[] = [];
  for (const s of order) {
    const extra = Array.isArray((sections as Record<string, unknown>)[s]) ? ((sections as Record<string, unknown[]>)[s] ?? []).map(str) : [];
    if (s === "_head") {
      out.push(...extra, "");
      continue;
    }
    const body = s === "server_local" ? [...proxyLines, ...extra] : s === "policy" ? [...policyLines, ...extra] : s === "filter_local" ? rules.map(str) : extra;
    out.push(`[${s}]`, ...body, "");
  }
  return out.join("\n");
}
