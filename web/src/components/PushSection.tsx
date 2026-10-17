// 推送模式：原订阅只拦机房 IP（Cloudflare「Sorry, you have been blocked」）时，让自己的设备定时推送原订阅。
import { useState } from "react";
import { Badge, Banner, Button, Switch, Tabs, Text, useKumoToastManager } from "@cloudflare/kumo";
import type { SubView } from "../../../src/shared/types.ts";
import { api, statusLabel } from "../api.ts";
import { fmtRelative } from "../format.ts";
import { cronInstall, macInstall, macUninstall } from "../lib/pushScript.ts";

function CopyBlock({ text, label }: { text: string; label: string }) {
  const toast = useKumoToastManager();
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <Text variant="secondary" size="sm">{label}</Text>
        <Button size="sm" variant="secondary" onClick={() => navigator.clipboard.writeText(text).then(() => toast.add({ title: "已复制", variant: "success" }))}>复制</Button>
      </div>
      <pre className="max-h-48 overflow-auto rounded-lg bg-kumo-recessed p-3 font-mono text-xs whitespace-pre ring ring-kumo-line">{text}</pre>
    </div>
  );
}

export function PushSection({ sub, onChange }: { sub: SubView; onChange: (s: SubView) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [os, setOs] = useState("mac");
  const push = sub.push;
  const ua = sub.userAgent || (sub.format === "qx" ? "Quantumult%20X/1.0" : "clash.meta");

  async function toggle(enabled: boolean) {
    setBusy(true);
    setError(null);
    try {
      onChange((await api.push(sub.id, enabled)).sub);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Switch label="推送模式（用自己的网络拉原订阅）" checked={push.enabled} disabled={busy || !sub.url} onCheckedChange={toggle} />
        {push.enabled && (push.pushedAt ? <Badge variant="green">{`${fmtRelative(push.pushedAt)}收到推送`}</Badge> : <Badge variant="orange">还没收到推送</Badge>)}
        {push.enabled && push.lastStatus !== null && (push.lastStatus < 200 || push.lastStatus >= 300) && <Badge variant="red">{`设备上次拉取：${statusLabel(push.lastStatus)}`}</Badge>}
      </div>
      <Text variant="secondary" size="sm">
        原订阅拦截服务器机房 IP（比如 Cloudflare 返回 403「Sorry, you have been blocked」）时使用：你的电脑或路由器每 30 分钟用家里的网络拉一次原订阅推送过来，服务器不再直连原订阅，脚本照常执行。服务器加密保存最近一次推送的原订阅，关闭推送、归档或删除订阅时清除。
      </Text>
      {error && <Banner variant="error" title="操作失败" description={error} />}
      {push.enabled && push.url && sub.url && (
        <div className="grid gap-3">
          <Tabs value={os} onValueChange={(v) => setOs(String(v))} tabs={[{ value: "mac", label: "macOS" }, { value: "cron", label: "Linux / 路由器" }]} />
          {os === "mac" ? (
            <>
              <CopyBlock label="在「终端」里粘贴运行一次即可（系统自带 launchd，开机、唤醒后自动补跑，不需要 Homebrew / MacPorts）" text={macInstall(sub.id, sub.url, push.url, ua)} />
              <CopyBlock label="卸载" text={macUninstall(sub.id)} />
            </>
          ) : (
            <CopyBlock label="需要 bash 和 curl；用 crontab 每 30 分钟运行" text={cronInstall(sub.id, sub.url, push.url, ua)} />
          )}
          <Text variant="secondary" size="sm">
            脚本不走本机代理（curl --noproxy）。如果开着 Clash 的 TUN / 增强模式，请给原订阅域名加一条 DIRECT 规则，否则出口会变成节点 IP。改了原订阅地址后需要重新复制运行。
          </Text>
          <div>
            <Button size="sm" variant="secondary" loading={busy} onClick={() => toggle(true)}>重置推送地址</Button>
          </div>
        </div>
      )}
    </div>
  );
}
