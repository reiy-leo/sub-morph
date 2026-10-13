const rtf = new Intl.RelativeTimeFormat("zh-CN", { numeric: "auto" });

export function fmtRelative(ms: number | null | undefined): string {
  if (!ms) return "—";
  const diff = (ms - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 45) return "刚刚";
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), "day");
  return fmtTime(ms);
}

export function fmtTime(ms: number | null | undefined): string {
  if (!ms) return "—";
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function fmtBytes(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export const shortHash = (h: string | null | undefined) => (h ? h.slice(0, 8) : "—");

export const FORMAT_LABEL: Record<string, string> = { auto: "自动识别", clash: "Clash / Mihomo", qx: "Quantumult X" };
export const MODE_LABEL: Record<string, string> = { none: "不使用脚本", official: "官方脚本", url: "脚本地址", inline: "脚本内容" };
