import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toasty } from "@cloudflare/kumo";
import type { PageData, PageKind } from "../../src/shared/types.ts";
import { App } from "./App.tsx";
import "./styles.css";

const DEMO: Omit<PageData, "kind" | "user"> = {
  loginError: null,
  limits: { maxSubs: 20, dailyPulls: 300, dailyPreviews: 100, maxScriptKB: 256, scriptTimeoutMs: 3000, scriptMemoryMB: 48 },
  origin: location.origin,
  loginReady: true,
};

function readPageData(): PageData {
  const el = document.getElementById("page-data");
  if (el?.textContent) {
    try {
      return JSON.parse(el.textContent) as PageData;
    } catch {
      /* fall through */
    }
  }
  // vite dev 直接打开时没有注入数据：用 ?page= 预览各页面（API 仍需 wrangler dev）
  const kind = (new URLSearchParams(location.search).get("page") ?? "home") as PageKind | "guest";
  const user = { id: "dev", email: "dev@localhost", name: "本地开发", admin: true };
  if (kind === "guest") return { ...DEMO, kind: "home", user: null };
  return { ...DEMO, kind, user };
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Toasty>
      <App page={readPageData()} />
    </Toasty>
  </StrictMode>,
);
