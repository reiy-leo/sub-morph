// 吸顶顶栏：左侧站点名（中文名 + 英文名小号副标题），右侧导航、主题切换、账号菜单 / 登录按钮。
import { useState, type ReactNode } from "react";
import { Button, DropdownMenu, Text } from "@cloudflare/kumo";
import { ArrowsLeftRightIcon, CaretDownIcon, DesktopIcon, GearSixIcon, GoogleLogoIcon, MoonIcon, SignOutIcon, SunIcon } from "@phosphor-icons/react";
import { useAuth } from "./Auth.tsx";
import { getThemePref, setThemePref, type ThemePref } from "../theme.ts";

const THEMES: { value: ThemePref; label: string; icon: typeof SunIcon }[] = [
  { value: "light", label: "浅色", icon: SunIcon },
  { value: "dark", label: "深色", icon: MoonIcon },
  { value: "system", label: "跟随系统", icon: DesktopIcon },
];

function ThemeMenu() {
  const [pref, setPref] = useState<ThemePref>(getThemePref);
  const Current = THEMES.find((t) => t.value === pref)!.icon;
  return (
    <DropdownMenu>
      <DropdownMenu.Trigger render={<Button variant="ghost" shape="square" icon={Current} aria-label="主题" />} />
      <DropdownMenu.Content align="end">
        {THEMES.map((t) => (
          <DropdownMenu.Item
            key={t.value}
            icon={t.icon}
            onClick={() => {
              setThemePref(t.value);
              setPref(t.value);
            }}
          >
            {t.label}
            {pref === t.value ? " ✓" : ""}
          </DropdownMenu.Item>
        ))}
      </DropdownMenu.Content>
    </DropdownMenu>
  );
}

export function AppHeader({ children }: { children?: ReactNode }) {
  const { user, loginUrl } = useAuth();
  return (
    <header className="sticky top-0 z-10 border-b border-kumo-line bg-kumo-base">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-5">
        <a href="/" className="flex min-w-0 items-center gap-2">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-kumo-brand text-white">
            <ArrowsLeftRightIcon size={16} weight="bold" />
          </span>
          <Text variant="heading" as="span">订阅变形</Text>
          <span className="hidden sm:inline">
            <Text variant="secondary" size="sm" as="span">Sub Morph</Text>
          </span>
        </a>
        <div className="flex min-w-0 items-center gap-1">
          {children}
          {user?.admin && (
            <Button variant="ghost" icon={GearSixIcon} onClick={() => (location.href = "/admin")}>
              <span className="hidden sm:inline">管理后台</span>
            </Button>
          )}
          <ThemeMenu />
          {user ? (
            <>
              <DropdownMenu>
                <DropdownMenu.Trigger
                  render={
                    <Button variant="ghost" icon={user.picture ? <img src={user.picture} alt="" className="size-5 rounded-full" referrerPolicy="no-referrer" /> : undefined}>
                      <span className="hidden max-w-40 truncate md:inline">{user.name ?? user.email}</span>
                      <CaretDownIcon />
                    </Button>
                  }
                />
                <DropdownMenu.Content align="end">
                  {/* Label 是 Base UI 的 GroupLabel，必须放在 Group 里，否则抛错白屏 */}
                  <DropdownMenu.Group>
                    <DropdownMenu.Label>{user.email}</DropdownMenu.Label>
                  </DropdownMenu.Group>
                  <DropdownMenu.Separator />
                  <DropdownMenu.Item icon={SignOutIcon} onClick={() => (document.getElementById("logout-form") as HTMLFormElement | null)?.submit()}>
                    退出登录
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu>
              <form id="logout-form" method="post" action="/auth/logout" hidden />
            </>
          ) : (
            <Button variant="secondary" icon={GoogleLogoIcon} onClick={() => (location.href = loginUrl())}>
              登录
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

export function AppFooter() {
  return (
    <footer className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-5 py-8 text-sm text-kumo-subtle">
      <span>Sub Morph · 订阅变形</span>
      <a className="hover:text-kumo-default" href="/privacy">隐私说明与免责声明</a>
      <a className="hover:text-kumo-default" href="/licenses">第三方许可证</a>
      <a className="hover:text-kumo-default" href="https://github.com/reiy-leo/sub-morph" target="_blank" rel="noreferrer">GitHub</a>
    </footer>
  );
}
