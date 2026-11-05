"use client";

import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Artwork, BuyCapsule, Change } from "@/components/etf-card";
import { Sym, type IconName } from "@/components/icons";
import { ToolbarChip, Topbar } from "@/components/navbar";
import { ActionCircle, CATEGORY_PASTEL, Money, PASTEL, StatTile, Title, TokenStack } from "@/components/ui";
import { CATEGORIES, ETFS, ME, type Category, type Etf } from "@/lib/mock";

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
                <span className="relative size-6 overflow-hidden rounded-full" style={{ background: CATEGORY_ART[t].bg }}>
                  <Image src={CATEGORY_ART[t].image} alt="" fill sizes="48px" className="scale-[1.35] object-cover" />
                </span>
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
            <h2 className="text-[20px] font-bold">Browse</h2>
            <span className="text-[13px] text-muted">{CATEGORIES.length} categories</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {CATEGORIES.map((c) => {
              const tone = CATEGORY_PASTEL[c];
              const n = ETFS.filter((e) => e.category === c).length;
              return (
                <motion.button key={c} onClick={() => setTab(c)} whileHover={{ y: -3 }} whileTap={{ scale: 0.96 }} className={`flex flex-col items-start gap-6 rounded-[22px] p-3.5 text-left ${PASTEL[tone].bg} ${tab === c ? "ring-2 ring-ink" : ""}`}>
                  <span className={`grid size-10 place-items-center rounded-[30%] bg-surface ${PASTEL[tone].ink}`}>
                    <Sym name={CATEGORY_ICON[c]} size={20} stroke={2.2} />
                  </span>
                  <span>
                    <span className="block text-[15px] font-bold leading-tight">{c}</span>
                    <span className="text-[12px] text-muted">
                      {n} {n === 1 ? "basket" : "baskets"}
                    </span>
                  </span>
                </motion.button>
              );
            })}
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
                    <Link href={`/etf/${e.id}`} className="grid h-9 place-items-center rounded-full bg-tint px-4 text-[14px] font-bold text-white active:scale-95">
                      {e.listed ? `Buy Ⓝ${e.priceNear}` : "View"}
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
          <div className="flex items-center justify-between">
            <h2 className="text-[20px] font-bold">Top creators</h2>
            <Sym name="chevron" size={16} className="text-muted" />
          </div>
          <ol className="no-scrollbar -mx-1 flex gap-4 overflow-x-auto px-1">
            {CREATORS.map((c, i) => (
              <li key={c.name}>
                <Link href={`/etf/${c.etf.id}`} className="flex w-[76px] flex-col items-center gap-1.5 text-center">
                  <span className="relative">
                    <span className="relative block size-[68px] overflow-hidden rounded-full ring-4 ring-fill" style={{ background: c.etf.bg }}>
                      <Image src={c.etf.image} alt="" fill sizes="68px" className="object-cover" />
                    </span>
                    <span className={`absolute bottom-0.5 right-0.5 size-3.5 rounded-full ring-2 ring-surface ${i < 3 ? "bg-up" : "bg-faint"}`} />
                  </span>
                  <span className="w-full truncate text-[13px] font-semibold">{c.name.replace(".near", "")}</span>
                  <Money value={c.nav} className="text-[12px] text-muted" />
                </Link>
              </li>
            ))}
          </ol>
        </section>

        <section className="card flex flex-col gap-4 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-[20px] font-bold">Market today</h2>
            <span className="rounded-full bg-fill px-2.5 py-1 text-[12px] font-medium text-muted">mock</span>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <StatTile icon="vault" tone="lilac" label="Value locked" value={<Money value={ETFS.reduce((s, e) => s + e.navUsd, 0)} />} />
            <StatTile icon="pulse" tone="sky" label="24h volume" value={<Money value={12_480.5} />} />
            <StatTile icon="layers" tone="peach" label="Vaults" value={`${ETFS.length} live`} />
            <StatTile icon="person" tone="mint" label="Holders" value={new Set(ETFS.map((e) => e.owner)).size} />
            <div className="col-span-2">
              <StatTile icon="swap" tone="pink" label="Rebalanced this week" value={`${ETFS.filter((e) => e.rebalance !== "Monthly").length} of ${ETFS.length}`}>
                <span className="flex h-2 overflow-hidden rounded-full bg-line">
                  <span className="bg-pink-ink" style={{ width: `${(ETFS.filter((e) => e.rebalance !== "Monthly").length / ETFS.length) * 100}%` }} />
                </span>
              </StatTile>
            </div>
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
                <Image src={e.image} alt="" fill sizes="160px" className="object-cover" />
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
  return (
    <section className="card flex flex-col items-center gap-5 overflow-hidden px-5 pb-6 pt-7 text-center">
      <Title size="text-[56px]">Explore</Title>
      <span className="-mt-2 flex items-center gap-1 rounded-full bg-fill px-3 py-1 font-mono text-[13px] text-muted">
        {ME} <Sym name="chevronDown" size={13} stroke={2.4} />
      </span>

      <div className="relative h-[262px] w-full max-w-[620px]">
        {fan.map((e, i) => {
          const offset = i - 2;
          return (
            <motion.div
              key={e.id}
              initial={{ rotate: 0, x: -offset * 112, y: 30 }}
              animate={{ rotate: offset * 7, x: 0, y: Math.abs(offset) * 14 }}
              whileHover={{ y: Math.abs(offset) * 14 - 14, rotate: offset * 4, zIndex: 10 }}
              transition={{ type: "spring", stiffness: 220, damping: 20, delay: 0.08 + Math.abs(offset) * 0.06 }}
              className="absolute left-1/2 top-3"
              style={{ marginLeft: -90 + offset * 112, zIndex: 5 - Math.abs(offset) }}
            >
              <Link href={`/etf/${e.id}`} aria-label={e.name} className="relative block overflow-hidden rounded-[26px] shadow-[0_14px_30px_-14px_#00000059]" style={{ width: 180, height: 210, background: e.bg }}>
                <Image src={e.image} alt="" fill sizes="180px" className="object-cover" />
              </Link>
            </motion.div>
          );
        })}
      </div>

      <div className="flex gap-7">
        <ActionCircle icon="plus" label="Create" href="/create" />
        <ActionCircle icon="vault" label="Vaults" href="/vaults" />
        <ActionCircle icon="pulse" label="Activity" href="/activity" />
        <ActionCircle icon="ellipsis" label="More" href="/favorites" />
      </div>
    </section>
  );
}
