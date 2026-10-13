// 管理后台：官方脚本（正则 + 脚本）、用户、订阅、拉取记录。只有 ADMIN_EMAILS 能进。
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Banner, Button, Dialog, Empty, Input, InputArea, LayerCard, Loader, Switch, Table, Tabs, Text, useKumoToastManager } from "@cloudflare/kumo";
import { ArrowClockwiseIcon, GoogleLogoIcon, LockKeyIcon, PencilSimpleIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react";
import type { FetchLogView, OfficialScriptView, UserView } from "../../../src/shared/types.ts";
import { api, type AdminSub, type OfficialDraft } from "../api.ts";
import { useAuth } from "../components/Auth.tsx";
import { AppFooter, AppHeader } from "../components/AppHeader.tsx";
import { LogsTable } from "../components/LogsTable.tsx";
import { LastBadge } from "../components/StatusBadge.tsx";
import { FORMAT_LABEL, fmtRelative, fmtTime, MODE_LABEL, shortHash } from "../format.ts";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const EMPTY: OfficialDraft = { name: "", description: "", pattern: "", sourceType: "url", scriptUrl: "", scriptContent: "", enabled: true, priority: 0 };

function OfficialEditor({ open, script, onClose, onSaved }: { open: boolean; script: OfficialScriptView | null; onClose: () => void; onSaved: (s: OfficialScriptView) => void }) {
  const [d, setD] = useState<OfficialDraft>(EMPTY);
  const [testUrl, setTestUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setError(null);
    setD(script ? { name: script.name, description: script.description, pattern: script.pattern, sourceType: script.sourceType, scriptUrl: script.scriptUrl, scriptContent: script.scriptContent, enabled: script.enabled, priority: script.priority } : EMPTY);
  }, [open, script]);
  const set = <K extends keyof OfficialDraft>(k: K, v: OfficialDraft[K]) => setD((x) => ({ ...x, [k]: v }));
  const test = useMemo(() => {
    if (!d.pattern || !testUrl) return null;
    try {
      return new RegExp(d.pattern, "i").test(testUrl) ? "命中" : "未命中";
    } catch {
      return "正则语法错误";
    }
  }, [d.pattern, testUrl]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const r = script ? await api.admin.updateOfficial(script.id, d) : await api.admin.createOfficial(d);
      onSaved(r.script);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog size="lg" className="max-h-[90vh] overflow-y-auto px-6 py-5">
        <div className="grid gap-5">
          <Dialog.Title className="text-base font-semibold">{script ? "编辑官方脚本" : "添加官方脚本"}</Dialog.Title>
          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
              <Input label="名称" placeholder="如：某某机场去广告分组" value={d.name} onChange={(e) => set("name", e.target.value)} />
              <Input label="优先级" type="number" value={String(d.priority)} onChange={(e) => set("priority", Number(e.target.value) || 0)} description="大的先匹配" />
            </div>
            <Input label="说明（用户能看到）" value={d.description} onChange={(e) => set("description", e.target.value)} />
            <Input label="正则（匹配原订阅 URL，不区分大小写）" placeholder="^https://([a-z0-9-]+\.)?example\.com/" className="font-mono" value={d.pattern} onChange={(e) => set("pattern", e.target.value)} />
            <div className="grid gap-1.5">
              <Input label="测试 URL" placeholder="粘贴一个订阅地址测试正则（只在浏览器里测试）" value={testUrl} onChange={(e) => setTestUrl(e.target.value)} />
              {test && <Badge variant={test === "命中" ? "green" : test === "未命中" ? "neutral" : "red"}>{test}</Badge>}
            </div>
            <Tabs value={d.sourceType} onValueChange={(v) => set("sourceType", v as "url" | "inline")} tabs={[{ value: "url", label: "脚本地址" }, { value: "inline", label: "脚本内容" }]} />
            {d.sourceType === "url" ? (
              <Input aria-label="脚本地址" placeholder="https://raw.githubusercontent.com/…/override.js" value={d.scriptUrl} onChange={(e) => set("scriptUrl", e.target.value)} description="运行时拉取（缓存 5 分钟），记录 hash 与变化时间。" />
            ) : (
              <InputArea aria-label="脚本内容" rows={10} className="font-mono text-sm" value={d.scriptContent} onValueChange={(v) => set("scriptContent", v)} />
            )}
            <Switch label="启用" checked={d.enabled} onCheckedChange={(v) => set("enabled", v)} />
          </div>
          {error && <Banner variant="error" title="保存失败" description={error} />}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>取消</Button>
            <Button variant="primary" loading={saving} onClick={save}>保存</Button>
          </div>
        </div>
      </Dialog>
    </Dialog.Root>
  );
}

