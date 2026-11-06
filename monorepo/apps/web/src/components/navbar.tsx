"use client";

import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Icon3D, Sym, type IconName } from "@/components/icons";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar, NearAmount, Title } from "@/components/ui";
import { useNear } from "@/providers/near-provider";

type NavItem = { href: string; label: string; icon: IconName; img: string; badge?: string };

const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "Marketplace",
    items: [
      { href: "/", label: "Explore", icon: "house", img: "/icons/3d/explore.png" },
      { href: "/market", label: "Market", icon: "store", img: "/icons/3d/market.png" },
      { href: "/create", label: "Create ETF", icon: "plusCircle", img: "/icons/3d/create.png", badge: "New" },
    ],
  },
  {
    group: "Library",
    items: [
      { href: "/vaults", label: "My Vaults", icon: "vault", img: "/icons/3d/vaults.png" },
      { href: "/leaderboard", label: "Leaders", icon: "trophy", img: "/icons/3d/leaders.png" },
      { href: "/activity", label: "Activity", icon: "pulse", img: "/icons/3d/activity.png" },
      { href: "/gacha", label: "Gacha", icon: "gift", img: "/icons/3d/gacha.png" },
      { href: "/faucet", label: "Faucet", icon: "down", img: "/icons/3d/deposit.png" },
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

/**
 * Menu keyboard model: focus moves into the menu on open, Arrow keys walk the items, Escape (or Tab out)
 * closes and returns focus to the trigger.
 */
function useMenuKeys(open: boolean, close: () => void, menu: RefObject<HTMLElement | null>, trigger: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const items = () => [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const first = setTimeout(() => items()[0]?.focus());
    const onKey = (e: KeyboardEvent) => {
      const list = items();
      const i = list.indexOf(document.activeElement as HTMLElement);
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        trigger.current?.focus();
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        list[(i + (e.key === "ArrowDown" ? 1 : -1) + list.length) % list.length]?.focus();
      } else if (e.key === "Tab") close();
    };
    // outside tap closes (a fixed backdrop can't cover the page from inside the blurred tab bar)
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!menu.current?.contains(t) && !trigger.current?.contains(t)) close();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => (clearTimeout(first), window.removeEventListener("keydown", onKey), window.removeEventListener("pointerdown", onDown));
  }, [open, close, menu, trigger]);
}

function useActive() {
  const path = usePathname();
  return (href: string) => (href === "/" ? path === "/" || path.startsWith("/etf") : path.startsWith(href));
}

