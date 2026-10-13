import { Badge, Tooltip } from "@cloudflare/kumo";
import type { LastFetch, Served } from "../../../src/shared/types.ts";
import { statusLabel } from "../api.ts";

const SERVED: Record<Served, { label: string; variant: "green" | "orange" | "red" }> = {
  fresh: { label: "成功", variant: "green" },
  fallback: { label: "失败，已返回上次结果", variant: "orange" },
  error: { label: "失败", variant: "red" },
};

/** 拉取结果徽章：成功 / 兜底 / 失败（带状态码中文注释）。 */
export function ServedBadge({ served, httpStatus, error }: { served: Served; httpStatus: number; error?: string | null }) {
  const s = SERVED[served];
  const badge = <Badge variant={s.variant}>{served === "error" ? `${s.label} · ${statusLabel(httpStatus)}` : s.label}</Badge>;
  return error ? (
    <Tooltip content={error} asChild>
      <span className="cursor-help">{badge}</span>
    </Tooltip>
  ) : (
    badge
  );
}

export function LastBadge({ last }: { last: LastFetch | null }) {
  if (!last) return <Badge variant="neutral">还没有被拉取过</Badge>;
  return <ServedBadge served={last.served} httpStatus={last.httpStatus} error={last.error} />;
}
