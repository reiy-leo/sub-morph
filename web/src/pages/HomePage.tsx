// 首页：未登录 → 产品介绍 + 登录；已登录 → 我的订阅。
import { useCallback, useEffect, useState } from "react";
import { Badge, Banner, Button, ClipboardText, Dialog, DropdownMenu, Empty, LayerCard, Loader, Text, useKumoToastManager } from "@cloudflare/kumo";
import {
  ArchiveIcon,
  ArrowClockwiseIcon,
  ArrowsLeftRightIcon,
  DotsThreeIcon,
  GoogleLogoIcon,
  ListBulletsIcon,
  PencilSimpleIcon,
  PlayIcon,
  PlusIcon,
  ShieldCheckIcon,
  TrashIcon,
  WarningCircleIcon,
  XIcon,
} from "@phosphor-icons/react";
import type { Limits, LoginError, PreviewResult, SubView } from "../../../src/shared/types.ts";
import { api, statusLabel } from "../api.ts";
import { useAuth } from "../components/Auth.tsx";
import { AppFooter, AppHeader } from "../components/AppHeader.tsx";
import { LogsTable } from "../components/LogsTable.tsx";
import { PreviewDialog } from "../components/PreviewDialog.tsx";
import { LastBadge } from "../components/StatusBadge.tsx";
import { SubEditor } from "../components/SubEditor.tsx";
import { FORMAT_LABEL, fmtRelative, fmtTime, MODE_LABEL, shortHash } from "../format.ts";

const LOGIN_ERRORS: Record<LoginError, string> = {
  unconfigured: "站点还没有配置 Google 登录（GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET）。",
  denied: "你在 Google 页面取消了授权。",
  state: "登录状态校验失败（可能超过 10 分钟或 Cookie 被拦截），请重试。",
  token: "向 Google 换取令牌失败，请重试。",
  id_token: "Google 返回的身份信息校验失败。",
  unverified: "这个 Google 账号的邮箱还没有验证。",
  disabled: "这个账号已被停用。",
};

function Landing({ loginError, loginReady }: { loginError: LoginError | null; loginReady: boolean }) {
  const { loginUrl } = useAuth();
  const steps = [
    { t: "贴上原订阅", d: "支持 Clash / Mihomo YAML 和 Quantumult X，自动识别。" },
    { t: "选一个覆写脚本", d: "按订阅源选官方脚本，也可以填脚本地址或直接贴代码，接口与 FlClash / Clash Verge 的 main(config) 一致。" },
    { t: "客户端导入输出地址", d: "客户端按自己的周期更新订阅，脚本改了也会同步；每次拉取的成败都有记录。" },
  ];
  return (
    <main className="mx-auto grid max-w-3xl gap-10 px-5 py-14">
      {loginError && <Banner variant="error" icon={<WarningCircleIcon weight="fill" />} title="登录失败" description={LOGIN_ERRORS[loginError]} />}
      <div className="grid gap-4">
        <img src="/icon-192.png" alt="" className="size-11" />
        <div className="grid gap-2">
          <Text variant="heading" size="lg" as="h1">订阅矫正</Text>
          <Text variant="secondary">
            拉取你的原订阅，套用覆写脚本，输出成品订阅。FlClash 等客户端用 URL 导入的覆写脚本不会自动同步、成败也没有反馈——把这一步交给服务端，客户端只管更新订阅。
          </Text>
        </div>
        <div>
          <Button variant="primary" icon={GoogleLogoIcon} disabled={!loginReady} onClick={() => (location.href = loginUrl())}>
            使用 Google 登录
          </Button>
          {!loginReady && <Text variant="secondary" size="sm"> 登录尚未配置</Text>}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {steps.map((s, i) => (
          <LayerCard key={s.t} className="grid content-start gap-1.5 px-4 py-3.5">
            <Text variant="secondary" size="sm">第 {i + 1} 步</Text>
            <Text bold>{s.t}</Text>
            <Text variant="secondary" size="sm">{s.d}</Text>
          </LayerCard>
        ))}
      </div>
      <div className="flex items-start gap-2 text-kumo-subtle">
        <ShieldCheckIcon size={18} className="mt-0.5 shrink-0" />
        <Text variant="secondary" size="sm">
          原订阅地址加密保存，日志只记录脱敏域名；默认不保存任何节点内容。脚本在隔离沙箱里运行，无法联网。详见
          <a className="underline" href="/privacy">隐私说明与免责声明</a>。
        </Text>
      </div>
    </main>
  );
}

