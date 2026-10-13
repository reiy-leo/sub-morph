# 决策日志（新的在上）

## 2026-10-14 初始化
- 存储：D1（users / subscriptions / official_scripts / fetch_logs / script_cache / usage / revoked_tokens）；KV 只放加密的兜底输出。
- 脚本沙箱：quickjs-emscripten（release-sync 变体），wasm 由 `scripts/copy-wasm.mjs` 复制到 `src/vendor/` 再作为 CompiledWasm 模块导入（wrangler 不给 node_modules 里的 .wasm 配 loader）。每次执行新建 runtime，超时用中断处理器；超时/超内存后 runtime 释放可能断言失败，此时丢弃整个 wasm 实例下次重建。
- 兜底默认关闭：失败时返回错误码，客户端自己保留旧配置，服务器不存节点内容；开启才加密缓存上次成功输出（与隐私说明一致）。
- 客户端拉取时透传客户端 UA 给原订阅（机场按 UA 返回格式）。
- 管理员看不到原订阅地址与输出地址（只看脱敏域名），只能看记录。
- 不支持 Base64 节点列表与跨格式转换（MVP 外）。
- 部署：API Token + 内联静态资源（wrangler.inline.jsonc）。