/** Minimal floating rail: icon + label, a black "create" key, appearance and account at the foot. */
export function Sidebar() {
  const isActive = useActive();
  const { ready, accountId, signIn } = useNear();
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
            className={`my-2 grid size-12 place-items-center rounded-[16px] transition hover:scale-105 active:scale-95 ${isActive("/create") ? "bg-fill" : ""}`}
          >
            <NavIcon src="/icons/3d/create.png" size={40} active />
            <span className="sr-only">Create ETF</span>
          </Link>
          {items.slice(2).map((it) => (
            <RailItem key={it.href} item={it} active={isActive(it.href)} />
          ))}
        </nav>

        <div className="mt-auto flex flex-col items-center gap-3">
          <ThemeToggle compact />
          {accountId ? (
            <Link href="/vaults" title={accountId} className="relative">
              <Avatar account={accountId} size={40} />
              <span className="absolute bottom-0 right-0 size-3 rounded-full bg-up ring-2 ring-surface" />
            </Link>
          ) : (
            <button onClick={signIn} disabled={!ready} title="Connect wallet" className="grid size-10 place-items-center rounded-full bg-fill text-muted transition hover:text-text disabled:opacity-50">
              <Sym name="wallet" size={19} weight="bold" />
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}

/** 3D clay nav icon; inactive ones sit back a little so the current page reads first. */
function NavIcon({ src, size, active }: { src: string; size: number; active: boolean }) {
  return (
    <Image
      src={src}
      alt=""
      width={size}
      height={size}
      className={`transition duration-200 group-hover:scale-110 ${active ? "scale-105 drop-shadow-[0_4px_10px_#ff8a0055]" : "opacity-85 group-hover:opacity-100"}`}
    />
  );
}

function RailItem({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`group relative isolate flex w-[68px] flex-col items-center gap-1 rounded-[18px] py-2 text-[11px] font-medium transition-colors ${active ? "text-text" : "text-muted hover:text-text"}`}
    >
      {active && <motion.span layoutId="rail-active" className="absolute inset-0 -z-10 rounded-[18px] bg-fill" />}
      <NavIcon src={item.img} size={28} active={active} />
      {item.label.replace("My ", "")}
    </Link>
  );
}

/** Floating glass tab bar for phones (iOS 26). */
export function TabBar() {
  const isActive = useActive();
  const tabs = [NAV[0].items[0], NAV[0].items[1], NAV[0].items[2], NAV[1].items[0]];
  // Everything the rail shows but the tab bar has no room for (Leaders, Activity, Gacha, Faucet).
  const more = NAV[1].items.slice(1);
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [close] = useState(() => () => setOpen(false));
  useMenuKeys(open, close, menu, trigger);
  const moreActive = more.some((m) => isActive(m.href));
  return (
    <nav aria-label="Main" className="material fixed inset-x-4 bottom-[max(env(safe-area-inset-bottom),12px)] z-30 grid grid-cols-5 rounded-full p-1.5 md:hidden">
      {tabs.map((t) => {
        const active = isActive(t.href);
        return (
          <Link key={t.label} href={t.href} className={`group relative flex flex-col items-center gap-0.5 rounded-full py-1.5 text-[10px] font-semibold ${active ? "text-tint" : "text-muted"}`}>
            {active && <motion.span layoutId="tabbar-active" className="absolute inset-0 -z-10 rounded-full bg-fill" />}
            <NavIcon src={t.img} size={24} active={active} />
            {t.label.replace("My ", "").replace(" ETF", "")}
          </Link>
        );
      })}
      <button
        ref={trigger}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`relative flex flex-col items-center gap-0.5 rounded-full py-1.5 text-[10px] font-semibold ${moreActive || open ? "text-tint" : "text-muted"}`}
      >
        {moreActive && <span className="absolute inset-0 -z-10 rounded-full bg-fill" />}
        <span className="grid size-6 place-items-center">
          <Sym name="ellipsis" size={22} weight="bold" />
        </span>
        More
      </button>
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              ref={menu}
              role="menu"
              aria-label="More pages"
              initial={{ opacity: 0, y: 8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.97 }}
              className="absolute bottom-[calc(100%+10px)] right-0 w-[220px] origin-bottom-right rounded-[22px] bg-surface p-2 shadow-[0_0_0_1px_var(--line),0_20px_50px_-12px_#00000040]"
            >
              {more.map((m) => (
                <Link
                  key={m.href}
                  href={m.href}
                  role="menuitem"
                  onClick={close}
                  aria-current={isActive(m.href) ? "page" : undefined}
                  className={`flex h-12 items-center gap-3 rounded-[14px] px-3 text-[15px] font-medium hover:bg-fill ${isActive(m.href) ? "bg-fill" : ""}`}
                >
                  <NavIcon src={m.img} size={26} active={isActive(m.href)} />
                  {m.label}
                </Link>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </nav>
  );
}

/** Glass toolbar with an optional large title row underneath. */
export function Topbar({ title, subtitle, children }: { title?: string; subtitle?: string; children?: ReactNode }) {
  return (
    <>
      <header className="sticky top-[max(12px,env(safe-area-inset-top))] z-20 mt-3 flex items-center gap-2">
        <Link href="/" aria-label="Torch home" className="md:hidden">
          <Logo size={40} />
        </Link>
        {children ? (
          <div className="flex min-w-0 flex-1">
            <div className="no-scrollbar flex h-11 max-w-full items-center gap-0.5 overflow-x-auto rounded-full bg-fill p-1">{children}</div>
          </div>
        ) : (
          <PagePill />
        )}
        <label className="material hidden h-12 w-[260px] items-center gap-2 rounded-full px-4 text-muted focus-within:ring-2 focus-within:ring-tint/40 lg:flex">
          <Sym name="search" size={16} />
          <input placeholder="Search" className="w-full bg-transparent text-[15px] text-text outline-none placeholder:text-muted" />
        </label>
        <WalletButton />
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

/** Fills the toolbar on pages without filter chips: where you are, and who you are. */
function PagePill() {
  const path = usePathname();
  const { accountId } = useNear();
  const item = NAV.flatMap((g) => g.items).find((it) => (it.href === "/" ? path === "/" : path.startsWith(it.href)));
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <div className="flex h-11 items-center gap-1 rounded-full bg-fill p-1 pr-4">
        <span className="grid size-9 place-items-center rounded-full bg-raised shadow-[0_0_0_1px_var(--line)]">
          <Sym name={item?.icon ?? "house"} size={17} weight="bold" />
        </span>
        <span className="pl-1.5 text-[14px] font-semibold">{item?.label ?? "Torch"}</span>
      </div>
      {accountId && (
        <span className="hidden min-w-0 items-center gap-2 text-[14px] text-muted md:flex">
          <Avatar account={accountId} size={22} /> gm, <span className="truncate font-medium text-text">{accountId}</span>
        </span>
      )}
    </div>
  );
}

/** "Connect" opens the near-connect wallet picker; signed in it becomes the account chip with a menu. */
function WalletButton() {
  const { ready, accountId, balance, signIn, signOut } = useNear();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [close] = useState(() => () => setOpen(false));
  useMenuKeys(open, close, menu, trigger);

  if (!accountId)
    return (
      <button onClick={signIn} disabled={!ready} className="btn-ink h-12 shrink-0 px-5 text-[15px] disabled:opacity-60">
        Connect
      </button>
    );

  const copy = () => {
    navigator.clipboard?.writeText(accountId).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className="relative shrink-0">
      <button ref={trigger} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu" aria-label={`Account ${accountId}`} className="material flex h-12 items-center gap-2 rounded-full pl-1.5 pr-3">
        <Avatar account={accountId} size={36} />
        <span className="hidden max-w-[150px] truncate text-[14px] font-semibold sm:block">{accountId}</span>
        <span className="hidden rounded-full bg-fill px-2.5 py-1 text-[13px] font-semibold sm:block">
          <NearAmount amount={balance === null ? "…" : balance.toFixed(2)} />
        </span>
        <Sym name="chevronDown" size={13} stroke={2.4} className={`text-muted transition ${open ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence>
        {open && (
          <>
            <button aria-label="Close menu" onClick={() => setOpen(false)} className="fixed inset-0 z-30 cursor-default" />
            <motion.div
              ref={menu}
              role="menu"
              aria-label="Account"
              initial={{ opacity: 0, y: -6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.97 }}
              transition={{ type: "spring", stiffness: 500, damping: 34 }}
              className="absolute right-0 top-14 z-40 w-[260px] origin-top-right rounded-[22px] bg-surface p-2 shadow-[0_0_0_1px_var(--line),0_20px_50px_-12px_#00000040]"
            >
              <div className="flex items-center gap-3 p-2">
                <Avatar account={accountId} size={40} />
                <div className="min-w-0">
                  <div className="truncate text-[15px] font-semibold">{accountId}</div>
                  <div className="text-[13px] text-muted">
                    <NearAmount amount={balance === null ? "…" : balance.toFixed(4)} />
                  </div>
                </div>
              </div>
              <div className="my-1 h-px bg-line-soft" />
              <MenuItem icon={copied ? "check" : "copy"} onClick={copy}>
                {copied ? "Copied" : "Copy address"}
              </MenuItem>
              <MenuItem icon="signOut" onClick={() => (setOpen(false), signOut())} danger>
                Sign out
              </MenuItem>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function MenuItem({ icon, onClick, danger, children }: { icon: IconName; onClick: () => void; danger?: boolean; children: ReactNode }) {
  return (
    <button role="menuitem" onClick={onClick} className={`flex h-11 w-full items-center gap-3 rounded-[14px] px-3 text-[15px] font-medium transition-colors hover:bg-fill ${danger ? "text-down" : ""}`}>
      <Sym name={icon} size={17} weight="bold" />
      {children}
    </button>
  );
}

/** Shown on personal pages while signed out. */
export function ConnectPrompt({ title = "Connect your wallet", sub, className = "card" }: { title?: string; sub: string; className?: string }) {
  const { ready, signIn } = useNear();
  return (
    <div className={`flex flex-col items-center gap-3 px-6 py-12 text-center ${className}`}>
      <Icon3D name="wallet" size={72} />
      <h2 className="title-chunky text-[26px]">{title}</h2>
      <p className="max-w-[340px] text-[15px] text-muted">{sub}</p>
      <button onClick={signIn} disabled={!ready} className="btn-ink mt-2 h-12 px-6 text-[15px] disabled:opacity-60">
        {ready ? "Connect wallet" : "Loading wallets…"}
      </button>
    </div>
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
