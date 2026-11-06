"use client";

import Image from "next/image";
import Link from "next/link";
import { BasketArt } from "@/components/basket-art";
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from "motion/react";
import { useState } from "react";
import { Artwork, BuyCapsule, Change } from "@/components/etf-card";
import { Sym, type IconName } from "@/components/icons";
import { HeroBackdrop } from "@/components/hero-backdrop";
import { ToolbarChip, Topbar } from "@/components/navbar";
import { ActionCircle, Avatar, Money, NearAmount, StatTile, Title, TokenStack } from "@/components/ui";
import { CATEGORIES, ETFS, type Category, type Etf } from "@/lib/mock";
import { useAccount } from "@/providers/near-provider";

const TABS = ["All", ...CATEGORIES] as const;
const LISTS = [
  { key: "popular", label: "Most popular", icon: "heart" },
  { key: "rising", label: "Rising stars", icon: "pulse" },
] as const;

export const CATEGORY_ICON: Record<Category, IconName> = {
  "Blue Chip": "shield",
  Stable: "lock",
  DeFi: "swap",
  Meme: "sparkle",
  "Chain Abstraction": "layers",
  "Liquid Staking": "down",
};

// Each category chip shows the artwork of its most liked basket.
// ponytail: mock daily volume ending "today" (Thu); replace with indexed sales
const VOLUME = [
  { day: "Fri", usd: 6_210 },
  { day: "Sat", usd: 4_880 },
  { day: "Sun", usd: 7_340 },
  { day: "Mon", usd: 9_120 },
  { day: "Tue", usd: 8_050 },
  { day: "Wed", usd: 10_960 },
  { day: "Thu", usd: 12_480 },
];

const CATEGORY_ART = Object.fromEntries(
  CATEGORIES.map((c) => [c, ETFS.filter((e) => e.category === c).sort((a, b) => b.likes - a.likes)[0] ?? ETFS[0]]),
) as Record<Category, Etf>;

// Creators ranked by the total value of the vaults they made.
const CREATORS = Object.values(
  ETFS.reduce<Record<string, { name: string; nav: number; etf: Etf }>>((acc, e) => {
    const c = (acc[e.creator] ??= { name: e.creator, nav: 0, etf: e });
    c.nav += e.navUsd;
    return acc;
  }, {}),
).sort((a, b) => b.nav - a.nav);

