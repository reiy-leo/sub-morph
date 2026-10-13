// 试运行结果：状态、节点数、脚本是否变化、console 输出、原订阅内容与输出内容（带行号）。
import { Badge, Banner, Button, Dialog, Loader, Text } from "@cloudflare/kumo";
import type { PreviewResult } from "../../../src/shared/types.ts";
import { statusLabel } from "../api.ts";
import { fmtBytes, shortHash } from "../format.ts";
import { ServedBadge } from "./StatusBadge.tsx";
import { CodeView } from "./CodeLines.tsx";

export function PreviewDialog({ open, name, result, loading, error, onClose }: { open: boolean; name: string; result: PreviewResult | null; loading: boolean; error: string | null; onClose: () => void }) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog size="lg" className="max-h-[90vh] overflow-y-auto px-6 py-5">
        <div className="grid gap-4">
          <div className="grid gap-1">
            <Dialog.Title className="text-base font-semibold">试运行：{name}</Dialog.Title>
            <Dialog.Description className="text-kumo-subtle">完整走一遍「拉取 → 脚本 → 输出」，结果只给你看，不会影响客户端。</Dialog.Description>
          </div>
          {loading && (
            <div className="flex items-center gap-2 py-6 text-kumo-subtle">
              <Loader size={16} /> 正在拉取原订阅并运行脚本…
            </div>
          )}
          {error && <Banner variant="error" title="试运行失败" description={error} />}
          {result && !loading && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <ServedBadge served={result.served} httpStatus={result.httpStatus} />
                {result.format && <Badge variant="neutral">{result.format === "clash" ? "Clash YAML" : "Quantumult X"}</Badge>}
                {result.upstreamStatus != null && <Badge variant="neutral">原订阅 {statusLabel(result.upstreamStatus)}</Badge>}
                {result.proxies != null && <Badge variant="blue">{result.proxies} 个节点</Badge>}
                {result.scriptHash && <Badge variant={result.scriptChanged ? "orange" : "neutral"}>脚本 {shortHash(result.scriptHash)}{result.scriptChanged ? " · 已变化" : ""}</Badge>}
                <Text variant="secondary" size="sm">{result.durationMs} ms · {fmtBytes(result.bytes)}</Text>
              </div>
              {result.error && <Banner variant="error" title={statusLabel(result.httpStatus)} description={result.error} />}
              {result.console.length > 0 && (
                <div className="grid gap-1.5">
                  <Text bold>脚本输出（console）</Text>
                  <pre className="max-h-48 overflow-auto rounded-lg bg-kumo-recessed p-3 font-mono text-xs whitespace-pre-wrap">{result.console.join("\n")}</pre>
                </div>
              )}
              {result.upstreamText != null && (
                <div className="grid gap-1.5">
                  <Text bold>原订阅内容{result.upstreamBytes && result.upstreamBytes > result.upstreamText.length ? "（前 256K 字符）" : ""}</Text>
                  <CodeView label="原订阅内容" text={result.upstreamText} />
                </div>
              )}
              {result.outputHead && (
                <div className="grid gap-1.5">
                  <Text bold>输出内容{result.bytes && result.bytes > result.outputHead.length ? "（前 256K 字符）" : ""}</Text>
                  <CodeView label="输出内容" text={result.outputHead} />
                </div>
              )}
            </>
          )}
          <div className="flex justify-end">
            <Button variant="secondary" onClick={onClose}>关闭</Button>
          </div>
        </div>
      </Dialog>
    </Dialog.Root>
  );
}
