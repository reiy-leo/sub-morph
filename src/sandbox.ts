// 覆写脚本沙箱：QuickJS（quickjs-emscripten，MIT）跑在 WebAssembly 里。
// Workers 禁止 eval / new Function，所以脚本不在宿主 JS 里执行；沙箱里没有 fetch、没有任何
// 绑定和密钥，只有 ECMAScript 内置对象 + 一个只收集输出的 console。限时（中断处理器）、限内存、限栈。
//
// 脚本约定（与 FlClash / Clash Verge 一致）：定义 main(config, ctx)，返回修改后的 config（可以是 Promise）。
import { newQuickJSWASMModuleFromVariant, newVariant, shouldInterruptAfterDeadline, type QuickJSHandle, type QuickJSWASMModule } from "quickjs-emscripten-core";
import baseVariant from "@jitl/quickjs-wasmfile-release-sync";

export class ScriptError extends Error {}

let wasmModule: WebAssembly.Module | undefined;
/** Worker 入口（src/worker.ts）在 workerd 里注入编译好的 wasm；Node 测试不需要。 */
export function setQuickJSWasm(m: WebAssembly.Module) {
  wasmModule = m;
}

let modulePromise: Promise<QuickJSWASMModule> | undefined;
function quickjs(): Promise<QuickJSWASMModule> {
  modulePromise ??= newQuickJSWASMModuleFromVariant(wasmModule ? newVariant(baseVariant, { wasmModule }) : baseVariant).catch((e) => {
    modulePromise = undefined;
    throw e;
  });
  return modulePromise;
}

export interface RunOptions {
  timeoutMs: number;
  memoryMB: number;
  meta: Record<string, unknown>;
}
export interface RunResult {
  output: unknown;
  console: string[];
}

const MAX_CONSOLE_LINES = 50;
const MAX_CONSOLE_CHARS = 4000;

/** 兼容 `export default function main` / `export function main` / `module.exports = main` 写法。 */
function normalize(code: string): string {
  return code
    .replace(/^\uFEFF/, "")
    .replace(/^\s*export\s+default\s+(async\s+)?function\s+main\b/m, "$1function main")
    .replace(/^\s*export\s+(?=(async\s+)?function\s+main\b|const\s+main\b|let\s+main\b|var\s+main\b)/m, "");
}

const RUNNER = `(function () {
  var m = typeof main === "function" ? main
    : (typeof module === "object" && module && typeof module.exports === "function") ? module.exports
    : (typeof module === "object" && module && module.exports && typeof module.exports.main === "function") ? module.exports.main
    : null;
  if (!m) throw new Error("脚本没有定义 main(config) 函数");
  return m(JSON.parse(__input), JSON.parse(__meta));
})()`;

