# Sub Morph · 订阅变形

拉取原订阅 → 套用覆写脚本 → 输出成品订阅。客户端（FlClash、Clash Verge、Mihomo、Quantumult X…）只导入输出地址，靠自带的订阅定时更新就能同步脚本改动，每次拉取的成败都有记录。

线上：https://sub-morph.rei8t.dev

## 功能

- Google 登录，多用户；管理员维护「正则 + 脚本」官方脚本，订阅地址命中时一键使用
- 支持 Clash / Mihomo YAML 与 Quantumult X（自动识别），输出格式跟随输入
- 脚本接口与 FlClash / Clash Verge 一致：`function main(config, ctx) { return config }`，在 QuickJS 沙箱里运行（无网络、限时、限内存）；QX 的结构化约定见 [docs/PRODUCT.md](docs/PRODUCT.md#quantumult-x)
- 输出地址带 192 bit 随机密钥；编辑不变，「刷新地址」后旧地址返回 410 已失效
- 透传 `subscription-userinfo` 等流量头；失败返回带中文说明的状态码，或（可选）返回上次成功结果
- 原订阅地址加密存储、日志脱敏、默认不存节点内容；每日配额与 IP 限流

## 开发

```bash
pnpm install
cp .dev.vars.example .dev.vars   # 填 SESSION_SECRET、ENCRYPTION_KEY（openssl rand -base64 48），本地可 AUTH_DISABLED=true
pnpm db:migrate:local
pnpm dev                         # http://localhost:8787
pnpm typecheck && pnpm test
```

## 部署（Cloudflare Workers）

```bash
npx wrangler d1 create sub-morph-db          # 把 database_id 填进 wrangler*.jsonc
npx wrangler kv namespace create sub-morph-CACHE
pnpm db:migrate:remote
npx wrangler secret put SESSION_SECRET -c wrangler.inline.jsonc
npx wrangler secret put ENCRYPTION_KEY -c wrangler.inline.jsonc
npx wrangler secret put GOOGLE_CLIENT_ID -c wrangler.inline.jsonc
npx wrangler secret put GOOGLE_CLIENT_SECRET -c wrangler.inline.jsonc
pnpm deploy:inline
```

Google Cloud OAuth 客户端的授权回调：`https://sub-morph.rei8t.dev/auth/callback`、`http://localhost:8787/auth/callback`。

## 许可证

MIT。第三方库许可证见站内 /licenses。
