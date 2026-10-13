// Worker 与前端共用的类型（纯类型，不依赖 Workers / DOM）。

export type SubFormat = "auto" | "clash" | "qx";
export type DetectedFormat = "clash" | "qx";
export type ScriptMode = "none" | "official" | "url" | "inline";
export type FetchTrigger = "client" | "preview";
/** fresh = 实时生成；fallback = 失败后返回上次成功结果；error = 返回了错误码。 */
export type Served = "fresh" | "fallback" | "error";

export interface SessionInfo {
  id: string;
  email: string;
  name?: string;
  picture?: string;
  admin: boolean;
}

export interface Limits {
  maxSubs: number;
  dailyPulls: number;
  dailyPreviews: number;
  maxScriptKB: number;
  scriptTimeoutMs: number;
  scriptMemoryMB: number;
}

export interface SubView {
  id: string;
  name: string;
  /** 原订阅地址（只有本人能看到明文）。 */
  url?: string;
  /** 脱敏后的主机名，如 ex***le.com。 */
  host: string;
  format: SubFormat;
  detectedFormat: DetectedFormat | null;
  userAgent: string;
  scriptMode: ScriptMode;
  officialId: string | null;
  officialName: string | null;
  scriptUrl: string;
  scriptContent: string;
  fallback: boolean;
  /** 输出地址（只有本人能看到）。 */
  outputUrl?: string;
  createdAt: number;
  updatedAt: number;
  last: LastFetch | null;
}

export interface LastFetch {
  at: number;
  served: Served;
  httpStatus: number;
  upstreamStatus: number | null;
  error: string | null;
  scriptHash: string | null;
  scriptChangedAt: number | null;
  proxies: number | null;
}

export interface FetchLogView {
  id: number;
  subId: string;
  subName?: string;
  userEmail?: string;
  at: number;
  trigger: FetchTrigger;
  served: Served;
  httpStatus: number;
  upstreamStatus: number | null;
  scriptHash: string | null;
  scriptChanged: boolean;
  proxies: number | null;
  durationMs: number;
  bytes: number | null;
  error: string | null;
}

export interface OfficialScriptView {
  id: string;
  name: string;
  description: string;
  pattern: string;
  sourceType: "url" | "inline";
  scriptUrl: string;
  scriptContent: string;
  enabled: boolean;
  priority: number;
  lastHash: string | null;
  lastFetchedAt: number | null;
  lastChangedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

/** 给普通用户看的官方脚本（不含脚本内容）。 */
export interface OfficialMatch {
  id: string;
  name: string;
  description: string;
}

export interface UserView {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
  createdAt: number;
  lastLoginAt: number;
  subs: number;
  admin: boolean;
}

export interface PreviewResult {
  ok: boolean;
  served: Served;
  httpStatus: number;
  upstreamStatus: number | null;
  error: string | null;
  format: DetectedFormat | null;
  proxies: number | null;
  scriptHash: string | null;
  scriptChanged: boolean;
  durationMs: number;
  bytes: number | null;
  console: string[];
  /** 输出内容（最多 256K 字符），只返回给本人，不落库。 */
  outputHead: string | null;
  /** 拉到的原订阅内容（最多 256K 字符），只在试运行时返回给本人，不落库。 */
  upstreamText?: string | null;
  /** 原订阅内容总长度（字符）。 */
  upstreamBytes?: number | null;
}

export type LoginError = "unconfigured" | "denied" | "state" | "token" | "id_token" | "unverified" | "disabled";

export type PageKind = "home" | "admin" | "privacy" | "licenses" | "notfound";

export interface PageData {
  kind: PageKind;
  user: SessionInfo | null;
  loginError?: LoginError | null;
  limits: Limits;
  origin: string;
  /** 管理员邮箱是否配置了 Google 登录。 */
  loginReady: boolean;
}
