// Worker 入口（wrangler.jsonc 的 main）：在 workerd 里把 QuickJS 的 wasm 作为模块导入并注入沙箱。
// 测试直接用 src/index.ts（Node 里 quickjs 自己加载 wasm）。
import wasm from "./vendor/quickjs.wasm";
import app from "./index.ts";
import { setQuickJSWasm } from "./sandbox.ts";

setQuickJSWasm(wasm as WebAssembly.Module);

export default app;
