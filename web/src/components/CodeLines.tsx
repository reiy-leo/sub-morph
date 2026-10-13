// 带行号的只读代码框（试运行的原订阅 / 输出）与带行号的脚本编辑框。
// 行高固定 1.25rem（text-xs leading-5），行号与内容一一对应；不自动换行，长行横向滚动。
import { useMemo, useRef, useState } from "react";
import { cn, inputVariants } from "@cloudflare/kumo";

const LINE = 1.25; // rem，对应 leading-5
const PAD = 0.75; // rem，对应 py-3

const countLines = (s: string) => (s ? s.split("\n").length : 1);
const numbers = (n: number) => Array.from({ length: n }, (_, i) => i + 1).join("\n");

/** 只读代码框：最多显示 `rows` 行的高度，超出滚动；左侧行号横向滚动时保持不动。 */
export function CodeView({ text, rows = 10, label }: { text: string; rows?: number; label: string }) {
  const n = useMemo(() => countLines(text), [text]);
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className="overflow-auto rounded-lg bg-kumo-recessed font-mono text-xs leading-5 ring ring-kumo-line"
      style={{ maxHeight: `${rows * LINE + PAD * 2}rem` }}
    >
      <div className="flex min-w-max">
        <pre aria-hidden className="sticky left-0 shrink-0 bg-kumo-recessed py-3 pr-3 pl-3 text-right text-kumo-inactive select-none">{numbers(n)}</pre>
        <pre className="py-3 pr-3 whitespace-pre">{text}</pre>
      </div>
    </div>
  );
}

/** 脚本编辑框：textarea + 同步滚动的行号栏，固定 `rows` 行高（默认 20 行），超出滚动。 */
export function CodeEditor({ value, onValueChange, placeholder, rows = 20, label }: { value: string; onValueChange: (v: string) => void; placeholder?: string; rows?: number; label: string }) {
  const [scrollTop, setScrollTop] = useState(0);
  const ref = useRef<HTMLTextAreaElement>(null);
  const n = useMemo(() => Math.max(countLines(value || placeholder || ""), rows), [value, placeholder, rows]);
  return (
    <div className={cn(inputVariants({ parentFocusIndicator: true }), "flex h-auto overflow-hidden px-0 font-mono text-xs leading-5")}>
      <div aria-hidden className="shrink-0 overflow-hidden border-r border-kumo-line bg-kumo-recessed text-kumo-inactive select-none">
        <pre className="py-3 pr-2.5 pl-3 text-right" style={{ transform: `translateY(${-scrollTop}px)` }}>{numbers(n)}</pre>
      </div>
      <textarea
        ref={ref}
        aria-label={label}
        rows={rows}
        wrap="off"
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        className="kumo-input-placeholder min-w-0 flex-1 resize-none overflow-auto bg-transparent px-3 py-3 whitespace-pre outline-none"
        style={{ height: `${rows * LINE + PAD * 2}rem` }}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onValueChange(e.target.value)}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        onKeyDown={(e) => {
          // Tab 插入两个空格，而不是跳出输入框
          if (e.key !== "Tab" || e.shiftKey || e.altKey || e.metaKey || e.ctrlKey) return;
          e.preventDefault();
          const t = e.currentTarget;
          const { selectionStart: a, selectionEnd: b } = t;
          onValueChange(t.value.slice(0, a) + "  " + t.value.slice(b));
          requestAnimationFrame(() => ref.current?.setSelectionRange(a + 2, a + 2));
        }}
      />
    </div>
  );
}
