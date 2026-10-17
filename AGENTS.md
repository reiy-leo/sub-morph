# AGENTS.md — Subscription Braces（订阅矫正）

> 给 AI 编程助手的项目说明。`CLAUDE.md` 指向本文件。更多资料在 `.agents/`（rules / prompts / memory / skills）。

## 目标

FlClash 等客户端用 URL 导入的覆写脚本不会同步、成败无反馈。Subscription Braces 在服务端「拉取原订阅 → 套用覆写脚本 → 输出成品订阅」，客户端只导入输出地址，用自带的订阅定时更新自动同步。部署在 **https://sub-morph.rei8t.dev**。

**显示名**：中文「订阅矫正」，英文「Subscription Braces」，任何地方都不加后缀。`<title>` 只用中文名（`src/html.ts` 的 `SITE_TITLE`）；页头中文名 + 英文名小号副标题；og:title / og:site_name 用英文名。仓库名、Worker 名 `sub-morph` 与域名不变（2026-10-14 由「订阅变形 / Sub Morph」改名）。

完整产品说明、脚本约定（含 Quantumult X 结构）、失败行为、配额见 [`docs/PRODUCT.md`](docs/PRODUCT.md)。

## 边界

- 多用户：任意 Google 账号登录即注册；`ADMIN_EMAILS`（默认 reiy.leoz@gmail.com）是管理员。
- 管理员看所有用户 / 订阅 / 拉取记录，但看不到原订阅地址、输出地址、节点内容（只有脱敏域名）。
- 不做：Base64 节点列表、其他客户端格式、跨格式转换、脚本联网、多脚本串联、订阅合并（详见 PRODUCT.md「明确不做」）。

## 技术栈

- **Worker**：TypeScript + Wrangler，无框架。路由、API、Google OAuth、输出地址 `/s/:token`，把「页面 + 数据」注入 HTML
- **脚本沙箱**：quickjs-emscripten（QuickJS → WebAssembly），限时 / 限内存 / 无网络（`src/sandbox.ts`）
- **格式**：`yaml`（Clash / Mihomo）、自写 QX 解析 / 序列化（`src/formats/qx.ts`）
- **存储**：D1（`migrations/`）+ KV（加密兜底缓存）
- **前端**：React 19 + [Kumo](https://github.com/cloudflare/kumo) + Tailwind v4 + Phosphor 图标，Vite 构建到 `public/`
- **语言 / 主题**：中文 UI；浅色 / 深色 / 跟随系统（`web/index.html` 的 `<head>` 内联脚本先设 `data-mode` 防闪烁，`web/src/theme.ts` 切换，localStorage `sm-theme`）

## 目录

```
src/
  worker.ts              Worker 入口：导入 src/vendor/quickjs.wasm 注入沙箱，再交给 index.ts
  index.ts               路由：/、/admin、/privacy、/licenses、/s/:token、/auth/*、/api/*；cron 清理
  pipeline.ts            拉取原订阅 → 识别 → 解析 → 脚本 → 序列化 → 兜底 → 记日志
  sandbox.ts             QuickJS 沙箱（main(config, ctx)）
  scripts.ts             解析脚本来源（内联 / URL 缓存 / 官方脚本），记录 hash
  formats/               clash.ts、qx.ts、index.ts（识别 + 统一接口）
  push.ts                推送模式：PUT /p/:token 接收设备推送的原订阅（KV push:<id>）
  subs.ts                订阅 CRUD、输出密钥（刷新 / 吊销）、日志查询
  official.ts            官方脚本 CRUD + 正则匹配
  auth.ts / session.ts   Google OAuth 2.0 + users 表 upsert，HMAC 签名 cookie
  crypto.ts              AES-GCM 加密、SHA-256、随机密钥
  urls.ts                URL 校验（禁内网 / 禁自身）、脱敏、错误信息去 URL
  quota.ts               D1 计数：每日配额、每分钟限流
  html.ts / env.ts / errors.ts
  shared/types.ts        Worker 与前端共用类型
  shared/status.ts       HTTP 状态码中文简注 statusLabel()
web/                     前端（React + Kumo）
  src/pages/             HomePage（介绍 / 我的订阅）、AdminPage、StaticPages（隐私、许可证、404）
  src/components/        AppHeader（含主题切换）、Auth、SubEditor、PreviewDialog、LogsTable、StatusBadge
migrations/              D1 迁移（只增不改）
worker-inline/           内联静态资源的部署入口（API Token 部署用）
scripts/                 copy-wasm.mjs、build-inline-assets.mjs、kumo-lint.mjs
test/run-tests.ts        node:sqlite 模拟 D1 + 内存 KV + 假上游，跑全流程
docs/PRODUCT.md          产品说明、脚本约定、限制、边界
.agents/                 skills / rules / prompts / memory
```

## 命令

```bash
pnpm install
cp .dev.vars.example .dev.vars        # 填 SESSION_SECRET、ENCRYPTION_KEY、Google client；或 AUTH_DISABLED=true
pnpm db:migrate:local                 # 本地 D1 建表
pnpm dev                              # 构建前端 + wrangler dev（http://localhost:8787）
pnpm typecheck                        # Worker + 前端类型检查
pnpm test                             # kumo-lint + 全流程测试
pnpm db:migrate:remote                # 线上 D1 迁移
pnpm deploy:inline                    # 部署（API Token：静态资源内联进脚本）
```

## 设计

全站设计以 **kumo-design** skill 为准（`.agents/skills/kumo-design/SKILL.md`），尽量用 Kumo 组件。要点：正文 14px、标题 sentence case、不用 `font-bold` / `tracking-*`、hover 不做颜色过渡、阴影配 `ring` 不配 `border`、LayerCard 不嵌套、Dialog 永远挂载用 `open` 控制、只用 `kumo-*` 语义色、不用 `dark:`。Input / InputArea 只给 `aria-label` 时不要传 `description`（Kumo 会渲染一个空的 label 行，控件上方出现大块空白）；说明文字改用控件下方的 `<Text variant="secondary" size="sm">`，或者直接给 `label`。`pnpm lint` 自动检查。

## 代码规范

- TypeScript strict；Worker 侧不引入框架
- Worker 与前端共用的放 `src/shared/`（纯类型 / 纯函数）
- 错误信息面向用户，用中文；API 统一 `{ error }` + 合适的状态码；**任何地方出现 HTTP 状态码都带中文简注**（`statusLabel()`，如「408 请求超时」），新状态码补进 `src/shared/status.ts`
- 新功能配测试（`test/run-tests.ts`）

## 禁止事项

- 不要提交任何密钥（`.dev.vars`、私钥、token）；不要把密钥写进文档或 memory
- 不要在 Worker 里 eval / new Function；脚本只进 QuickJS 沙箱，不给沙箱注入网络或密钥
- 不要明文存原订阅 URL、不要在日志里写完整 URL、不要默认存节点内容
- 不要绕过 `getUser()` / 归属校验 / 同源校验做写操作；不要放宽 `AUTH_DISABLED` 只认 localhost 的判断
- 不要修改已存在的 migration；不要更换线上 `ENCRYPTION_KEY`

## 工作约定

- **每轮对话完成后 commit 并 push**（main 分支，中文提交信息）。提交前 `pnpm typecheck && pnpm test`。
- 改限制 / 配额 / 脚本约定 → 同步 `docs/PRODUCT.md`、隐私页与 README。
- 重要决定记到 `.agents/memory/decisions.md`。
