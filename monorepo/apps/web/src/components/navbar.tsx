"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { TOKENS } from "@/lib/mock";

const ICONS = {
  explore: "M3 11 12 4l9 7v9H3z",
  create: "M12 5v14M5 12h14",
  vault: "M4 7h16v12H4zM4 7l2-3h12l2 3M16 13h.01",
  activity: "M3 12h4l3-8 4 16 3-8h4",
  heart: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z",
  docs: "M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5",
  bell: "M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 0 0 4 0",
};

const NAV = [
  {
    group: "Marketplace",
    items: [
      { href: "/", label: "Explore", icon: ICONS.explore },
      { href: "/create", label: "Create ETF", icon: ICONS.create, badge: "New" },
    ],
  },
  {
    group: "My account",
    items: [
      { href: "/etf/0", label: "My vaults", icon: ICONS.vault },
      { href: "/etf/4", label: "Activity", icon: ICONS.activity },
      { href: "/etf/3", label: "Favorites", icon: ICONS.heart },
    ],
  },
];

export function Icon({ d, size = 18 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

/** Torch app icon (squircle). */
export function Logo({ size = 36 }: { size?: number }) {
  return (
    <span className="relative block shrink-0 overflow-hidden rounded-[23%] shadow-[0_4px_12px_-4px_rgb(110_40_230/0.55)]" style={{ width: size, height: size }}>
      <Image src="/brand/torch-icon.png" alt="Torch" fill sizes={`${size * 2}px`} className="scale-[1.04] object-cover" priority />
    </span>
  );
}

function useActive() {
  const path = usePathname();
  return (href: string) => (href === "/" ? path === "/" : path === href || (href === "/create" && path.startsWith("/create")));
}

/** Translucent sidebar; collapses to icons on medium screens. */
export function Sidebar() {
  const isActive = useActive();

  return (
    <aside className="material sticky top-0 hidden h-screen w-[76px] shrink-0 flex-col border-r border-line-soft px-3 py-6 md:flex xl:w-[248px] xl:px-4">
      <Link href="/" className="flex items-center gap-3 px-1">
        <Logo size={38} />
        <span className="hidden flex-col leading-tight xl:flex">
          <span className="text-[17px] font-semibold">Torch</span>
          <span className="text-[11px] text-muted">NFT ETFs on NEAR</span>
        </span>
      </Link>

      <nav className="mt-8 flex flex-col gap-6">
        {NAV.map((g) => (
          <div key={g.group} className="flex flex-col gap-0.5">
            <span className="hidden px-3 pb-1.5 text-[12px] font-medium uppercase tracking-wide text-muted xl:block">{g.group}</span>
            {g.items.map((it) => {
              const active = isActive(it.href);
              return (
                <Link
                  key={it.label}
                  href={it.href}
                  title={it.label}
                  className={`flex h-10 items-center justify-center gap-3 rounded-[10px] px-3 text-[15px] transition xl:justify-start ${
                    active ? "bg-ink text-white" : "text-text/80 hover:bg-fill"
                  }`}
                >
                  <Icon d={it.icon} />
                  <span className="hidden xl:inline">{it.label}</span>
                  {"badge" in it && (
                    <span className={`ml-auto hidden rounded-full px-2 py-0.5 text-[10px] font-semibold xl:inline ${active ? "bg-white/20" : "bg-tint text-white"}`}>{it.badge}</span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-3">
        <div className="card hidden flex-col gap-3 p-4 xl:flex">
          <div className="flex items-center justify-between text-[13px] text-muted">
            Portfolio <span className="rounded-full bg-fill px-2 py-0.5 text-[10px]">mock</span>
          </div>
          <div>
            <div className="text-[26px] font-semibold tabular-nums leading-none">
              $4,170<span className="text-faint">.00</span>
            </div>
            <div className="mt-1 text-[13px] font-medium text-up">↗ +3.18% this week</div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[13px]">
            <button className="btn-ink h-9">Deposit</button>
            <button className="btn-line h-9">Withdraw</button>
          </div>
        </div>
        <a href="https://github.com/0xpochita/torch" className="flex h-10 items-center justify-center gap-3 rounded-[10px] px-3 text-[15px] text-muted hover:bg-fill xl:justify-start" title="Docs">
          <Icon d={ICONS.docs} />
          <span className="hidden xl:inline">Docs & contracts</span>
        </a>
      </div>
    </aside>
  );
}

/** iOS-style bottom tab bar for phones. */
export function TabBar() {
  const isActive = useActive();
  const tabs = [NAV[0].items[0], NAV[0].items[1], NAV[1].items[0], NAV[1].items[2]];
  return (
    <nav className="material fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-line pb-[max(env(safe-area-inset-bottom),6px)] pt-1.5 md:hidden">
      {tabs.map((t) => (
        <Link key={t.label} href={t.href} className={`flex flex-col items-center gap-0.5 text-[10px] font-medium ${isActive(t.href) ? "text-tint" : "text-muted"}`}>
          <Icon d={t.icon} size={24} />
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

/** Translucent navigation bar with a large title. */
export function Topbar({ title, children }: { title?: string; children?: ReactNode }) {
  return (
    <header className="material sticky top-0 z-20 -mx-4 flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-line-soft px-4 py-3.5 md:-mx-8 md:px-8">
      <Link href="/" className="md:hidden">
        <Logo size={32} />
      </Link>
      {title && <h1 className="text-[28px] font-bold leading-none">{title}</h1>}
      <div className="min-w-0 flex-1">{children}</div>
      <div className="flex items-center gap-2.5">
        <label className="hidden h-9 w-[260px] items-center gap-2 rounded-[10px] bg-fill px-3 text-muted lg:flex">
          <SearchIcon />
          <input placeholder="Search" className="w-full bg-transparent text-[15px] text-text outline-none placeholder:text-muted" />
          <kbd className="rounded-md bg-white px-1.5 text-[10px] text-muted shadow-sm">⌘K</kbd>
        </label>
        <span className="hidden h-9 items-center gap-2 rounded-full bg-fill px-3 text-[13px] sm:flex">
          <span className="size-2 rounded-full" style={{ background: TOKENS.NEAR.color }} />
          NEAR <span className="font-semibold tabular-nums">${TOKENS.NEAR.price.toFixed(2)}</span>
        </span>
        <button className="relative grid size-9 place-items-center rounded-full bg-fill text-text/80" title="Notifications">
          <Icon d={ICONS.bell} size={17} />
          <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-down ring-2 ring-[#f9f9fb]" />
        </button>
        {/* ponytail: mock button; wire to NearProvider from skills/hot-wallet-connect */}
        <button className="btn-ink h-9 px-4 text-[14px]">Connect</button>
      </div>
    </header>
  );
}

export function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}
