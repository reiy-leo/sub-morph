# 订阅变形（Sub Morph）产品说明

## 一句话

FlClash 等客户端用 URL 导入的覆写脚本不会自动同步、成败也没有反馈。Sub Morph 在服务端完成「拉取原订阅 → 套用覆写脚本 → 输出成品订阅」，客户端只导入输出地址，用自带的订阅定时更新即可同步脚本的改动。域名 **https://sub-morph.rei8t.dev**。

显示名：中文「订阅变形」，英文「Sub Morph」，不加任何后缀。

## 用户与权限

| 角色 | 能做什么 |
| --- | --- |
| 访客 | 看首页介绍、隐私说明、第三方许可证；用别人分享的输出地址（靠不可猜的密钥）拉取订阅 |
| 用户（任意 Google 账号登录） | 管理自己的订阅：添加 / 编辑 / 删除、试运行、看拉取记录、刷新输出地址 |
| 管理员（`ADMIN_EMAILS`，默认 reiy.leoz@gmail.com） | 以上全部 + 管理后台：官方脚本增删改启停与立即拉取；查看所有用户、订阅、拉取记录 |

管理员也看不到别人的原订阅地址、输出地址和节点内容，只看到脱敏域名（如 `su*.ex*****.com`）。

## 功能

### 订阅
- 原订阅 URL：支持 Clash / Mihomo YAML 与 Quantumult X，默认自动识别，也可手动指定。Base64 节点列表（V2Ray/SS 订阅）暂不支持，会给出明确提示。
- 覆写脚本四选一：不用脚本 / 官方脚本 / 脚本地址（运行时拉取，缓存 `SCRIPT_CACHE_SECONDS` 秒，默认 300）/ 脚本内容（直接粘贴）。
- 原订阅 URL 命中某个官方脚本的正则 → 编辑框里提示「匹配到官方脚本「名称」」，一键使用。
- 输出地址 `https://sub-morph.rei8t.dev/s/<密钥>`：密钥 24 字节随机数（192 bit）。编辑订阅或脚本，地址不变；「刷新地址」生成新地址，旧地址立即失效（`410 已失效`）。不存在的地址返回 `404 不存在`。
- 输出格式跟随输入：Clash YAML 进 → Clash YAML 出；QX 进 → QX 出。
- 透传原订阅的响应头 `subscription-userinfo`、`profile-update-interval`、`profile-web-page-url`、`content-disposition`、`support-url`，客户端照样显示流量和到期。原订阅没给文件名时用订阅名称。
- 拉取原订阅时的 User-Agent：订阅里填了就用；否则客户端拉取时透传客户端自己的 UA（机场常按 UA 返回不同格式），试运行用 `clash.meta`（QX 订阅用 `Quantumult%20X/1.0`）。
- 每个订阅显示：最近拉取时间、结果（成功 / 失败兜底 / 失败 + 状态码）、原订阅状态码、节点数、脚本 hash 与最近变化时间。
- 试运行：完整走一遍流程，展示结果、console 输出、输出内容开头 8 KB（只返回给本人，不落库）。
- 拉取记录：每次拉取一条（来源：客户端 / 试运行），每个订阅保留 100 条、最多 30 天。

### 失败时的行为

| 情况 | 返回 |
| --- | --- |
| 原订阅返回非 2xx / 连接失败 | `502 网关错误`（正文写明原订阅返回的状态码，如「原订阅返回 403 禁止访问」） |
| 原订阅超时（15 秒） | `504 网关超时` |
| 无法识别格式 / 解析失败 / 脚本报错 / 脚本超时或超内存 / 脚本返回值不对 | `422 无法处理` |
| 远端脚本拉取失败且没有旧缓存 | `502 网关错误` |
| 超出每日配额或 IP 限流 | `429 请求太频繁` |

- 默认（兜底关闭）：直接返回上表的错误码与中文说明。客户端会提示更新失败并继续使用它本地的旧配置；服务器不保存任何节点内容。
- 兜底开启（每个订阅可配置）：每次客户端拉取成功后，把输出加密存进 KV（60 天过期）；失败时以 `200` 返回上次成功结果，响应头带 `X-Sub-Morph-Fallback: 1` 和 `X-Sub-Morph-Error`。关闭开关或删除订阅时立即删除缓存。
- 所有输出响应都带 `X-Sub-Morph-Served: fresh | fallback | error`。

### 官方脚本（管理后台）
- 「正则 + 脚本」对：名称、说明（用户可见）、正则（JS 语法，不区分大小写，匹配原订阅完整 URL）、脚本（URL 或内容）、启用开关、优先级（大的先匹配）。
- 脚本为 URL 时运行时拉取，记录 hash、最近拉取时间、最近变化时间；后台可「立即拉取」跳过缓存。
- 删除官方脚本时，使用它的订阅改为「不使用脚本」。

## 脚本约定

与 FlClash / Clash Verge 一致：

```js
function main(config, ctx) {
  // ctx = { name: 订阅名称, format: "clash" | "qx", trigger: "client" | "preview" }
  return config; // 可以返回 Promise
}
```

