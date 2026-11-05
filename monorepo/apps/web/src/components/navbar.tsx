"use client";

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
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

/** Labeled sidebar, collapses to icons on medium screens. */
export function Sidebar() {
  const path = usePathname();
  const isActive = (href: string) => (href === "/" ? path === "/" : path === href || (href === "/create" && path.startsWith("/create")));

  return (
    <aside className="sticky top-0 hidden h-screen w-[76px] shrink-0 flex-col border-r border-line-soft px-3 py-6 md:flex xl:w-[244px] xl:px-4">
      <Link href="/" className="flex items-center gap-2.5 px-1.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-ink text-base font-semibold text-white">T</span>
        <span className="hidden text-lg font-semibold xl:block">Torch</span>
        <span className="ml-auto hidden rounded-md bg-panel px-1.5 py-0.5 text-[10px] font-medium text-muted xl:block">testnet</span>
      </Link>

      <nav className="mt-8 flex flex-col gap-6">
        {NAV.map((g) => (
          <div key={g.group} className="flex flex-col gap-1">
            <span className="hidden px-3 pb-1 text-[11px] font-medium uppercase tracking-wider text-faint xl:block">{g.group}</span>
            {g.items.map((it) => {
              const active = isActive(it.href);
              return (
                <Link
                  key={it.label}
                  href={it.href}
                  title={it.label}
                  className={`relative flex h-10 items-center justify-center gap-3 rounded-xl px-3 text-sm transition xl:justify-start ${
                    active ? "bg-panel font-medium text-ink" : "text-muted hover:bg-panel/60 hover:text-ink"
                  }`}
                >
                  {active && <span className="absolute -left-3 h-5 w-[3px] rounded-r-full bg-ink xl:-left-4" />}
                  <Icon d={it.icon} />
                  <span className="hidden xl:inline">{it.label}</span>
                  {"badge" in it && <span className="ml-auto hidden rounded-md bg-ink px-1.5 py-0.5 text-[10px] text-white xl:inline">{it.badge}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-3">
        <div className="hidden rounded-2xl bg-ink p-4 text-white xl:block">
          <div className="flex items-center justify-between text-xs text-white/60">
            Portfolio value <span className="rounded-md bg-white/10 px-1.5 py-0.5">mock</span>
          </div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">
            $4,170<span className="text-white/40">.00</span>
          </div>
          <div className="mt-0.5 text-xs text-up">↗ +3.18% this week</div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <button className="h-8 rounded-lg bg-white font-medium text-ink">Deposit</button>
            <button className="h-8 rounded-lg border border-white/25 font-medium hover:bg-white/10">Withdraw</button>
          </div>
        </div>
        <a href="https://github.com/0xpochita/torch" className="flex h-10 items-center justify-center gap-3 rounded-xl px-3 text-sm text-muted hover:text-ink xl:justify-start" title="Docs">
          <Icon d={ICONS.docs} />
          <span className="hidden xl:inline">Docs & contracts</span>
        </a>
      </div>
    </aside>
  );
}

/** Page top bar; pages pass a title and optional center content (e.g. tabs). */
export function Topbar({ title, children }: { title?: string; children?: ReactNode }) {
  return (
    <header className="sticky top-0 z-20 -mx-4 flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-line-soft bg-white/85 px-4 py-4 backdrop-blur md:-mx-8 md:px-8">
      <Link href="/" className="grid size-9 place-items-center rounded-xl bg-ink font-semibold text-white md:hidden">
        T
      </Link>
      {title && <h1 className="text-lg font-semibold">{title}</h1>}
      <div className="min-w-0 flex-1">{children}</div>
      <div className="flex items-center gap-3">
        <label className="hidden h-10 w-[260px] items-center gap-2 rounded-xl border border-line px-3 text-muted focus-within:border-ink lg:flex">
          <SearchIcon />
          <input placeholder="Search ETFs, tokens, accounts" className="w-full bg-transparent text-sm text-text outline-none placeholder:text-faint" />
          <kbd className="rounded-md border border-line px-1.5 text-[10px] text-muted">⌘K</kbd>
        </label>
        <span className="hidden h-10 items-center gap-2 rounded-xl bg-panel px-3 text-sm sm:flex">
          <span className="size-2.5 rounded-full" style={{ background: TOKENS.NEAR.color }} />
          NEAR <span className="font-medium tabular-nums">${TOKENS.NEAR.price.toFixed(2)}</span>
        </span>
        <button className="relative grid size-10 place-items-center rounded-xl border border-line text-muted hover:text-ink" title="Notifications">
          <Icon d={ICONS.bell} />
          <span className="absolute right-2 top-2 size-2 rounded-full bg-down ring-2 ring-white" />
        </button>
        {/* ponytail: mock button; wire to NearProvider from skills/hot-wallet-connect */}
        <button className="btn-ink h-10 px-4 text-sm">Connect wallet</button>
      </div>
    </header>
  );
}

export function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}
