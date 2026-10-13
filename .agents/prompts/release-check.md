# 上线前检查

1. `pnpm typecheck && pnpm test` 通过
2. 新迁移已 `pnpm db:migrate:remote`
3. 线上 secrets 齐全：SESSION_SECRET、ENCRYPTION_KEY、GOOGLE_CLIENT_ID、GOOGLE_CLIENT_SECRET
4. `pnpm deploy:inline`（API Token 部署必须用内联版）
5. 验证：`/health` 200；首页、/privacy、/licenses 200；随便一个 `/s/<32位>` 返回 404 不存在；用一个测试订阅走通 200 + 透传 subscription-userinfo
6. 隐私说明、第三方许可证、限流配额与 docs/PRODUCT.md 一致