- 兼容 `const main = (config) => …`、`export default function main`、`module.exports = main`。
- 运行环境：QuickJS（WebAssembly）沙箱，只有 ECMAScript 内置对象 + `console`（输出收集到试运行结果，最多 50 行 / 4000 字）。**没有** `fetch`、定时器、`require`、任何绑定或密钥。
- 限制：执行 `SCRIPT_TIMEOUT_MS`（默认 3000 毫秒）、内存 `SCRIPT_MEMORY_MB`（默认 48 MB）、脚本大小 `MAX_SCRIPT_KB`（默认 256 KB）。
- `config` 与返回值在宿主和沙箱之间以 JSON 传递：返回值必须是可 JSON 序列化的对象。

### Clash / Mihomo

`config` 就是订阅 YAML 解析后的对象（`proxies`、`proxy-groups`、`rules`……），返回后序列化回 YAML。

### Quantumult X

QX 文本先解析成下面的结构交给脚本，脚本返回同样结构的对象，再序列化回 QX 文本：

```ts
interface QxConfig {
  format: "quantumultx";
  kind: "list" | "full";      // list：纯节点列表（没有 [段落]，如服务器订阅/server_remote 资源）；full：完整配置
  proxies: QxProxy[];         // [server_local] 或纯列表里的节点
  policies: QxPolicy[];       // [policy] 里的策略组
  rules: string[];            // [filter_local] 的每一行，原样字符串，如 "host-suffix, google.com, proxy"
  sections: Record<string, string[]>; // 其余段落的原样行，key 为小写段名：general、dns、server_remote、
                              // filter_remote、rewrite_remote、rewrite_local、task_local、http_backend、mitm…
                              // 无法解析的节点 / 策略行也原样放在 sections.server_local / sections.policy
                              // 第一个段落之前的内容（注释）在 sections._head
  order: string[];            // 段落输出顺序（小写段名）；新出现的段落按 QX 常规顺序追加
}
interface QxProxy {           // shadowsocks=1.2.3.4:443, method=aes-128-gcm, password=pw, tag=HK 01
  type: string;               // "shadowsocks" | "vmess" | "vless" | "trojan" | "http" | "socks5" | …（小写）
  server: string;             // "1.2.3.4"（IPv6 不带方括号）
  port: number;               // 443
  tag: string;                // "HK 01"（节点名，序列化时放在最后）
  params: Record<string, string>; // 其余 key=value，保持原顺序；没有 "=" 的项值为 ""，序列化时只输出 key
}
interface QxPolicy {          // static=Proxy, HK 01, direct, img-url=a.png
  type: string;               // "static" | "available" | "round-robin" | "dest-hash" | "url-latency-benchmark" | "ssid"
  name: string;               // "Proxy"
  members: string[];          // 不含 "=" 的项：["HK 01", "direct"]
  params: Record<string, string>; // 含 "=" 的项：{ "img-url": "a.png" }
}
```

- `kind: "list"` 输出时只输出节点行（每行一个），忽略 policies / rules / sections。
- 节点行的注释与空行不保留；其他段落原样保留（含注释）。
- 例：给所有节点名加前缀

```js
function main(config) {
  config.proxies.forEach((p) => (p.tag = "🇭🇰 " + p.tag));
  return config;
}
```

## 安全与隐私

- 原订阅 URL 与输出密钥用 AES-GCM 加密存进 D1（密钥 `ENCRYPTION_KEY`，与 `SESSION_SECRET` 分开）；输出地址按 SHA-256(密钥) 查找。
- 日志与管理后台不记录、不显示完整 URL：错误信息里的链接替换成脱敏域名。
- 原订阅 / 脚本地址只能是公网 http(s)，不能指向内网，也不能是本服务自己的地址（防套娃）。
- 写操作要求同源（`Origin`），cookie `SameSite=Lax`。
- 节点内容默认不存储；兜底开启时才加密保存最近一次成功输出。

## 限流与配额（wrangler vars，可调）

| 变量 | 默认 | 含义 |
| --- | --- | --- |
| `MAX_SUBS` | 20 | 每个账号最多订阅数 |
| `DAILY_PULLS` | 300 | 每个订阅每天最多被客户端拉取次数 |
| `DAILY_PREVIEWS` | 100 | 每个账号每天最多试运行次数 |
| `IP_PER_MINUTE` | 30 | 每个 IP 每分钟最多访问输出地址次数 |
| `MAX_SUB_MB` | 5 | 原订阅大小上限 |
| `MAX_SCRIPT_KB` / `SCRIPT_TIMEOUT_MS` / `SCRIPT_MEMORY_MB` | 256 / 3000 / 48 | 脚本限制 |

计数存在 D1 `usage` 表，每天定时任务（UTC 19:17）清理过期计数、30 天前的日志、7 天前的脚本缓存。

## 明确不做（MVP）

- Base64 / V2Ray 节点列表、Surge / Loon / sing-box 等其他格式；跨格式转换（YAML ⇄ QX）
- 多个脚本串联、脚本里联网（`fetch`）
- 订阅合并、节点测速
- 用户之间分享脚本 / 脚本市场
- 账号停用的管理界面（表里有 `disabled` 字段，暂时手动改）
