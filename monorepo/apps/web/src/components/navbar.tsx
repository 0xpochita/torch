"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Sym, type IconName } from "@/components/icons";
import { ThemeToggle } from "@/components/theme-toggle";
import { ETFS, ME, MY_VAULTS } from "@/lib/mock";

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

/** iPadOS-style sidebar: flush pane with search, sections, pinned vaults and the account row. */
export function Sidebar() {
  const isActive = useActive();
  const path = usePathname();
  const pinned = ETFS.filter((e) => (MY_VAULTS.owned as readonly string[]).includes(e.id));

  return (
    <aside className="sticky top-0 hidden h-screen w-[72px] shrink-0 flex-col border-r border-line-soft bg-surface px-2.5 pb-3 pt-5 md:flex xl:w-[264px] xl:px-3">
      <Link href="/" className="flex items-center gap-2.5 px-1.5">
        <Logo size={34} />
        <span className="hidden text-[19px] font-bold xl:block">Torch</span>
        <span className="ml-auto hidden rounded-full bg-fill px-2 py-0.5 text-[11px] font-medium text-muted xl:block">Testnet</span>
      </Link>

      <label className="mt-5 hidden h-9 items-center gap-2 rounded-[10px] bg-fill px-2.5 text-muted xl:flex">
        <Sym name="search" size={15} />
        <input placeholder="Search" className="w-full bg-transparent text-[15px] text-text outline-none placeholder:text-muted" />
      </label>

      <nav className="mt-5 flex flex-col gap-5">
        {NAV.map((g) => (
          <div key={g.group} className="flex flex-col gap-px">
            <span className="hidden px-2.5 pb-1 text-[13px] font-semibold text-muted xl:block">{g.group}</span>
            {g.items.map((it) => {
              const active = isActive(it.href);
              return (
                <Link
                  key={it.label}
                  href={it.href}
                  title={it.label}
                  aria-current={active ? "page" : undefined}
                  className={`flex h-9 items-center justify-center gap-2.5 rounded-[10px] px-2.5 text-[15px] transition xl:justify-start ${active ? "bg-fill font-semibold" : "hover:bg-fill/60"}`}
                >
                  <span className="text-tint">
                    <Sym name={it.icon} size={19} stroke={2} />
                  </span>
                  <span className="hidden xl:inline">{it.label}</span>
                </Link>
              );
            })}
          </div>
        ))}

        <div className="hidden flex-col gap-px xl:flex">
          <span className="flex items-center justify-between px-2.5 pb-1 text-[13px] font-semibold text-muted">
            Pinned Vaults
            <Link href="/create" className="text-tint" aria-label="Create vault">
              <Sym name="plus" size={15} stroke={2.4} />
            </Link>
          </span>
          {pinned.map((e) => {
            const active = path === `/etf/${e.id}`;
            return (
              <Link key={e.id} href={`/etf/${e.id}`} className={`flex h-11 items-center gap-2.5 rounded-[10px] px-2 transition ${active ? "bg-fill" : "hover:bg-fill/60"}`}>
                <span className="relative size-7 shrink-0 overflow-hidden rounded-[7px]" style={{ background: e.bg }}>
                  <Image src={e.image} alt="" fill sizes="56px" className="object-cover" />
                </span>
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block truncate text-[14px] font-medium">{e.name}</span>
                  <span className="block truncate text-[12px] text-muted">${e.navUsd.toLocaleString("en-US")}</span>
                </span>
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="mt-auto flex flex-col gap-2 border-t border-line-soft pt-3">
        <div className="hidden px-0.5 xl:block">
          <ThemeToggle />
        </div>
        <div className="flex items-center justify-center gap-2.5 rounded-[12px] px-1.5 py-1.5 xl:justify-start xl:hover:bg-fill/60">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-ink text-[14px] font-semibold text-on-ink">B</span>
          <span className="hidden min-w-0 flex-1 leading-tight xl:block">
            <span className="block truncate text-[14px] font-semibold">{ME}</span>
            <span className="flex items-center gap-1 text-[12px] text-muted">
              <span className="size-1.5 rounded-full bg-up" /> Mock wallet
            </span>
          </span>
          <a href="https://github.com/0xpochita/torch" title="Docs & contracts" className="hidden size-8 place-items-center rounded-full text-muted hover:bg-fill xl:grid">
            <Sym name="doc" size={17} />
          </a>
          <span className="xl:hidden">
            <ThemeToggle compact />
          </span>
        </div>
      </div>
    </aside>
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
        <label className="material hidden h-12 w-[240px] items-center gap-2 rounded-full px-4 text-muted lg:flex xl:hidden">
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
