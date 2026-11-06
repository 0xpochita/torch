"use client";

import { motion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Sym, type IconName } from "@/components/icons";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar, Title } from "@/components/ui";
import { ME } from "@/lib/mock";

type NavItem = { href: string; label: string; icon: IconName; badge?: string };

const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "Marketplace",
    items: [
      { href: "/", label: "Explore", icon: "house" },
      { href: "/market", label: "Market", icon: "store" },
      { href: "/create", label: "Create ETF", icon: "plusCircle", badge: "New" },
    ],
  },
  {
    group: "Library",
    items: [
      { href: "/vaults", label: "My Vaults", icon: "vault" },
      { href: "/leaderboard", label: "Leaders", icon: "trophy" },
      { href: "/activity", label: "Activity", icon: "pulse" },
      { href: "/favorites", label: "Favorites", icon: "heart" },
    ],
  },
];

/** Torch mark (transparent torch, no tile). */
export function Logo({ size = 36 }: { size?: number }) {
  return (
    <span className="relative block shrink-0" style={{ width: size, height: size }}>
      <Image src="/brand/torch-mark.png" alt="Torch" fill sizes={`${size * 2}px`} className="object-contain" priority />
    </span>
  );
}

function useActive() {
  const path = usePathname();
  return (href: string) => (href === "/" ? path === "/" || path.startsWith("/etf") : path.startsWith(href));
}

/** Minimal floating rail: icon + label, a black "create" key, appearance and account at the foot. */
export function Sidebar() {
  const isActive = useActive();
  const items = [NAV[0].items[0], NAV[0].items[1], ...NAV[1].items];

  return (
    <div className="sticky top-0 hidden h-screen shrink-0 p-3 pr-0 md:block">
      <aside className="flex h-full w-[84px] flex-col items-center rounded-[28px] bg-surface py-5 shadow-[0_1px_2px_var(--shadow)]">
        <Link href="/" title="Torch" className="grid size-11 place-items-center">
          <Logo size={34} />
        </Link>

        <nav className="mt-8 flex flex-col items-center gap-1.5">
          {items.slice(0, 2).map((it) => (
            <RailItem key={it.href} item={it} active={isActive(it.href)} />
          ))}
          <Link
            href="/create"
            title="Create ETF"
            aria-current={isActive("/create") ? "page" : undefined}
            className={`my-2 grid size-12 place-items-center rounded-[16px] bg-ink text-on-ink transition active:scale-95 ${isActive("/create") ? "ring-4 ring-fill" : ""}`}
          >
            <Sym name="plus" size={22} stroke={2.4} />
            <span className="sr-only">Create ETF</span>
          </Link>
          {items.slice(2).map((it) => (
            <RailItem key={it.href} item={it} active={isActive(it.href)} />
          ))}
        </nav>

        <div className="mt-auto flex flex-col items-center gap-3">
          <ThemeToggle compact />
          <a href="https://github.com/0xpochita/torch" title={`${ME} · mock wallet`} className="relative">
            <Avatar account={ME} size={40} />
            <span className="absolute bottom-0 right-0 size-3 rounded-full bg-up ring-2 ring-surface" />
          </a>
        </div>
      </aside>
    </div>
  );
}

function RailItem({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`relative isolate flex w-[68px] flex-col items-center gap-1 rounded-[18px] py-2.5 text-[11px] font-medium transition-colors ${active ? "text-text" : "text-muted hover:text-text"}`}
    >
      {active && <motion.span layoutId="rail-active" className="absolute inset-0 -z-10 rounded-[18px] bg-fill" />}
      <Sym name={item.icon} size={22} weight={active ? "fill" : "regular"} />
      {item.label.replace("My ", "")}
    </Link>
  );
}

/** Floating glass tab bar for phones (iOS 26). */
export function TabBar() {
  const isActive = useActive();
  const tabs = [NAV[0].items[0], NAV[0].items[1], NAV[0].items[2], NAV[1].items[0]];
  return (
    <nav className="material fixed inset-x-4 bottom-[max(env(safe-area-inset-bottom),12px)] z-30 grid grid-cols-4 rounded-full p-1.5 md:hidden">
      {tabs.map((t) => {
        const active = isActive(t.href);
        return (
          <Link key={t.label} href={t.href} className={`relative flex flex-col items-center gap-0.5 rounded-full py-1.5 text-[10px] font-semibold ${active ? "text-tint" : "text-muted"}`}>
            {active && <motion.span layoutId="tabbar-active" className="absolute inset-0 -z-10 rounded-full bg-fill" />}
            <Sym name={t.icon} size={22} weight={active ? "fill" : "regular"} />
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
        {children ? (
          <div className="flex min-w-0 flex-1">
            <div className="no-scrollbar flex h-11 max-w-full items-center gap-0.5 overflow-x-auto rounded-full bg-fill p-1">{children}</div>
          </div>
        ) : (
          <div className="flex-1" />
        )}
        <label className="material hidden h-12 w-[260px] items-center gap-2 rounded-full px-4 text-muted lg:flex">
          <Sym name="search" size={16} />
          <input placeholder="Search" className="w-full bg-transparent text-[15px] text-text outline-none placeholder:text-muted" />
        </label>
        {/* ponytail: mock button; wire to NearProvider from skills/hot-wallet-connect */}
        <button className="btn-ink h-12 shrink-0 px-5 text-[15px]">Connect</button>
      </header>
      {title && (
        <div className="px-1 pb-1 pt-6">
          <Title size="text-[44px]">{title}</Title>
          {subtitle && <p className="mt-1.5 text-[15px] text-muted">{subtitle}</p>}
        </div>
      )}
    </>
  );
}

/** Segment inside the toolbar's iOS-style segmented control. */
export function ToolbarChip({ active, onClick, count, icon, children }: { active?: boolean; onClick?: () => void; count?: number; icon?: ReactNode; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`relative isolate flex h-9 shrink-0 items-center gap-1.5 rounded-full pl-2.5 pr-4 text-[14px] transition-colors ${active ? "font-semibold text-text" : "font-medium text-muted hover:text-text"}`}
    >
      {active && <motion.span layoutId="toolbar-chip" className="absolute inset-0 -z-10 rounded-full bg-raised shadow-[0_1px_2px_#00000014,0_3px_10px_#0000001a]" />}
      {icon}
      {children}
      {count !== undefined && <span className={`text-[12px] tabular-nums ${active ? "text-muted" : "text-faint"}`}>{count}</span>}
    </button>
  );
}
