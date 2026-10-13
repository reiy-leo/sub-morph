// 拉取记录表（用户与管理后台共用）。
import { Badge, Table, Text } from "@cloudflare/kumo";
import type { FetchLogView } from "../../../src/shared/types.ts";
import { statusLabel } from "../api.ts";
import { fmtTime, shortHash } from "../format.ts";
import { ServedBadge } from "./StatusBadge.tsx";

export function LogsTable({ logs, showOwner = false }: { logs: FetchLogView[]; showOwner?: boolean }) {
  if (!logs.length) return <Text variant="secondary">还没有拉取记录。</Text>;
  return (
    <div className="overflow-x-auto">
      <Table>
        <Table.Header>
          <Table.Row>
            <Table.Head>时间</Table.Head>
            {showOwner && <Table.Head>订阅 / 用户</Table.Head>}
            <Table.Head>来源</Table.Head>
            <Table.Head>结果</Table.Head>
            <Table.Head>原订阅</Table.Head>
            <Table.Head>节点</Table.Head>
            <Table.Head>脚本</Table.Head>
            <Table.Head>耗时</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {logs.map((l) => (
            <Table.Row key={l.id}>
              <Table.Cell className="whitespace-nowrap tabular-nums">{fmtTime(l.at)}</Table.Cell>
              {showOwner && (
                <Table.Cell className="max-w-56">
                  <div className="truncate">{l.subName ?? l.subId}</div>
                  <div className="truncate text-xs text-kumo-subtle">{l.userEmail}</div>
                </Table.Cell>
              )}
              <Table.Cell className="whitespace-nowrap">{l.trigger === "client" ? "客户端" : "试运行"}</Table.Cell>
              <Table.Cell>
                <ServedBadge served={l.served} httpStatus={l.httpStatus} error={l.error} />
              </Table.Cell>
              <Table.Cell className="whitespace-nowrap text-kumo-subtle">{l.upstreamStatus != null ? statusLabel(l.upstreamStatus) : "—"}</Table.Cell>
              <Table.Cell className="tabular-nums">{l.proxies ?? "—"}</Table.Cell>
              <Table.Cell className="whitespace-nowrap">
                {l.scriptHash ? (
                  <span className="inline-flex items-center gap-1.5">
                    <code className="text-xs">{shortHash(l.scriptHash)}</code>
                    {l.scriptChanged && <Badge variant="orange">已变化</Badge>}
                  </span>
                ) : (
                  "—"
                )}
              </Table.Cell>
              <Table.Cell className="whitespace-nowrap tabular-nums text-kumo-subtle">{l.durationMs} ms</Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
    </div>
  );
}
