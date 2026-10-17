// 隐私说明与免责声明、第三方许可证、404。
import type { ReactNode } from "react";
import { Button, Empty, LayerCard, Table, Text } from "@cloudflare/kumo";
import { CompassIcon } from "@phosphor-icons/react";
import type { Limits } from "../../../src/shared/types.ts";
import { AppFooter, AppHeader } from "../components/AppHeader.tsx";

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <main className="mx-auto grid w-full max-w-3xl flex-1 content-start gap-6 px-5 py-10">{children}</main>
      <AppFooter />
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-2">
      <Text variant="heading" as="h2">{title}</Text>
      <div className="grid gap-2 text-sm leading-6 text-kumo-default">{children}</div>
    </section>
  );
}

export function PrivacyPage({ limits }: { limits: Limits }) {
  return (
    <Shell>
      <div className="grid gap-1">
        <Text variant="heading" size="lg" as="h1">隐私说明与免责声明</Text>
        <Text variant="secondary" size="sm">更新于 2026-10-14</Text>
      </div>
      <Section title="我们保存什么">
        <p>· 账号：Google 账号的邮箱、名字、头像地址与登录时间，用于登录和区分用户。</p>
        <p>· 订阅设置：订阅名称、原订阅地址（AES-GCM 加密保存，界面与日志中只显示脱敏域名，如 su*.ex*****.com）、你选择的脚本（脚本地址或你粘贴的脚本内容）、输出地址的密钥（加密保存，另存其 SHA-256 用于查找）。</p>
        <p>· 投稿：只有你主动打开「提交为官方脚本」时，才会保存该脚本、订阅名称和原订阅的主机名（不含路径和 token），供管理员审核；通过后脚本会提供给同一机场的其他用户。</p>
        <p>· 拉取记录：时间、结果、HTTP 状态码、原订阅状态码、节点数量、脚本 hash 与是否变化、耗时、错误信息（错误信息中的链接会被替换为脱敏域名）。每个订阅保留最近 100 条，最多 30 天。</p>
        <p>· 计数：为了限流与每日配额，按订阅 / 用户 / IP 记录当天的请求次数，两天后清除。IP 只用于每分钟限流计数，不与账号关联保存。</p>
      </Section>
      <Section title="我们不保存、不分享什么">
        <p>· 节点内容（服务器地址、密码等）默认不保存：每次客户端拉取时实时从原订阅获取、在内存中处理后直接返回。</p>
        <p>· 只有当你在某个订阅上主动开启「失败时返回上次成功的结果」时，服务器才会加密保存该订阅最近一次成功的输出，仅用于失败兜底；关闭开关或删除订阅时立即删除。</p>
        <p>· 开启「推送模式」的订阅：服务器加密保存你的设备最近一次推送的原订阅内容（30 天过期），用于代替直连原订阅；关闭推送、归档或删除订阅时立即删除。</p>
        <p>· 不出售、不分享任何数据给第三方，不做分析或广告。管理员可以看到用户列表、订阅名称、脱敏域名和拉取记录，用于排查问题；管理员界面不显示原订阅地址、输出地址和节点内容。</p>
      </Section>
      <Section title="脚本沙箱">
        <p>覆写脚本在 QuickJS（WebAssembly）沙箱里运行：不能联网、不能读取任何密钥或其他用户的数据，单次最多运行 {limits.scriptTimeoutMs / 1000} 秒、使用 {limits.scriptMemoryMB} MB 内存，脚本大小不超过 {limits.maxScriptKB} KB。</p>
      </Section>
      <Section title="限流与配额">
        <p>每个账号最多 {limits.maxSubs} 个订阅；每个订阅每天最多被拉取 {limits.dailyPulls} 次；每个账号每天最多试运行 {limits.dailyPreviews} 次；同一 IP 每分钟有拉取次数上限。超出时返回「429 请求太频繁」。</p>
      </Section>
      <Section title="免责声明">
        <p>本服务只做格式转换与脚本执行，不提供、不推荐、不审查任何订阅或节点。你需要确保所使用的订阅来源及其用途符合你所在地区的法律法规与订阅提供方的服务条款，并自行承担由此产生的一切责任。</p>
        <p>服务按「现状」提供，不保证持续可用、不保证结果正确；因服务中断、脚本错误或配置错误造成的任何损失，本服务不承担责任。我们可能在发现滥用时停用账号或删除数据。</p>
      </Section>
      <Section title="删除数据">
        <p>删除订阅会同时删除它的拉取记录、兜底缓存和推送内容。需要删除账号，请联系 hi@rei8t.dev 或在 GitHub 仓库提 issue。</p>
      </Section>
    </Shell>
  );
}

const LICENSES = [
  ["QuickJS", "Fabrice Bellard、Charlie Gordon", "MIT", "https://bellard.org/quickjs/"],
  ["quickjs-emscripten", "Jake Teton-Landis", "MIT", "https://github.com/justjake/quickjs-emscripten"],
  ["yaml", "Eemeli Aro", "ISC", "https://github.com/eemeli/yaml"],
  ["jsdiff (diff)", "Kevin Decker", "BSD-3-Clause", "https://github.com/kpdecker/jsdiff"],
  ["Kumo", "Cloudflare", "MIT", "https://github.com/cloudflare/kumo"],
  ["Base UI", "MUI", "MIT", "https://github.com/mui/base-ui"],
  ["React / React DOM", "Meta", "MIT", "https://github.com/facebook/react"],
  ["Phosphor Icons", "Phosphor Icons", "MIT", "https://github.com/phosphor-icons/react"],
  ["Tailwind CSS", "Tailwind Labs", "MIT", "https://github.com/tailwindlabs/tailwindcss"],
  ["Motion", "Motion Division", "MIT", "https://github.com/motiondivision/motion"],
];

export function LicensesPage() {
  return (
    <Shell>
      <div className="grid gap-1">
        <Text variant="heading" size="lg" as="h1">第三方许可证</Text>
        <Text variant="secondary" size="sm">Subscription Braces 本身以 MIT 许可证开源。以下是打包进服务的第三方库。</Text>
      </div>
      <LayerCard className="overflow-x-auto p-0">
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.Head>项目</Table.Head>
              <Table.Head>作者</Table.Head>
              <Table.Head>许可证</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {LICENSES.map(([name, author, lic, url]) => (
              <Table.Row key={name}>
                <Table.Cell><a className="underline" href={url} target="_blank" rel="noreferrer">{name}</a></Table.Cell>
                <Table.Cell className="text-kumo-subtle">{author}</Table.Cell>
                <Table.Cell>{lic}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      </LayerCard>
    </Shell>
  );
}

export function NotFoundPage() {
  return (
    <Shell>
      <LayerCard>
        <LayerCard.Primary>
          <Empty
            icon={<span className="text-kumo-inactive"><CompassIcon size={48} /></span>}
            title="页面不存在（404 不存在）"
            description="链接可能写错了，或者你没有权限访问。"
            contents={<Button variant="primary" onClick={() => (location.href = "/")}>回到首页</Button>}
          />
        </LayerCard.Primary>
      </LayerCard>
    </Shell>
  );
}
