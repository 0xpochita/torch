"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { TOKENS } from "@/lib/mock";

const RAIL = [
  { href: "/", label: "Explore", icon: "M3 11 12 4l9 7v9H3z" },
  { href: "/create", label: "Create ETF", icon: "M12 5v14M5 12h14" },
  { href: "/etf/0", label: "My vaults", icon: "M4 7h16v12H4zM4 7l2-3h12l2 3M16 13h.01" },
  { href: "/etf/4", label: "Activity", icon: "M3 12h4l3-8 4 16 3-8h4" },
  { href: "/etf/3", label: "Favorites", icon: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" },
];

function Icon({ d }: { d: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

/** Left icon rail. */
export function Rail() {
  const path = usePathname();
  return (
    <aside className="sticky top-0 hidden h-screen w-[84px] shrink-0 flex-col items-center gap-10 py-7 md:flex">
      <Link href="/" className="grid size-11 place-items-center rounded-xl bg-ink text-lg font-semibold text-white" title="Torch">
        T
      </Link>
      <nav className="flex flex-col items-center gap-3">
        {RAIL.map((r) => {
          const active = r.href === "/" ? path === "/" : path === r.href || (r.href === "/create" && path.startsWith("/create"));
          return (
            <Link
              key={r.label}
              href={r.href}
              title={r.label}
              className={`relative grid size-11 place-items-center rounded-xl transition ${active ? "bg-panel text-ink" : "text-muted hover:text-ink"}`}
            >
              <Icon d={r.icon} />
              {active && <span className="absolute -right-[21px] h-6 w-[3px] rounded-full bg-ink" />}
              <span className="sr-only">{r.label}</span>
            </Link>
          );
        })}
      </nav>
      <span className="mt-auto text-muted" title="Settings">
        <Icon d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.8 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.8-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3.2 15H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 9 4.2V4a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.8 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.8H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
      </span>
    </aside>
  );
}

/** Page top bar; pages pass their own center content (e.g. category tabs). */
export function Topbar({ children }: { children?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-center gap-x-8 gap-y-3 border-b border-line-soft py-5">
      <label className="flex h-10 w-full items-center gap-2 rounded-xl border border-line px-3 text-muted sm:w-[240px]">
        <SearchIcon />
        <input placeholder="Search" className="w-full bg-transparent text-sm text-text outline-none placeholder:text-faint" />
      </label>
      <div className="min-w-0 flex-1">{children}</div>
      <div className="flex items-center gap-4">
        <span className="hidden items-center gap-1.5 text-sm text-muted lg:flex">
          <span className="size-2.5 rounded-full" style={{ background: TOKENS.NEAR.color }} />
          NEAR ${TOKENS.NEAR.price.toFixed(2)}
        </span>
        <span className="relative text-muted" title="Notifications">
          <Icon d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 0 0 4 0" />
          <span className="absolute -right-1 -top-1 grid size-3.5 place-items-center rounded-full bg-down text-[8px] font-semibold text-white">2</span>
        </span>
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
