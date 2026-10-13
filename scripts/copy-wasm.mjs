// 把 QuickJS 的 wasm 复制到 src/vendor/（wrangler 只对项目内相对路径的 .wasm 启用 CompiledWasm 规则）。
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const src = require.resolve("@jitl/quickjs-wasmfile-release-sync/wasm");
mkdirSync(new URL("../src/vendor/", import.meta.url), { recursive: true });
copyFileSync(src, new URL("../src/vendor/quickjs.wasm", import.meta.url));
console.log("copied quickjs.wasm");
