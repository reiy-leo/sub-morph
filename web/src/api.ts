import type { FetchLogView, OfficialMatch, OfficialScriptView, PreviewResult, SubmissionView, SubView, UserView } from "../../src/shared/types.ts";
import { statusLabel } from "../../src/shared/status.ts";

export { statusLabel };

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** 会话失效（401）时广播，AuthProvider 收到后弹出登录框。 */
export const UNAUTHORIZED_EVENT = "sm:unauthorized";

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init.headers ?? {}) } });
  } catch {
    throw new ApiError("网络错误，请检查网络后重试", 0);
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (res.status === 401) {
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    throw new ApiError("需要登录（401 未登录）", 401);
  }
  if (!res.ok) throw new ApiError(data.error ?? `请求失败（${statusLabel(res.status)}）`, res.status);
  return data as T;
}

const body = (b: unknown) => JSON.stringify(b);

export interface SubDraft {
  name: string;
  url: string;
  format: SubView["format"];
  userAgent: string;
  scriptMode: SubView["scriptMode"];
  officialId: string | null;
  scriptUrl: string;
  scriptContent: string;
  fallback: boolean;
  /** 保存时把覆写脚本提交为官方脚本候选（不保存在订阅上，每次打开默认关闭）。 */
  submitOfficial?: boolean;
}

export type OfficialDraft = Pick<OfficialScriptView, "name" | "description" | "pattern" | "sourceType" | "scriptUrl" | "scriptContent" | "enabled" | "priority">;
export type AdminSub = SubView & { userEmail: string };

export const api = {
  subs: () => request<{ subs: SubView[] }>("/api/subs"),
  create: (d: SubDraft) => request<{ sub: SubView }>("/api/subs", { method: "POST", body: body(d) }),
  update: (id: string, d: SubDraft) => request<{ sub: SubView }>(`/api/subs/${id}`, { method: "PUT", body: body(d) }),
  remove: (id: string) => request<{ ok: true }>(`/api/subs/${id}`, { method: "DELETE" }),
  rotate: (id: string) => request<{ sub: SubView }>(`/api/subs/${id}/rotate`, { method: "POST" }),
  preview: (id: string) => request<{ result: PreviewResult; sub: SubView | null }>(`/api/subs/${id}/preview`, { method: "POST" }),
  logs: (id: string) => request<{ logs: FetchLogView[] }>(`/api/subs/${id}/logs`),
  official: (url: string) => request<{ scripts: OfficialMatch[] }>("/api/official", { method: "POST", body: body({ url }) }),
  match: (url: string) => request<{ match: OfficialMatch | null }>("/api/match", { method: "POST", body: body({ url }) }),
  admin: {
    official: () => request<{ scripts: OfficialScriptView[] }>("/api/admin/official"),
    createOfficial: (d: OfficialDraft) => request<{ script: OfficialScriptView }>("/api/admin/official", { method: "POST", body: body(d) }),
    updateOfficial: (id: string, d: OfficialDraft) => request<{ script: OfficialScriptView }>(`/api/admin/official/${id}`, { method: "PUT", body: body(d) }),
    removeOfficial: (id: string) => request<{ ok: true }>(`/api/admin/official/${id}`, { method: "DELETE" }),
    refreshOfficial: (id: string) => request<{ hash: string; changed: boolean; script: OfficialScriptView }>(`/api/admin/official/${id}/refresh`, { method: "POST" }),
    submissions: (status?: string) => request<{ submissions: SubmissionView[] }>(`/api/admin/submissions${status ? `?status=${status}` : ""}`),
    approveSubmission: (id: string, d: OfficialDraft) => request<{ script: OfficialScriptView }>(`/api/admin/submissions/${id}/approve`, { method: "POST", body: body(d) }),
    rejectSubmission: (id: string, note: string) => request<{ ok: true }>(`/api/admin/submissions/${id}/reject`, { method: "POST", body: body({ note }) }),
    users: () => request<{ users: UserView[] }>("/api/admin/users"),
    subs: (user?: string) => request<{ subs: AdminSub[] }>(`/api/admin/subs${user ? `?user=${encodeURIComponent(user)}` : ""}`),
    logs: (p: { sub?: string; user?: string } = {}) => request<{ logs: FetchLogView[] }>(`/api/admin/logs?${new URLSearchParams(p as Record<string, string>)}`),
  },
};
