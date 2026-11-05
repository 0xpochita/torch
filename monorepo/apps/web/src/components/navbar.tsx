"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Sym, type IconName } from "@/components/icons";
import { ThemeToggle } from "@/components/theme-toggle";

type NavItem = { href: string; label: string; icon: IconName; badge?: string };

const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "Marketplace",
    items: [
      { href: "/", label: "Explore", icon: "house" },
      { href: "/create", label: "Create ETF", icon: "plusCircle", badge: "New" },
    ],
  },
  {
    group: "Library",
    items: [
      { href: "/vaults", label: "My Vaults", icon: "vault" },
      { href: "/activity", label: "Activity", icon: "pulse" },
      { href: "/favorites", label: "Favorites", icon: "heart" },
    ],
  },
];

/** Torch app icon (squircle). */
export function Logo({ size = 36 }: { size?: number }) {
  return (
    <span className="relative block shrink-0 overflow-hidden rounded-[23%] shadow-[0_0_0_0.5px_#00000014]" style={{ width: size, height: size }}>
      <Image src="/brand/torch-icon.png" alt="Torch" fill sizes={`${size * 2}px`} className="scale-[1.04] object-cover" priority />
    </span>
  );
}

function useActive() {
  const path = usePathname();
  return (href: string) => (href === "/" ? path === "/" || path.startsWith("/etf") : path.startsWith(href));
}

/** Floating glass sidebar (iPadOS style); collapses to icons on medium screens. */
export function Sidebar() {
  const isActive = useActive();

  return (
    <div className="sticky top-0 hidden h-screen shrink-0 p-3 pr-0 md:block">
      <aside className="material flex h-full w-[68px] flex-col rounded-[28px] px-2.5 py-5 xl:w-[244px] xl:px-3.5">
        <Link href="/" className="flex items-center gap-3 px-1">
          <Logo size={38} />
          <span className="hidden flex-col leading-tight xl:flex">
            <span className="text-[17px] font-semibold">Torch</span>
            <span className="text-[12px] text-muted">testnet · mock</span>
          </span>
        </Link>

        <nav className="mt-7 flex flex-col gap-5">
          {NAV.map((g) => (
            <div key={g.group} className="flex flex-col gap-0.5">
              <span className="hidden px-3 pb-1 text-[13px] font-semibold text-muted xl:block">{g.group}</span>
              {g.items.map((it) => {
                const active = isActive(it.href);
                return (
                  <Link
                    key={it.label}
                    href={it.href}
                    title={it.label}
                    className={`flex h-10 items-center justify-center gap-3 rounded-full px-3 text-[15px] transition xl:justify-start ${
                      active ? "bg-fill font-semibold text-ink" : "text-text/85 hover:bg-fill/60"
                    }`}
                  >
                    <Sym name={it.icon} size={19} />
                    <span className="hidden xl:inline">{it.label}</span>
                    
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="mt-auto flex flex-col gap-2">
          <div className="hidden xl:block">
            <ThemeToggle />
          </div>
          <div className="flex justify-center xl:hidden">
            <ThemeToggle compact />
          </div>
          <a href="https://github.com/0xpochita/torch" className="flex h-10 items-center justify-center gap-3 rounded-full px-3 text-[15px] text-muted hover:bg-fill xl:justify-start" title="Docs">
            <Sym name="doc" size={19} />
            <span className="hidden xl:inline">Docs & Contracts</span>
          </a>
        </div>
      </aside>
    </div>
  );
}

/** Floating glass tab bar for phones (iOS 26). */
export function TabBar() {
  const isActive = useActive();
  const tabs = [NAV[0].items[0], NAV[0].items[1], NAV[1].items[0], NAV[1].items[2]];
  return (
    <nav className="material fixed inset-x-4 bottom-[max(env(safe-area-inset-bottom),12px)] z-30 grid grid-cols-4 rounded-full p-1.5 md:hidden">
      {tabs.map((t) => {
        const active = isActive(t.href);
        return (
          <Link key={t.label} href={t.href} className={`flex flex-col items-center gap-0.5 rounded-full py-1.5 text-[10px] font-semibold ${active ? "text-tint" : "text-muted"}`}>
            <Sym name={t.icon} size={22} />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Glass toolbar with an optional large title row underneath. */
export function Topbar({ title, subtitle, children }: { title?: string; subtitle?: string; children?: ReactNode }) {
  return (
    <>
      <header className="sticky top-3 z-20 mt-3 flex items-center gap-2">
        <Link href="/" className="md:hidden">
          <Logo size={40} />
        </Link>
        {children ? <div className="material no-scrollbar flex h-12 min-w-0 flex-1 items-center gap-1 overflow-x-auto rounded-full px-1.5">{children}</div> : <div className="flex-1" />}
        <label className="material hidden h-12 w-[240px] items-center gap-2 rounded-full px-4 text-muted lg:flex">
          <Sym name="search" size={16} />
          <input placeholder="Search" className="w-full bg-transparent text-[15px] text-text outline-none placeholder:text-muted" />
        </label>
        {/* ponytail: mock button; wire to NearProvider from skills/hot-wallet-connect */}
        <button className="btn-ink h-12 shrink-0 px-5 text-[15px]">Connect</button>
      </header>
      {title && (
        <div className="px-1 pb-1 pt-6">
          <h1 className="text-[34px] font-bold leading-none">{title}</h1>
          {subtitle && <p className="mt-1.5 text-[15px] text-muted">{subtitle}</p>}
        </div>
      )}
    </>
  );
}

/** Chip used inside the glass toolbar. */
export function ToolbarChip({ active, onClick, children }: { active?: boolean; onClick?: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} className={`h-9 shrink-0 rounded-full px-3.5 text-[14px] font-medium transition ${active ? "bg-raised text-text shadow-[0_2px_8px_#0000001a]" : "text-text/70 hover:text-text"}`}>
      {children}
    </button>
  );
}
