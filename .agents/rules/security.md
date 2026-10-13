# 安全规则

- 原订阅 URL 是敏感信息：只以 `encrypt()` 后的密文存库（`source_enc`），界面 / 日志 / 管理后台只出现 `maskHost()` 的脱敏域名；任何写进日志或错误信息的文本都要过 `scrubUrls()`。
- 输出密钥只存密文（`token_enc`）+ SHA-256（`token_hash`）；刷新或删除时把旧 hash 写进 `revoked_tokens`（返回 410）。
- 覆写脚本只能在 `src/sandbox.ts` 的 QuickJS 沙箱里执行；不要给沙箱注入 fetch、env、绑定或任何宿主函数（console 除外）。不要在 Worker 里用 eval / new Function。
- 节点内容默认不落库；只有订阅开启 fallback 时，才把输出加密写进 KV `fb:<subId>`，关闭 / 删除时清除。
- 原订阅 / 脚本地址必须过 `checkRemoteUrl()`（只允许公网 http(s)，禁止本服务自己的域名）。
- 写请求必须同源（`sameOrigin`）；用户只能操作自己的订阅；`/api/admin/*` 必须 `user.admin`。
- 页面数据注入 HTML 时必须转义 `<`（见 `src/html.ts`）。
- 密钥（Google client secret、SESSION_SECRET、ENCRYPTION_KEY、deploy key、API token）不入库、不写进文档或 memory。本地放 `.dev.vars`，线上用 `wrangler secret put`。`ENCRYPTION_KEY` 上线后不能改。
- `AUTH_DISABLED` 只对 localhost 生效，不要放宽这个判断。
- HTTP 状态码出现在任何界面 / 错误信息里都要带中文简注（`src/shared/status.ts` 的 `statusLabel`）。
