// 拉取原订阅时可一键切换的 User-Agent 预设。
// 版本号核对于 2026-10-14：Chrome/Edge 155、Firefox 158、Safari 26、mihomo v1.19.32、Clash Verge Rev v2.5.8、FlClash v0.8.99。
// Quantumult X 只给关键字，版本号各设备不同。
// 机场面板一般只按关键字（clash.meta / mihomo / clash-verge / Quantumult%20X …）判断客户端，版本号旧一点也没关系。

export interface UaPreset {
  label: string;
  value: string;
}

export interface UaPresetGroup {
  title: string;
  presets: UaPreset[];
}

const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36";

export const UA_PRESET_GROUPS: UaPresetGroup[] = [
  {
    title: "mihomo 内核 / 客户端",
    presets: [
      { label: "clash.meta", value: "clash.meta/1.19.32" },
      { label: "mihomo", value: "mihomo/1.19.32" },
      { label: "FlClash", value: "FlClash/v0.8.99 clash-verge Platform/windows" },
      { label: "Clash Verge Rev", value: "clash-verge/v2.5.8" },
    ],
  },
  {
    title: "Quantumult X",
    presets: [{ label: "Quantumult X", value: "Quantumult%20X" }],
  },
  {
    title: "浏览器",
    presets: [
      { label: "Chrome", value: CHROME },
      { label: "Edge", value: `${CHROME} Edg/155.0.0.0` },
      { label: "Safari", value: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15" },
      { label: "Firefox", value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:158.0) Gecko/20100101 Firefox/158.0" },
    ],
  },
];