function SubCard({ sub, onEdit, onPreview, onLogs, onRotate, onArchive, onDelete }: { sub: SubView; onEdit: () => void; onPreview: () => void; onLogs: () => void; onRotate: () => void; onArchive: () => void; onDelete: () => void }) {
  const last = sub.last;
  return (
    <LayerCard className="grid gap-3 px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <Text variant="heading" as="h3">{sub.name}</Text>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="neutral">{sub.detectedFormat ? FORMAT_LABEL[sub.detectedFormat] : FORMAT_LABEL[sub.format]}</Badge>
            <Badge variant={sub.scriptMode === "none" ? "neutral" : "blue"}>
              {sub.scriptMode === "official" ? `官方脚本 · ${sub.officialName ?? "已删除"}` : MODE_LABEL[sub.scriptMode]}
            </Badge>
            {sub.fallback && <Badge variant="purple">失败兜底</Badge>}
            <Text variant="secondary" size="sm">{sub.host}</Text>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="secondary" icon={PlayIcon} onClick={onPreview}>试运行</Button>
          <Button size="sm" variant="ghost" icon={PencilSimpleIcon} onClick={onEdit}>编辑</Button>
          <DropdownMenu>
            <DropdownMenu.Trigger render={<Button size="sm" variant="ghost" shape="square" icon={DotsThreeIcon} aria-label="更多" />} />
            <DropdownMenu.Content align="end">
              <DropdownMenu.Item icon={ListBulletsIcon} onClick={onLogs}>拉取记录</DropdownMenu.Item>
              <DropdownMenu.Item icon={ArrowClockwiseIcon} onClick={onRotate}>刷新地址</DropdownMenu.Item>
              <DropdownMenu.Item icon={ArchiveIcon} onClick={onArchive}>归档</DropdownMenu.Item>
              <DropdownMenu.Separator />
              <DropdownMenu.Item icon={TrashIcon} variant="danger" onClick={onDelete}>删除</DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu>
        </div>
      </div>
      <div className="grid gap-1.5">
        <Text variant="secondary" size="sm">输出地址（导入客户端）</Text>
        <ClipboardText text={sub.outputUrl ?? ""} className="w-full" tooltip={{ text: "复制", copiedText: "已复制" }} />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
        <span className="inline-flex items-center gap-1.5">
          <Text variant="secondary" size="sm">最近拉取</Text>
          <span title={fmtTime(last?.at)}>{fmtRelative(last?.at)}</span>
          <LastBadge last={last} />
        </span>
        {last?.upstreamStatus != null && (
          <span className="text-kumo-subtle">原订阅 {statusLabel(last.upstreamStatus)}</span>
        )}
        {last?.proxies != null && <span className="text-kumo-subtle">{last.proxies} 个节点</span>}
        {last?.scriptHash && (
          <span className="text-kumo-subtle">
            脚本 <code className="text-xs">{shortHash(last.scriptHash)}</code>
            {last.scriptChangedAt ? `，${fmtRelative(last.scriptChangedAt)}变化` : "，未变化"}
          </span>
        )}
      </div>
      {last?.error && last.served !== "fresh" && <Text variant="error" size="sm">{last.error}</Text>}
    </LayerCard>
  );
}