function OfficialTab() {
  const toast = useKumoToastManager();
  const [list, setList] = useState<OfficialScriptView[] | null>(null);
  const [editing, setEditing] = useState<{ open: boolean; script: OfficialScriptView | null }>({ open: false, script: null });
  const [del, setDel] = useState<OfficialScriptView | null>(null);
  const load = useCallback(() => void api.admin.official().then((r) => setList(r.scripts)).catch((e) => toast.add({ title: "加载失败", description: errMsg(e), variant: "error" })), [toast]);
  useEffect(load, [load]);
  const replace = (s: OfficialScriptView) => setList((xs) => (xs?.some((x) => x.id === s.id) ? xs.map((x) => (x.id === s.id ? s : x)) : [...(xs ?? []), s]));

  async function refresh(s: OfficialScriptView) {
    try {
      const r = await api.admin.refreshOfficial(s.id);
      replace(r.script);
      toast.add({ title: r.changed ? "脚本有变化" : "脚本没有变化", description: `hash ${shortHash(r.hash)}`, variant: "success" });
    } catch (e) {
      toast.add({ title: "拉取失败", description: errMsg(e), variant: "error" });
    }
  }
  async function toggle(s: OfficialScriptView, enabled: boolean) {
    try {
      replace((await api.admin.updateOfficial(s.id, { ...s, enabled })).script);
    } catch (e) {
      toast.add({ title: "操作失败", description: errMsg(e), variant: "error" });
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <Text variant="secondary" size="sm">用户的原订阅 URL 命中正则时，会提示「匹配到官方脚本」并可一键使用。</Text>
        <Button variant="primary" icon={PlusIcon} onClick={() => setEditing({ open: true, script: null })}>添加</Button>
      </div>
      {!list ? (
        <div className="flex justify-center py-10"><Loader size={20} /></div>
      ) : list.length === 0 ? (
        <LayerCard><LayerCard.Primary><Empty title="还没有官方脚本" description="添加一个「正则 + 脚本」对。" /></LayerCard.Primary></LayerCard>
      ) : (
        <LayerCard className="overflow-x-auto p-0">
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.Head>名称</Table.Head>
                <Table.Head>正则</Table.Head>
                <Table.Head>脚本</Table.Head>
                <Table.Head>hash / 变化</Table.Head>
                <Table.Head>启用</Table.Head>
                <Table.Head className="w-28" />
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {list.map((s) => (
                <Table.Row key={s.id}>
                  <Table.Cell className="max-w-48">
                    <div className="truncate font-medium">{s.name}</div>
                    <div className="truncate text-xs text-kumo-subtle">优先级 {s.priority}</div>
                  </Table.Cell>
                  <Table.Cell className="max-w-56"><code className="block truncate text-xs">{s.pattern}</code></Table.Cell>
                  <Table.Cell className="max-w-56">
                    {s.sourceType === "url" ? <span className="block truncate text-xs" title={s.scriptUrl}>{s.scriptUrl}</span> : <Badge variant="neutral">内联 · {s.scriptContent.length} 字</Badge>}
                  </Table.Cell>
                  <Table.Cell className="whitespace-nowrap text-xs">
                    <code>{shortHash(s.lastHash)}</code>
                    <div className="text-kumo-subtle">{s.lastChangedAt ? `${fmtRelative(s.lastChangedAt)}变化` : "—"}</div>
                  </Table.Cell>
                  <Table.Cell><Switch aria-label="启用" checked={s.enabled} onCheckedChange={(v) => toggle(s, v)} /></Table.Cell>
                  <Table.Cell>
                    <div className="flex justify-end gap-0.5">
                      {s.sourceType === "url" && <Button size="sm" variant="ghost" shape="square" icon={ArrowClockwiseIcon} aria-label="立即拉取" onClick={() => refresh(s)} />}
                      <Button size="sm" variant="ghost" shape="square" icon={PencilSimpleIcon} aria-label="编辑" onClick={() => setEditing({ open: true, script: s })} />
                      <Button size="sm" variant="ghost" shape="square" icon={TrashIcon} aria-label="删除" onClick={() => setDel(s)} />
                    </div>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </LayerCard>
      )}
      <OfficialEditor open={editing.open} script={editing.script} onClose={() => setEditing((e) => ({ ...e, open: false }))} onSaved={(s) => { replace(s); setEditing({ open: false, script: null }); }} />
      <Dialog.Root open={!!del} onOpenChange={(o) => !o && setDel(null)}>
        <Dialog size="base" className="px-6 py-5">
          <div className="grid gap-5">
            <div className="grid gap-1">
              <Dialog.Title className="text-base font-semibold">删除「{del?.name}」？</Dialog.Title>
              <Dialog.Description className="text-kumo-subtle">正在使用它的订阅会改为「不使用脚本」。</Dialog.Description>
            </div>
            <div className="flex justify-end gap-2">
              <Dialog.Close render={(p) => <Button {...p} variant="secondary">取消</Button>} />
              <Button
                variant="destructive"
                onClick={async () => {
                  if (!del) return;
                  try {
                    await api.admin.removeOfficial(del.id);
                    setList((xs) => xs?.filter((x) => x.id !== del.id) ?? null);
                    setDel(null);
                  } catch (e) {
                    toast.add({ title: "删除失败", description: errMsg(e), variant: "error" });
                  }
                }}
              >
                删除
              </Button>
            </div>
          </div>
        </Dialog>
      </Dialog.Root>
    </div>
  );
}

function UsersTab({ onPick }: { onPick: (u: UserView) => void }) {
  const [users, setUsers] = useState<UserView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => void api.admin.users().then((r) => setUsers(r.users)).catch((e) => setError(errMsg(e))), []);
  if (error) return <Banner variant="error" title="加载失败" description={error} />;
  if (!users) return <div className="flex justify-center py-10"><Loader size={20} /></div>;
  return (
    <LayerCard className="overflow-x-auto p-0">
      <Table>
        <Table.Header>
          <Table.Row>
            <Table.Head>用户</Table.Head>
            <Table.Head>订阅数</Table.Head>
            <Table.Head>注册</Table.Head>
            <Table.Head>最近登录</Table.Head>
            <Table.Head className="w-24" />
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {users.map((u) => (
            <Table.Row key={u.id}>
              <Table.Cell>
                <div className="flex items-center gap-2">
                  {u.picture && <img src={u.picture} alt="" className="size-6 rounded-full" referrerPolicy="no-referrer" />}
                  <div className="min-w-0">
                    <div className="truncate">{u.name ?? u.email} {u.admin && <Badge variant="blue">管理员</Badge>}</div>
                    <div className="truncate text-xs text-kumo-subtle">{u.email}</div>
                  </div>
                </div>
              </Table.Cell>
              <Table.Cell className="tabular-nums">{u.subs}</Table.Cell>
              <Table.Cell className="whitespace-nowrap text-kumo-subtle">{fmtTime(u.createdAt)}</Table.Cell>
              <Table.Cell className="whitespace-nowrap text-kumo-subtle">{fmtRelative(u.lastLoginAt)}</Table.Cell>
              <Table.Cell><Button size="sm" variant="ghost" onClick={() => onPick(u)}>看订阅</Button></Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
    </LayerCard>
  );
}

function SubsTab({ user, onClear, onLogs }: { user: UserView | null; onClear: () => void; onLogs: (s: AdminSub) => void }) {
  const [subs, setSubs] = useState<AdminSub[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setSubs(null);
    api.admin.subs(user?.id).then((r) => setSubs(r.subs)).catch((e) => setError(errMsg(e)));
  }, [user]);
  if (error) return <Banner variant="error" title="加载失败" description={error} />;
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2">
        <Text variant="secondary" size="sm">{user ? `只显示 ${user.email} 的订阅` : "全部用户的订阅（最多 500 条）"}。原订阅地址和输出地址对管理员也不可见，只显示脱敏域名。</Text>
        {user && <Button size="sm" variant="ghost" onClick={onClear}>显示全部</Button>}
      </div>
      {!subs ? (
        <div className="flex justify-center py-10"><Loader size={20} /></div>
      ) : (
        <LayerCard className="overflow-x-auto p-0">
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.Head>订阅</Table.Head>
                <Table.Head>用户</Table.Head>
                <Table.Head>格式 / 脚本</Table.Head>
                <Table.Head>最近拉取</Table.Head>
                <Table.Head className="w-24" />
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {subs.map((s) => (
                <Table.Row key={s.id}>
                  <Table.Cell className="max-w-52">
                    <div className="truncate">{s.name}</div>
                    <div className="truncate text-xs text-kumo-subtle">{s.host}</div>
                  </Table.Cell>
                  <Table.Cell className="max-w-48 truncate text-kumo-subtle">{s.userEmail}</Table.Cell>
                  <Table.Cell className="whitespace-nowrap text-xs">
                    {s.detectedFormat ? FORMAT_LABEL[s.detectedFormat] : FORMAT_LABEL[s.format]}
                    <div className="text-kumo-subtle">{s.scriptMode === "official" ? `官方 · ${s.officialName ?? "?"}` : MODE_LABEL[s.scriptMode]}</div>
                  </Table.Cell>
                  <Table.Cell className="whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span className="text-kumo-subtle">{fmtRelative(s.last?.at)}</span>
                      <LastBadge last={s.last} />
                    </div>
                  </Table.Cell>
                  <Table.Cell><Button size="sm" variant="ghost" onClick={() => onLogs(s)}>记录</Button></Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </LayerCard>
      )}
    </div>
  );
}

function LogsTab({ sub, onClear }: { sub: AdminSub | null; onClear: () => void }) {
  const [logs, setLogs] = useState<FetchLogView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    setLogs(null);
    api.admin.logs(sub ? { sub: sub.id } : {}).then((r) => setLogs(r.logs)).catch((e) => setError(errMsg(e)));
  }, [sub]);
  useEffect(load, [load]);
  if (error) return <Banner variant="error" title="加载失败" description={error} />;
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2">
        <Text variant="secondary" size="sm">{sub ? `只显示「${sub.name}」` : "全站最近 100 条"}。</Text>
        {sub && <Button size="sm" variant="ghost" onClick={onClear}>显示全部</Button>}
        <Button size="sm" variant="ghost" icon={ArrowClockwiseIcon} onClick={load}>刷新</Button>
      </div>
      {logs ? <LayerCard className="p-0"><LogsTable logs={logs} showOwner /></LayerCard> : <div className="flex justify-center py-10"><Loader size={20} /></div>}
    </div>
  );
}

export function AdminPage() {
  const { user, loginUrl } = useAuth();
  const [tab, setTab] = useState("official");
  const [pickedUser, setPickedUser] = useState<UserView | null>(null);
  const [pickedSub, setPickedSub] = useState<AdminSub | null>(null);

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <main className="mx-auto grid w-full max-w-6xl flex-1 content-start gap-5 px-5 py-8">
        {!user ? (
          <LayerCard>
            <LayerCard.Primary>
              <Empty
                icon={<span className="text-kumo-inactive"><LockKeyIcon size={48} /></span>}
                title="管理后台需要登录"
                description="只有管理员账号可以进入。"
                contents={<Button variant="primary" icon={GoogleLogoIcon} onClick={() => (location.href = loginUrl())}>使用 Google 登录</Button>}
              />
            </LayerCard.Primary>
          </LayerCard>
        ) : (
          <>
            <Text variant="heading" size="lg" as="h1">管理后台</Text>
            <Tabs
              value={tab}
              onValueChange={setTab}
              tabs={[
                { value: "official", label: "官方脚本" },
                { value: "users", label: "用户" },
                { value: "subs", label: "订阅" },
                { value: "logs", label: "拉取记录" },
              ]}
            />
            {tab === "official" && <OfficialTab />}
            {tab === "users" && <UsersTab onPick={(u) => { setPickedUser(u); setTab("subs"); }} />}
            {tab === "subs" && <SubsTab user={pickedUser} onClear={() => setPickedUser(null)} onLogs={(s) => { setPickedSub(s); setTab("logs"); }} />}
            {tab === "logs" && <LogsTab sub={pickedSub} onClear={() => setPickedSub(null)} />}
          </>
        )}
      </main>
      <AppFooter />
    </div>
  );
}
