// 主题：浅色 / 深色 / 跟随系统。<head> 里的内联脚本（web/index.html）先按 localStorage 设好 data-mode 避免闪烁，
// 这里负责切换与跟随系统变化。
export type ThemePref = "light" | "dark" | "system";
const KEY = "sm-theme";

export const getThemePref = (): ThemePref => {
  const v = localStorage.getItem(KEY);
  return v === "light" || v === "dark" ? v : "system";
};

export function applyTheme(pref: ThemePref) {
  const dark = pref === "dark" || (pref === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.mode = dark ? "dark" : "light";
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

export function setThemePref(pref: ThemePref) {
  if (pref === "system") localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, pref);
  applyTheme(pref);
}
