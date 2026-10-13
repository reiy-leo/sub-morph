// 官方脚本正则：整串匹配（full match），从 URL 开头匹配到结尾，不区分大小写。
// 写法里的 ^ / $ 可省略；需要匹配后续路径时自己写 .*。
export function compilePattern(pattern: string): RegExp | null {
  try {
    return new RegExp(`^(?:${pattern})$`, "i");
  } catch {
    return null;
  }
}

export const fullMatch = (pattern: string, url: string) => compilePattern(pattern)?.test(url) ?? false;