export function Explore() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("All");
  const [list, setList] = useState<(typeof LISTS)[number]["key"]>("popular");

  const items = ETFS.filter((e) => tab === "All" || e.category === (tab as Category)).sort((a, b) => (list === "popular" ? b.likes - a.likes : b.change24h - a.change24h));

  return (
    <>
      <Topbar>
        {TABS.map((t) => (
          <ToolbarChip
            key={t}
            active={tab === t}
            onClick={() => setTab(t)}
            count={t === "All" ? ETFS.length : ETFS.filter((e) => e.category === t).length}
            icon={
              t === "All" ? (
                <span className="relative size-6">
                  <Image src="/brand/torch-mark.png" alt="" fill sizes="48px" className="object-contain" />
                </span>
              ) : (
                <TokenStack allocation={CATEGORY_ART[t].allocation.slice(0, 3)} size={20} />
              )
            }
          >
            {t}
          </ToolbarChip>
        ))}
      </Topbar>

      <div className="grid gap-5 pb-6 pt-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Hero />

        <section className="card flex flex-col gap-4 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-[20px] font-bold">Market today</h2>
            <span className="rounded-full bg-fill px-2.5 py-1 text-[12px] font-medium text-muted">mock</span>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <StatTile icon="vault" label="Value locked" value={<Money value={ETFS.reduce((s, e) => s + e.navUsd, 0)} />} />
            <StatTile icon="pulse" label="24h volume" value={<Money value={12_480.5} />} />
            <StatTile icon="layers" label="Vaults" value={`${ETFS.length} live`} />
            <StatTile icon="person" label="Holders" value={new Set(ETFS.map((e) => e.owner)).size} />
            <div className="col-span-2">
              <StatTile icon="tag" label="Listed for sale" value={`${ETFS.filter((e) => e.listed).length} of ${ETFS.length}`}>
                <span className="flex h-2 overflow-hidden rounded-full bg-line">
                  <span className="bg-pink-ink" style={{ width: `${(ETFS.filter((e) => e.listed).length / ETFS.length) * 100}%` }} />
                </span>
              </StatTile>
            </div>
          </div>
          {/* fills whatever height the hero leaves: 7-day volume */}
          <div className="flex min-h-[120px] flex-1 flex-col gap-3 rounded-[20px] bg-fill p-3.5">
            <span className="flex items-center justify-between text-[13px] font-semibold">
              Volume · 7 days
              <span className="font-normal text-muted">
                <Money value={VOLUME.reduce((s, v) => s + v.usd, 0)} />
              </span>
            </span>
            <div className="flex flex-1 items-end gap-2">
              {VOLUME.map((v, i) => (
                <div key={v.day} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                  <span
                    className={`w-full rounded-[8px] ${i === VOLUME.length - 1 ? "bg-tint" : "bg-line"}`}
                    style={{ height: `${(v.usd / Math.max(...VOLUME.map((x) => x.usd))) * 100}%` }}
                    title={`$${v.usd.toLocaleString("en-US")}`}
                  />
                  <span className="text-[11px] text-muted">{v.day}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="card flex flex-col gap-3 p-5 xl:row-span-2">
          <div className="grid grid-cols-2 gap-1 rounded-full bg-fill p-1">
            {LISTS.map((l) => (
              <button
                key={l.key}
                onClick={() => setList(l.key)}
                className={`flex h-10 items-center justify-center gap-2 rounded-full text-[14px] font-semibold transition ${list === l.key ? "bg-raised shadow-[0_1px_2px_#00000014,0_3px_10px_#0000001a]" : "text-muted"}`}
              >
                <Sym name={l.icon} size={16} stroke={2.2} /> {l.label}
              </button>
            ))}
          </div>

          {items.length ? (
            <ol className="flex flex-col gap-2">
              <AnimatePresence initial={false} mode="popLayout">
              {items.map((e, i) => (
                <motion.li
                  key={e.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  whileHover={{ scale: 1.01 }}
                  className="flex items-center gap-3.5 rounded-[20px] bg-fill p-2.5 pr-3"
                >
                  <Artwork etf={e} size={56} />
                  <Link href={`/etf/${e.id}`} className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] font-bold">{e.name}</span>
                    <span className="flex items-center gap-2 text-[13px] text-muted">
                      <TokenStack allocation={e.allocation} size={16} />
                      <Money value={e.navUsd} />
                      <Change value={e.change24h} />
                    </span>
                  </Link>
                  {i === 0 ? (
                    <Link href={`/etf/${e.id}`} className="flex h-9 shrink-0 items-center whitespace-nowrap rounded-full bg-tint px-4 text-[14px] font-bold text-white active:scale-95">
                      {e.listed ? (
                        <>
                          Buy <NearAmount amount={e.priceNear} className="ml-1.5" />
                        </>
                      ) : (
                        "View"
                      )}
                    </Link>
                  ) : (
                    <BuyCapsule etf={e} />
                  )}
                </motion.li>
              ))}
              </AnimatePresence>
            </ol>
          ) : (
            <div className="grid place-items-center gap-2 rounded-[20px] bg-fill p-10 text-center">
              <span className="text-[17px] font-bold">Nothing here yet</span>
              <Link href="/create" className="text-[15px] font-semibold text-tint">
                Create the first {tab} ETF
              </Link>
            </div>
          )}
        </section>

        <section className="card flex flex-col gap-4 p-5">
          <Link href="/leaderboard" className="flex items-center justify-between">
            <h2 className="text-[20px] font-bold">Top creators</h2>
            <span className="flex items-center gap-1 text-[13px] font-semibold text-muted hover:text-text">
              Leaderboard <Sym name="chevron" size={14} stroke={2.4} />
            </span>
          </Link>
          <ol className="no-scrollbar -mx-1 flex gap-4 overflow-x-auto px-1">
            {CREATORS.map((c, i) => (
              <li key={c.name}>
                <Link href={`/etf/${c.etf.id}`} className="flex w-[84px] flex-col items-center gap-1.5 text-center">
                  <span className="relative">
                    <span className="block rounded-full ring-4 ring-fill">
                      <Avatar account={c.name} size={68} />
                    </span>
                    <span className={`absolute bottom-0.5 right-0.5 size-3.5 rounded-full ring-2 ring-surface ${i < 3 ? "bg-up" : "bg-faint"}`} />
                  </span>
                  <span className="w-full truncate text-[13px] font-semibold">{c.name}</span>
                  <Money value={c.nav} className="text-[12px] text-muted" />
                </Link>
              </li>
            ))}
          </ol>
        </section>

        <section className="card flex flex-col gap-4 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-[20px] font-bold">Browse</h2>
            <span className="text-[13px] text-muted">{CATEGORIES.length} categories</span>
          </div>
          <div className="grid flex-1 auto-rows-fr grid-cols-2 gap-3 sm:grid-cols-3">
            {CATEGORIES.map((c) => {
              const art = CATEGORY_ART[c];
              const change = ETFS.filter((e) => e.category === c).reduce((sum, e, _, all) => sum + e.change24h / all.length, 0);
              return (
                <motion.button
                  key={c}
                  onClick={() => setTab(c)}
                  whileHover={{ y: -3 }}
                  whileTap={{ scale: 0.97 }}
                  className={`grain relative flex min-h-[150px] flex-col justify-between overflow-hidden rounded-[22px] p-4 text-left text-[#121212] ${tab === c ? "ring-2 ring-ink ring-offset-2 ring-offset-surface" : ""}`}
                  style={{ background: art.bg }}
                >
                  {/* basket logos sit on the right of the tile */}
                  <span className="absolute inset-y-0 -right-2 w-[64%]">
                    <BasketArt allocation={art.allocation} className="!bg-none" />
                  </span>
                  <span className="title-chunky relative max-w-[9ch] text-[21px] leading-[1.02]">{c}</span>
                  <span className="relative">
                    <span className={`block text-[22px] font-bold tabular-nums leading-none ${change >= 0 ? "text-[#138a4b]" : "text-[#d92d2d]"}`}>
                      {change >= 0 ? "+" : "−"}
                      {Math.abs(change).toFixed(2)}%
                    </span>
                    <span className="text-[12px] font-medium text-[#121212]/55">24h change</span>
                  </span>
                </motion.button>
              );
            })}
          </div>
        </section>

        <section className="card relative flex items-center gap-6 overflow-hidden bg-lilac p-6 xl:col-span-2">
          <div className="flex-1">
            <p className="title-chunky text-[40px] text-lilac-ink">Make your own ETF</p>
            <p className="mt-2 max-w-md text-[15px] text-muted">Pick NEAR tokens, set the weights, mint the NFT. The vault holds the basket for you.</p>
            <Link href="/create" className="btn-ink mt-5 inline-flex h-12 items-center gap-2 px-6 text-[16px]">
              <Sym name="plus" size={18} stroke={2.6} /> Create ETF
            </Link>
          </div>
          <div className="relative hidden h-[180px] w-[360px] shrink-0 md:block">
            {ETFS.slice(1, 4).map((e, i) => (
              <span key={e.id} className="absolute top-2 overflow-hidden rounded-[26px] shadow-[0_10px_30px_-10px_#00000040]" style={{ left: i * 100, rotate: `${(i - 1) * 9}deg`, width: 160, height: 160, background: e.bg, zIndex: i === 1 ? 2 : 1 }}>
                <BasketArt allocation={e.allocation} />
              </span>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

/** "Collection."-style hero: chunky title, wallet chip, fanned NFT cards and quick actions. */
function Hero() {
  const fan = [ETFS[2], ETFS[0], ETFS[4], ETFS[3], ETFS[5]];
  const [hover, setHover] = useState<number | null>(null);
  const account = useAccount();
  return (
    <section className="card relative isolate flex flex-col items-center gap-5 overflow-hidden px-5 pb-6 pt-7 text-center">
      <div className="absolute inset-0 -z-10">
        <HeroBackdrop />
      </div>
      <Title size="text-[56px]">Explore</Title>
      {account && (
        <span className="-mt-2 flex items-center gap-1 rounded-full bg-fill px-3 py-1 font-mono text-[13px] text-muted">
          {account} <Sym name="chevronDown" size={13} stroke={2.4} />
        </span>
      )}

      <div className="relative h-[262px] w-full max-w-[620px] [perspective:1000px]" onMouseLeave={() => setHover(null)}>
        {fan.map((e, i) => (
          <FanCard key={e.id} etf={e} offset={i - 2} hover={hover} index={i} onHover={setHover} />
        ))}
      </div>

      <div className="flex gap-7">
        <ActionCircle icon="plus" label="Create" href="/create" img="/icons/3d/create.png" />
        <ActionCircle icon="vault" label="Vaults" href="/vaults" img="/icons/3d/vaults.png" />
        <ActionCircle icon="pulse" label="Activity" href="/activity" img="/icons/3d/activity.png" />
        <ActionCircle icon="gift" label="Gacha" href="/gacha" img="/icons/3d/gacha.png" />
      </div>
    </section>
  );
}

/**
 * One card of the hero fan. The hovered card lifts, straightens and tilts toward the cursor;
 * its neighbours slide aside. Everything rides springs so nothing snaps.
 */
function FanCard({ etf, offset, index, hover, onHover }: { etf: Etf; offset: number; index: number; hover: number | null; onHover: (i: number | null) => void }) {
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const tiltX = useSpring(useTransform(py, [-0.5, 0.5], [10, -10]), { stiffness: 200, damping: 18 });
  const tiltY = useSpring(useTransform(px, [-0.5, 0.5], [-12, 12]), { stiffness: 200, damping: 18 });
  const glareX = useTransform(px, [-0.5, 0.5], ["0%", "100%"]);

  const active = hover === index;
  const shift = hover === null || active ? 0 : Math.sign(index - hover) * (Math.abs(index - hover) === 1 ? 46 : 26);

  return (
    <motion.div
      initial={{ rotate: 0, x: -offset * 112, y: 30 }}
      animate={{
        rotate: active ? 0 : offset * 7,
        x: shift,
        y: active ? -16 : Math.abs(offset) * 14,
        scale: active ? 1.1 : hover === null ? 1 : 0.96,
      }}
      transition={{ type: "spring", stiffness: 260, damping: 22, delay: hover === null ? 0.06 + Math.abs(offset) * 0.05 : 0 }}
      onHoverStart={() => onHover(index)}
      onMouseMove={(ev) => {
        const r = ev.currentTarget.getBoundingClientRect();
        px.set((ev.clientX - r.left) / r.width - 0.5);
        py.set((ev.clientY - r.top) / r.height - 0.5);
      }}
      onMouseLeave={() => {
        px.set(0);
        py.set(0);
      }}
      className="absolute left-1/2 top-3"
      style={{ marginLeft: -90 + offset * 112, zIndex: active ? 20 : 5 - Math.abs(offset), rotateX: active ? tiltX : 0, rotateY: active ? tiltY : 0, transformStyle: "preserve-3d" }}
    >
      <Link
        href={`/etf/${etf.id}`}
        aria-label={etf.name}
        className={`relative block overflow-hidden rounded-[26px] transition-shadow duration-300 ${active ? "shadow-[0_30px_50px_-18px_#00000080]" : "shadow-[0_14px_30px_-14px_#00000059]"}`}
        style={{ width: 180, height: 210, background: etf.bg }}
      >
        <motion.span className="absolute inset-0 block" animate={{ scale: active ? 1.08 : 1 }} transition={{ type: "spring", stiffness: 200, damping: 20 }}>
          <BasketArt allocation={etf.allocation} />
        </motion.span>
        {/* soft specular sheen that tracks the cursor */}
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 mix-blend-soft-light"
          animate={{ opacity: active ? 1 : 0 }}
          style={{ background: useTransform(glareX, (x) => `radial-gradient(circle at ${x} 30%, #ffffffb3, transparent 55%)`) }}
        />
        <motion.span
          className="absolute inset-x-2 bottom-2 rounded-[16px] bg-chip px-3 py-2 text-left backdrop-blur"
          initial={false}
          animate={{ opacity: active ? 1 : 0, y: active ? 0 : 10 }}
          transition={{ type: "spring", stiffness: 300, damping: 26 }}
        >
          <span className="block truncate text-[13px] font-bold">{etf.name}</span>
          <span className="text-[11px] text-muted">
            <Money value={etf.navUsd} />
          </span>
        </motion.span>
      </Link>
    </motion.div>
  );
}
