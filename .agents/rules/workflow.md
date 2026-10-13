# 工作约定

- **每轮对话完成后 commit 并 push**（main 分支，提交信息用中文，说清改了什么）。
- 提交前跑 `pnpm typecheck && pnpm test`，都过了再推。
- 改了限制 / 配额 / 脚本约定 → 同步 `docs/PRODUCT.md`、隐私页（`web/src/pages/StaticPages.tsx`）与 README。
- 改了表结构：新增 `migrations/000N_xxx.sql`，不要改已有迁移；部署前 `pnpm db:migrate:remote`。
- 新增第三方运行时依赖 → 补进许可证页（`StaticPages.tsx` 的 `LICENSES`）。
