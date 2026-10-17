// 推送模式的设备端脚本：用设备自己的网络（家庭 IP）拉原订阅，PUT 到推送地址。
// macOS 用 launchd（系统自带，不需要 Homebrew / MacPorts），每 30 分钟一次，开机和唤醒后补跑。
const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

export function pushScript(src: string, dst: string, ua: string): string {
  return `#!/bin/bash
# Subscription Braces 推送脚本：拉原订阅 → 推送给服务端（不经过本机代理）
SRC=${q(src)}
DST=${q(dst)}
UA=${q(ua)}
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT; : > "$T/h"; : > "$T/b"
code=$(curl -sS --noproxy '*' -m 30 -A "$UA" -D "$T/h" -o "$T/b" -w '%{http_code}' "$SRC") || code=000
hdr=$(grep -iE '^(subscription-userinfo|profile-update-interval|profile-web-page-url|content-disposition|support-url):' "$T/h" | base64 | tr -d '\\n')
echo "$(date '+%F %T') 原订阅 $code → $(curl -sS --noproxy '*' -m 30 -X PUT -H "X-Upstream-Status: $code" -H "X-Upstream-Headers: $hdr" --data-binary @"$T/b" "$DST" | tr '\\n' ' ')"
`;
}

export function macInstall(id: string, src: string, dst: string, ua: string): string {
  const label = `dev.rei8t.sub-morph.${id}`;
  return `D="$HOME/Library/Application Support/sub-morph"; P="$HOME/Library/LaunchAgents/${label}.plist"
mkdir -p "$D" "$HOME/Library/LaunchAgents"
cat > "$D/push-${id}.sh" <<'SUBMORPH'
${pushScript(src, dst, ua)}SUBMORPH
chmod 700 "$D/push-${id}.sh"
cat > "$P" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${label}</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$D/push-${id}.sh</string></array>
  <key>StartInterval</key><integer>1800</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$HOME/Library/Logs/sub-morph-${id}.log</string>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/sub-morph-${id}.log</string>
</dict></plist>
PLIST
launchctl bootout gui/$(id -u) "$P" 2>/dev/null; launchctl bootstrap gui/$(id -u) "$P" && sleep 3 && tail -n 2 "$HOME/Library/Logs/sub-morph-${id}.log"
`;
}

export function macUninstall(id: string): string {
  const label = `dev.rei8t.sub-morph.${id}`;
  return `launchctl bootout gui/$(id -u)/${label}; rm -f "$HOME/Library/LaunchAgents/${label}.plist" "$HOME/Library/Application Support/sub-morph/push-${id}.sh"
`;
}

/** Linux / 路由器（OpenWrt 等）：crontab 每 30 分钟跑一次。 */
export function cronInstall(id: string, src: string, dst: string, ua: string): string {
  return `mkdir -p ~/.sub-morph && cat > ~/.sub-morph/push-${id}.sh <<'SUBMORPH'
${pushScript(src, dst, ua)}SUBMORPH
chmod 700 ~/.sub-morph/push-${id}.sh
(crontab -l 2>/dev/null | grep -v push-${id}.sh; echo "*/30 * * * * $HOME/.sub-morph/push-${id}.sh >> $HOME/.sub-morph/push-${id}.log 2>&1") | crontab -
~/.sub-morph/push-${id}.sh
`;
}