export async function runScript(code: string, config: unknown, opts: RunOptions): Promise<RunResult> {
  const QuickJS = await quickjs();
  const rt = QuickJS.newRuntime();
  const logs: string[] = [];
  let chars = 0;
  try {
    rt.setMemoryLimit(opts.memoryMB * 1024 * 1024);
    rt.setMaxStackSize(1024 * 1024);
    const deadline = Date.now() + opts.timeoutMs;
    rt.setInterruptHandler(shouldInterruptAfterDeadline(deadline));
    const ctx = rt.newContext();
    try {
      // console：只收集文本，最多 50 行 / 4000 字
      const con = ctx.newObject();
      for (const level of ["log", "info", "warn", "error", "debug"]) {
        const fn = ctx.newFunction(level, (...args) => {
          if (logs.length >= MAX_CONSOLE_LINES || chars >= MAX_CONSOLE_CHARS) return;
          const line = args
            .map((a) => {
              const t = ctx.typeof(a);
              if (t === "string") return ctx.getString(a);
              try {
                const s = JSON.stringify(ctx.dump(a));
                return s === undefined ? t : s;
              } catch {
                return t;
              }
            })
            .join(" ");
          const text = (level === "log" || level === "info" || level === "debug" ? "" : `[${level}] `) + line;
          const clipped = text.slice(0, MAX_CONSOLE_CHARS - chars);
          chars += clipped.length;
          logs.push(clipped);
        });
        ctx.setProp(con, level, fn);
        fn.dispose();
      }
      ctx.setProp(ctx.global, "console", con);
      con.dispose();
      const moduleObj = ctx.unwrapResult(ctx.evalCode("var module = { exports: {} }; var exports = module.exports; module"));
      moduleObj.dispose();
      for (const [k, v] of [["__input", JSON.stringify(config)], ["__meta", JSON.stringify(opts.meta)]] as const) {
        const h = ctx.newString(v);
        ctx.setProp(ctx.global, k, h);
        h.dispose();
      }

      const fail = (h: QuickJSHandle, prefix: string): never => {
        const err = ctx.dump(h);
        h.dispose();
        throw new ScriptError(describe(err, Date.now() >= deadline, prefix));
      };
      const load = ctx.evalCode(normalize(code), "override.js");
      if (load.error) fail(load.error, "脚本加载失败");
      else load.value.dispose();

      const run = ctx.evalCode(RUNNER, "runner.js");
      if (run.error) fail(run.error, "脚本执行失败");
      let result = (run as { value: QuickJSHandle }).value;

      // main 返回 Promise：跑完微任务队列再取结果（沙箱里没有定时器和网络，异步只能是 Promise 链）
      const first = ctx.getPromiseState(result);
      if (!(first.type === "fulfilled" && first.notAPromise)) {
        if (first.type === "fulfilled") first.value.dispose();
        else if (first.type === "rejected") first.error.dispose();
        for (let i = 0; i < 1000 && ctx.getPromiseState(result).type === "pending"; i++) {
          const jobs = rt.executePendingJobs(64);
          if (jobs.error) {
            result.dispose();
            fail(jobs.error, "脚本执行失败");
          }
          if (Date.now() >= deadline) {
            result.dispose();
            throw new ScriptError("脚本执行超时");
          }
          if ((jobs as { value: number }).value === 0) break;
        }
        const s = ctx.getPromiseState(result);
        result.dispose();
        if (s.type === "pending") throw new ScriptError("main 返回的 Promise 一直没有完成（沙箱里没有网络和定时器）");
        if (s.type === "rejected") fail(s.error, "脚本执行失败");
        result = (s as { value: QuickJSHandle }).value;
      }

      ctx.setProp(ctx.global, "__out", result);
      result.dispose();
      const json = ctx.evalCode("__out === undefined ? 'undefined' : JSON.stringify(__out)", "serialize.js");
      if (json.error) fail(json.error, "脚本结果无法序列化");
      const jv = (json as { value: QuickJSHandle }).value;
      const text = ctx.getString(jv);
      jv.dispose();
      if (text === "undefined") throw new ScriptError("main 没有返回值（记得 return config）");
      const output = JSON.parse(text);
      if (!output || typeof output !== "object" || Array.isArray(output)) throw new ScriptError("main 需要返回配置对象");
      return { output, console: logs };
    } finally {
      ctx.dispose();
    }
  } catch (e) {
    if (e instanceof ScriptError) {
      (e as ScriptError & { console?: string[] }).console = logs;
      throw e;
    }
    const msg = e instanceof Error ? e.message : String(e);
    const err = new ScriptError(/memory|out of memory/i.test(msg) ? `脚本超出内存上限（${opts.memoryMB} MB）` : `沙箱错误：${msg}`);
    (err as ScriptError & { console?: string[] }).console = logs;
    throw err;
  } finally {
    try {
      rt.dispose();
    } catch {
      // 释放失败（如内存超限后）：丢弃整个 wasm 实例，下次重新初始化
      modulePromise = undefined;
    }
  }
}

function describe(err: unknown, timedOut: boolean, prefix: string): string {
  if (timedOut) return "脚本执行超时";
  if (err && typeof err === "object") {
    const e = err as { name?: string; message?: string; stack?: string };
    if (e.message === "interrupted" || e.name === "InternalError" && /interrupted/.test(e.message ?? "")) return "脚本执行超时";
    if (/out of memory/i.test(e.message ?? "")) return "脚本超出内存上限";
    const loc = e.stack ? /override\.js:(\d+)(?::(\d+))?/.exec(e.stack) : null;
    return `${prefix}：${e.name ?? "Error"}: ${e.message ?? ""}${loc ? `（第 ${loc[1]} 行）` : ""}`;
  }
  return `${prefix}：${String(err)}`;
}