function Dashboard({ limits }: { limits: Limits }) {
  const toast = useKumoToastManager();
  const [subs, setSubs] = useState<SubView[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ open: boolean; sub: SubView | null }>({ open: false, sub: null });
  const [preview, setPreview] = useState<{ open: boolean; sub: SubView | null; result: PreviewResult | null; loading: boolean; error: string | null }>({ open: false, sub: null, result: null, loading: false, error: null });
  const [logs, setLogs] = useState<{ open: boolean; sub: SubView | null; logs: Awaited<ReturnType<typeof api.logs>>["logs"] | null }>({ open: false, sub: null, logs: null });
  const [confirm, setConfirm] = useState<{ open: boolean; kind: "rotate" | "archive" | "delete"; sub: SubView | null }>({ open: false, kind: "rotate", sub: null });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.subs().then((r) => { setSubs(r.subs); setLoadError(null); }).catch((e) => setLoadError(e instanceof Error ? e.message : String(e)));
  }, []);
  useEffect(load, [load]);

  const replace = (s: SubView) => setSubs((xs) => (xs ? (xs.some((x) => x.id === s.id) ? xs.map((x) => (x.id === s.id ? s : x)) : [s, ...xs]) : [s]));

  async function runPreview(sub: SubView) {
    setPreview({ open: true, sub, result: null, loading: true, error: null });
    try {
      const r = await api.preview(sub.id);
      setPreview({ open: true, sub, result: r.result, loading: false, error: null });
      if (r.sub) replace(r.sub);
    } catch (e) {
      setPreview({ open: true, sub, result: null, loading: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  async function openLogs(sub: SubView) {
    setLogs({ open: true, sub, logs: null });
    try {
      setLogs({ open: true, sub, logs: (await api.logs(sub.id)).logs });
    } catch (e) {
      toast.add({ title: "读取记录失败", description: e instanceof Error ? e.message : String(e), variant: "error" });
    }
  }

  async function doConfirm() {
    const { kind, sub } = confirm;
    if (!sub) return;
    setBusy(true);
    try {
      if (kind === "rotate") {
        replace((await api.rotate(sub.id)).sub);
        toast.add({ title: "已生成新地址", description: "旧地址已失效（410 已失效），记得在客户端里换成新地址。", variant: "success" });
      } else if (kind === "archive") {
        await api.archive(sub.id);
        setSubs((xs) => xs?.filter((x) => x.id !== sub.id) ?? null);
        toast.add({ title: "订阅已归档", description: "输出地址已停止服务（410 已失效）。", variant: "success" });
      } else {
        await api.remove(sub.id);
        setSubs((xs) => xs?.filter((x) => x.id !== sub.id) ?? null);
        toast.add({ title: "订阅已删除", variant: "success" });
      }
      setConfirm((c) => ({ ...c, open: false }));
    } catch (e) {
      toast.add({ title: "操作失败", description: e instanceof Error ? e.message : String(e), variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto grid max-w-6xl gap-5 px-5 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <Text variant="heading" size="lg" as="h1">我的订阅</Text>
          <Text variant="secondary" size="sm">
            {subs ? `${subs.length} / ${limits.maxSubs} 个` : " "} · 每个订阅每天最多被拉取 {limits.dailyPulls} 次
          </Text>
        </div>
        <Button variant="primary" icon={PlusIcon} disabled={!!subs && subs.length >= limits.maxSubs} onClick={() => setEditing({ open: true, sub: null })}>
          添加订阅
        </Button>
      </div>

      {loadError && <Banner variant="error" title="加载失败" description={loadError} action={<Button size="sm" variant="ghost" icon={XIcon} shape="square" aria-label="重试" onClick={load} />} />}
      {!subs && !loadError && (
        <div className="flex justify-center py-16"><Loader size={24} /></div>
      )}
      {subs && subs.length === 0 && (
        <LayerCard>
          <LayerCard.Primary>
            <Empty
              icon={<span className="text-kumo-inactive"><ArrowsLeftRightIcon size={48} /></span>}
              title="还没有订阅"
              description="添加原订阅地址，选一个覆写脚本，就能得到一个会自动同步脚本的输出地址。"
              contents={<Button variant="primary" icon={PlusIcon} onClick={() => setEditing({ open: true, sub: null })}>添加订阅</Button>}
            />
          </LayerCard.Primary>
        </LayerCard>
      )}
      {subs?.map((s) => (
        <SubCard
          key={s.id}
          sub={s}
          onEdit={() => setEditing({ open: true, sub: s })}
          onPreview={() => runPreview(s)}
          onLogs={() => openLogs(s)}
          onRotate={() => setConfirm({ open: true, kind: "rotate", sub: s })}
          onArchive={() => setConfirm({ open: true, kind: "archive", sub: s })}
          onDelete={() => setConfirm({ open: true, kind: "delete", sub: s })}
        />
      ))}

      <SubEditor
        open={editing.open}
        sub={editing.sub}
        limits={limits}
        onClose={() => setEditing((e) => ({ ...e, open: false }))}
        onSaved={(s) => {
          replace(s);
          setEditing({ open: false, sub: null });
        }}
      />
      <PreviewDialog open={preview.open} name={preview.sub?.name ?? ""} result={preview.result} loading={preview.loading} error={preview.error} onClose={() => setPreview((p) => ({ ...p, open: false }))} />

      <Dialog.Root open={logs.open} onOpenChange={(o) => !o && setLogs((l) => ({ ...l, open: false }))}>
        <Dialog size="xl" className="max-h-[90vh] overflow-y-auto px-6 py-5">
          <div className="grid gap-4">
            <Dialog.Title className="text-base font-semibold">拉取记录：{logs.sub?.name}</Dialog.Title>
            <Dialog.Description className="text-kumo-subtle">最近 30 条（每个订阅保留 100 条、30 天）。日志不记录订阅地址与节点内容。</Dialog.Description>
            {logs.logs ? <LogsTable logs={logs.logs} /> : <div className="flex justify-center py-8"><Loader size={20} /></div>}
            <div className="flex justify-end">
              <Dialog.Close render={(p) => <Button {...p} variant="secondary">关闭</Button>} />
            </div>
          </div>
        </Dialog>
      </Dialog.Root>

      <Dialog.Root open={confirm.open} onOpenChange={(o) => !o && setConfirm((c) => ({ ...c, open: false }))}>
        <Dialog size="base" className="px-6 py-5">
          <div className="grid gap-5">
            <div className="grid gap-1">
              <Dialog.Title className="text-base font-semibold">{confirm.kind === "rotate" ? "刷新输出地址？" : confirm.kind === "archive" ? `归档「${confirm.sub?.name}」？` : `删除「${confirm.sub?.name}」？`}</Dialog.Title>
              <Dialog.Description className="text-kumo-subtle">
                {confirm.kind === "rotate"
                  ? "会生成一个新地址，旧地址立即失效（客户端再拉取会收到 410 已失效）。适合地址泄露时使用。"
                  : confirm.kind === "archive"
                    ? "归档后订阅变成只读：不能再编辑、试运行、刷新地址或删除，也不能取消归档。输出地址立即停止服务（客户端会收到 410 已失效），兜底缓存会清除。"
                    : "订阅、拉取记录和兜底缓存都会删除，输出地址立即失效。"}
              </Dialog.Description>
            </div>
            <div className="flex justify-end gap-2">
              <Dialog.Close render={(p) => <Button {...p} variant="secondary">取消</Button>} />
              <Button variant={confirm.kind === "delete" ? "destructive" : "primary"} loading={busy} onClick={doConfirm}>
                {confirm.kind === "rotate" ? "刷新地址" : confirm.kind === "archive" ? "归档" : "删除"}
              </Button>
            </div>
          </div>
        </Dialog>
      </Dialog.Root>
    </main>
  );
}

export function HomePage({ limits, loginError, loginReady }: { limits: Limits; loginError: LoginError | null; loginReady: boolean }) {
  const { user } = useAuth();
  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <div className="flex-1">{user ? <Dashboard limits={limits} /> : <Landing loginError={loginError} loginReady={loginReady} />}</div>
      <AppFooter />
    </div>
  );
}
