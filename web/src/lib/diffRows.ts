// 把「原订阅 → 输出」按行做 diff，转成左右对齐的行；可折叠未变化的行，只留变化处上下几行上下文。
import { diffLines } from "diff";

export type Cell = { n: number; t: string; k: "same" | "del" | "add" };
export type Row = { kind: "line"; l?: Cell; r?: Cell } | { kind: "gap"; count: number };
export type DiffResult = { rows: Row[]; changed: number; timedOut: boolean };

const split = (v: string) => {
  const a = v.split("\n");
  if (a.length > 1 && a[a.length - 1] === "") a.pop();
  return a;
};

/** 计算左右对齐的行。超时（大文件且差异很大）时 timedOut=true，rows 为空。 */
export function diffRows(oldText: string, newText: string, timeoutMs = 1500): DiffResult {
  const changes = diffLines(oldText.replace(/\r\n/g, "\n"), newText.replace(/\r\n/g, "\n"), { timeout: timeoutMs });
  if (!changes) return { rows: [], changed: 0, timedOut: true };
  const rows: Row[] = [];
  let ln = 1;
  let rn = 1;
  let changed = 0;
  for (let i = 0; i < changes.length; i++) {
    const c = changes[i]!;
    if (!c.added && !c.removed) {
      for (const t of split(c.value)) rows.push({ kind: "line", l: { n: ln++, t, k: "same" }, r: { n: rn++, t, k: "same" } });
      continue;
    }
    // 一段删除紧跟一段新增：两边逐行配对
    let del: string[] = [];
    let add: string[] = [];
    if (c.removed) {
      del = split(c.value);
      if (changes[i + 1]?.added) add = split(changes[++i]!.value);
    } else add = split(c.value);
    const m = Math.max(del.length, add.length);
    for (let j = 0; j < m; j++) {
      rows.push({
        kind: "line",
        l: j < del.length ? { n: ln++, t: del[j]!, k: "del" } : undefined,
        r: j < add.length ? { n: rn++, t: add[j]!, k: "add" } : undefined,
      });
    }
    changed += m;
  }
  return { rows, changed, timedOut: false };
}

/** 只保留变化行及其上下 `context` 行，其余折叠成 gap。 */
export function collapse(rows: Row[], context = 3): Row[] {
  const isChange = (r: Row) => r.kind === "line" && (r.l?.k !== "same" || r.r?.k !== "same");
  const keep = new Array<boolean>(rows.length).fill(false);
  rows.forEach((r, i) => {
    if (!isChange(r)) return;
    for (let j = Math.max(0, i - context); j <= Math.min(rows.length - 1, i + context); j++) keep[j] = true;
  });
  const out: Row[] = [];
  let gap = 0;
  rows.forEach((r, i) => {
    if (keep[i]) {
      if (gap) out.push({ kind: "gap", count: gap });
      gap = 0;
      out.push(r);
    } else gap++;
  });
  if (gap) out.push({ kind: "gap", count: gap });
  return out;
}
