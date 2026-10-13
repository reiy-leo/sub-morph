// 试运行的「原订阅 ↔ 输出」对比：宽窗口左右并排（上下滚动同步），窄窗口上下排列；默认只显示变化的行。
import { useEffect, useMemo, useRef, useState } from "react";
import { cn, Switch, Text } from "@cloudflare/kumo";
import { collapse, diffRows, type Row } from "../lib/diffRows.ts";

const LINE = 1.25; // rem，对应 leading-5
const ROWS = 20;

function useWide(query = "(min-width: 48rem)") {
  const [wide, setWide] = useState(() => typeof window === "undefined" || window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setWide(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [query]);
  return wide;
}

const tone = { same: "", del: "bg-kumo-danger-tint", add: "bg-kumo-success-tint" } as const;
const mark = { same: " ", del: "-", add: "+" } as const;

/** 一侧的代码面板。align=true 时对侧有行而本侧没有的位置留空行，保持左右对齐。 */
function Pane({ rows, side, align, label, title, paneRef, onScroll }: {
  rows: Row[]; side: "l" | "r"; align: boolean; label: string; title: string;
  paneRef?: React.Ref<HTMLDivElement>; onScroll?: (e: React.UIEvent<HTMLDivElement>) => void;
}) {
  const width = useMemo(() => String(rows.reduce((m, r) => (r.kind === "line" && r[side] ? Math.max(m, r[side]!.n) : m), 1)).length, [rows, side]);
  return (
    <div className="grid min-w-0 gap-1.5">
      <Text bold>{title}</Text>
      <div
        ref={paneRef}
        role="region"
        aria-label={label}
        tabIndex={0}
        onScroll={onScroll}
        className="overflow-auto rounded-lg bg-kumo-recessed py-2 font-mono text-xs leading-5 ring ring-kumo-line"
        style={{ maxHeight: `${ROWS * LINE + 1}rem` }}
      >
        <div className="w-max min-w-full">
          {rows.map((r, i) => {
            if (r.kind === "gap") {
              return (
                <div key={i} className="sticky left-0 bg-kumo-tint px-3 text-kumo-inactive select-none">
                  ⋯ {r.count} 行未变化
                </div>
              );
            }
            const c = r[side];
            if (!c) {
              return align ? <div key={i} className="h-5 bg-kumo-fill" aria-hidden /> : null;
            }
            return (
              <div key={i} className={cn("flex", tone[c.k])}>
                <span className={cn("sticky left-0 shrink-0 pr-2 pl-3 text-right text-kumo-inactive select-none", tone[c.k] || "bg-kumo-recessed")} style={{ minWidth: `${width + 2.5}ch` }}>
                  {c.n}
                </span>
                <span className="w-3 shrink-0 text-kumo-inactive select-none">{mark[c.k]}</span>
                <span className="pr-3 whitespace-pre">{c.t || " "}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * normalize：把原订阅按输出的书写习惯重新序列化（解析 → 用同一个序列化器输出），
 * 这样「- \n  name: x」与「- name: x」这类纯书写差异不会显示成变化。解析失败返回 null，按原文比较。
 */
export function DiffView({ before, after, beforeTitle, afterTitle, normalize }: { before: string; after: string; beforeTitle: string; afterTitle: string; normalize?: (s: string) => string | null }) {
  const wide = useWide();
  const [onlyChanges, setOnlyChanges] = useState(true);
  const [unify, setUnify] = useState(true);
  const normalized = useMemo(() => (normalize ? normalize(before) : null), [before, normalize]);
  const left = unify && normalized != null ? normalized : before;
  const diff = useMemo(() => diffRows(left, after), [left, after]);
  const rows = useMemo(() => (onlyChanges ? collapse(diff.rows) : diff.rows), [diff, onlyChanges]);
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const lock = useRef(false);
  // 左右并排时同步上下滚动（横向各自独立）
  const sync = (from: React.RefObject<HTMLDivElement | null>, to: React.RefObject<HTMLDivElement | null>) => () => {
    if (!wide || lock.current || !from.current || !to.current) return;
    lock.current = true;
    to.current.scrollTop = from.current.scrollTop;
    requestAnimationFrame(() => (lock.current = false));
  };

  if (diff.timedOut) {
    return <Text variant="secondary" size="sm">两边差异太大，对比超时，无法逐行比较。</Text>;
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Text variant="secondary" size="sm">
          {normalize && normalized == null ? "原订阅未能解析（可能被截断），按原文比较；" : ""}
          {diff.changed ? `${diff.changed} 行有变化（红色为原订阅中被改掉的行，绿色为输出中新增或改后的行）` : "两边内容完全相同"}
        </Text>
        <div className="flex flex-wrap items-center gap-4">
          {normalize && normalized != null && <Switch label="忽略书写格式差异" checked={unify} onCheckedChange={setUnify} />}
          <Switch label="只看变化的行" checked={onlyChanges} onCheckedChange={setOnlyChanges} />
        </div>
      </div>
      {rows.length > 0 && (
        <div className={cn("grid gap-3", wide && "grid-cols-2")}>
          <Pane rows={rows} side="l" align={wide} label={beforeTitle} title={beforeTitle} paneRef={leftRef} onScroll={sync(leftRef, rightRef)} />
          <Pane rows={rows} side="r" align={wide} label={afterTitle} title={afterTitle} paneRef={rightRef} onScroll={sync(rightRef, leftRef)} />
        </div>
      )}
    </div>
  );
}
