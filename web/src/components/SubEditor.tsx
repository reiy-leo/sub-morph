// 新建 / 编辑订阅对话框。原订阅地址变化时检查是否命中官方脚本，命中则提示一键使用。
import { useEffect, useState } from "react";
import { Banner, Button, Dialog, Input, InputArea, Select, Switch, Tabs, Text, useKumoToastManager } from "@cloudflare/kumo";
import { SealCheckIcon } from "@phosphor-icons/react";
import type { Limits, OfficialMatch, SubView } from "../../../src/shared/types.ts";
import { api, type SubDraft } from "../api.ts";
import { FORMAT_LABEL } from "../format.ts";

const EMPTY: SubDraft = { name: "", url: "", format: "auto", userAgent: "", scriptMode: "none", officialId: null, scriptUrl: "", scriptContent: "", fallback: false };

const SAMPLE = `// main(config, ctx) 返回修改后的 config
// Clash：config 就是订阅 YAML 解析后的对象；Quantumult X：见「脚本约定」
function main(config, ctx) {
  config.proxies = (config.proxies || []).filter((p) => !/过期|剩余|官网/.test(p.name || p.tag || ""));
  return config;
}
`;

export function SubEditor({ open, sub, limits, onClose, onSaved }: { open: boolean; sub: SubView | null; limits: Limits; onClose: () => void; onSaved: (s: SubView) => void }) {
  const toast = useKumoToastManager();
  const [d, setD] = useState<SubDraft>(EMPTY);
  const [match, setMatch] = useState<OfficialMatch | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setD(
      sub
        ? { name: sub.name, url: sub.url ?? "", format: sub.format, userAgent: sub.userAgent, scriptMode: sub.scriptMode, officialId: sub.officialId, scriptUrl: sub.scriptUrl, scriptContent: sub.scriptContent, fallback: sub.fallback }
        : EMPTY,
    );
    setMatch(sub?.officialId && sub.officialName ? { id: sub.officialId, name: sub.officialName, description: "" } : null);
  }, [open, sub]);

  // 原订阅地址变化 → 查官方脚本（防抖 400ms）
  useEffect(() => {
    if (!open || !/^https?:\/\/\S+/i.test(d.url)) {
      if (open && !d.url) setMatch(null);
      return;
    }
    const t = setTimeout(() => {
      api.match(d.url).then((r) => setMatch(r.match)).catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [d.url, open]);

  const set = <K extends keyof SubDraft>(k: K, v: SubDraft[K]) => setD((x) => ({ ...x, [k]: v }));
  const useOfficial = () => match && setD((x) => ({ ...x, scriptMode: "official", officialId: match.id }));

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const r = sub ? await api.update(sub.id, d) : await api.create(d);
      toast.add({ title: sub ? "已保存，输出地址不变" : "订阅已创建", variant: "success" });
      onSaved(r.sub);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const modeTabs = [
    { value: "none", label: "不用脚本" },
    ...(match || d.scriptMode === "official" ? [{ value: "official", label: "官方脚本" }] : []),
    { value: "url", label: "脚本地址" },
    { value: "inline", label: "脚本内容" },
  ];

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog size="lg" className="max-h-[90vh] overflow-y-auto px-6 py-5">
        <div className="grid gap-5">
          <div className="grid gap-1">
            <Dialog.Title className="text-base font-semibold">{sub ? "编辑订阅" : "添加订阅"}</Dialog.Title>
            <Dialog.Description className="text-kumo-subtle">
              {sub ? "修改不会改变输出地址，客户端下次更新时自动生效。" : "保存后会生成一个输出地址，把它导入 FlClash / Clash Verge / Quantumult X。"}
            </Dialog.Description>
          </div>

          <div className="grid gap-4">
            <Input label="原订阅地址" placeholder="https://机场域名/api/v1/client/subscribe?token=…" value={d.url} onChange={(e) => set("url", e.target.value)} />
            {match && d.scriptMode !== "official" && (
              <Banner
                variant="default"
                icon={<SealCheckIcon weight="fill" />}
                title={`匹配到官方脚本「${match.name}」`}
                description={match.description || "管理员为这个订阅源准备了覆写脚本。"}
                action={<Button size="sm" variant="primary" onClick={useOfficial}>一键使用</Button>}
              />
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="名称" placeholder="不填则用域名" value={d.name} onChange={(e) => set("name", e.target.value)} />
              <Select label="订阅格式" value={d.format} onValueChange={(v) => set("format", (v as SubDraft["format"]) ?? "auto")} items={FORMAT_LABEL}>
                {Object.entries(FORMAT_LABEL).map(([k, l]) => (
                  <Select.Option key={k} value={k}>{l}</Select.Option>
                ))}
              </Select>
            </div>

            <div className="grid gap-3">
              <Text bold>覆写脚本</Text>
              <Tabs value={d.scriptMode} onValueChange={(v) => setD((x) => ({ ...x, scriptMode: v as SubDraft["scriptMode"], officialId: v === "official" ? (match?.id ?? x.officialId) : x.officialId }))} tabs={modeTabs} />
              {d.scriptMode === "official" && (
                <Text variant="secondary" size="sm">使用官方脚本「{match?.name ?? sub?.officialName ?? "未知"}」，管理员更新后自动同步。</Text>
              )}
              {d.scriptMode === "url" && (
                <div className="grid gap-1.5">
                  <Input aria-label="脚本地址" placeholder="https://raw.githubusercontent.com/…/override.js" value={d.scriptUrl} onChange={(e) => set("scriptUrl", e.target.value)} />
                  <Text variant="secondary" size="sm">每次客户端更新时拉取（缓存 5 分钟），脚本变化会记录在拉取记录里。</Text>
                </div>
              )}
              {d.scriptMode === "inline" && (
                <div className="grid gap-1.5">
                  <InputArea aria-label="脚本内容" rows={10} className="font-mono text-sm" value={d.scriptContent || ""} placeholder={SAMPLE} onValueChange={(v) => set("scriptContent", v)} />
                  <Text variant="secondary" size="sm">{`定义 main(config, ctx) 并 return config；最大 ${limits.maxScriptKB} KB，限时 ${limits.scriptTimeoutMs / 1000} 秒，无网络。`}</Text>
                </div>
              )}
            </div>

            <details className="grid gap-3">
              <summary className="cursor-pointer text-sm text-kumo-subtle">高级设置</summary>
              <div className="mt-3 grid gap-4">
                <Input label="拉取原订阅时的 User-Agent" placeholder="留空：客户端拉取时用客户端自己的 UA，试运行用 clash.meta" value={d.userAgent} onChange={(e) => set("userAgent", e.target.value)} />
                <Switch
                  label="失败时返回上次成功的结果"
                  checked={d.fallback}
                  onCheckedChange={(v) => set("fallback", v)}
                />
                <Text variant="secondary" size="sm">
                  关闭（默认）：失败时返回错误码，客户端会提示更新失败并继续用它本地的旧配置，服务器不保存任何节点内容。
                  开启：服务器加密保存最近一次成功结果，失败时以 200 返回它（响应头带 X-Sub-Morph-Fallback）。
                </Text>
              </div>
            </details>
          </div>

          {error && <Banner variant="error" title="保存失败" description={error} />}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>取消</Button>
            <Button variant="primary" loading={saving} onClick={save}>{sub ? "保存" : "创建并生成地址"}</Button>
          </div>
        </div>
      </Dialog>
    </Dialog.Root>
  );
}
