"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Artwork, BuyCapsule, Change, Group } from "@/components/etf-card";
import { SymTile } from "@/components/icons";
import { ToolbarChip, Topbar } from "@/components/navbar";
import { Money, Segmented, TokenStack } from "@/components/ui";
import { CATEGORIES, ETFS, type Category, type Etf } from "@/lib/mock";

const TABS = ["All", ...CATEGORIES] as const;
const SORTS = ["Trending", "NAV", "Newest"] as const;

// Editorial row, App Store "Today" style.
const STORIES: { etf: Etf; eyebrow: string; headline: string }[] = [
  { etf: ETFS[0], eyebrow: "ETF of the day", headline: "The NEAR blue chips, in one NFT" },
  { etf: ETFS[4], eyebrow: "Chain abstraction", headline: "Hold BTC and ZEC without leaving NEAR" },
  { etf: ETFS[3], eyebrow: "Trending now", headline: "Meme Lab is up 12% this week" },
];

// Creators ranked by total NAV of the ETFs they made.
const CREATORS = Object.values(
  ETFS.reduce<Record<string, { name: string; nav: number; count: number; etf: Etf }>>((acc, e) => {
    const c = (acc[e.creator] ??= { name: e.creator, nav: 0, count: 0, etf: e });
    c.nav += e.navUsd;
    c.count += 1;
    return acc;
  }, {}),
).sort((a, b) => b.nav - a.nav);

const TODAY = new Date(Date.UTC(2026, 10, 5)).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });

export function Explore() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("All");
  const [sort, setSort] = useState<(typeof SORTS)[number]>("Trending");

  const items = ETFS.filter((e) => tab === "All" || e.category === (tab as Category)).sort((a, b) =>
    sort === "NAV" ? b.navUsd - a.navUsd : sort === "Newest" ? Number(b.id) - Number(a.id) : b.likes - a.likes,
  );

  return (
    <>
      <Topbar>
        {TABS.map((t) => (
          <ToolbarChip key={t} active={tab === t} onClick={() => setTab(t)}>
            {t}
          </ToolbarChip>
        ))}
      </Topbar>

      <div className="flex flex-col gap-10 pb-6 pt-6">
        <header className="px-1">
          <p className="text-[13px] font-semibold uppercase tracking-wide text-muted">{TODAY}</p>
          <h1 className="text-[34px] font-bold leading-tight">{tab === "All" ? "Explore" : tab}</h1>
        </header>

        {tab === "All" && (
          <section className="no-scrollbar -mx-3 flex snap-x snap-mandatory gap-4 overflow-x-auto px-3 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0">
            {STORIES.map((s) => (
              <Story key={s.etf.id} {...s} />
            ))}
          </section>
        )}

        <Group title={tab === "All" ? "Top ETFs" : `Top ${tab}`} action={<Segmented options={SORTS} value={sort} onChange={setSort} />}>
          {items.length ? (
            <ol className="grid gap-x-8 md:grid-cols-2 2xl:grid-cols-3">
              {items.map((e, i) => (
                <li key={e.id} className="group flex items-center gap-3.5 py-2.5">
                  <Artwork etf={e} size={64} />
                  <span className="w-5 shrink-0 text-center text-[17px] font-semibold">{i + 1}</span>
                  <Link href={`/etf/${e.id}`} className="flex min-w-0 flex-1 items-center gap-3 self-stretch border-b border-line-soft group-[&:nth-last-child(-n+1)]:border-0 md:group-[&:nth-last-child(-n+2)]:border-0 2xl:group-[&:nth-last-child(-n+3)]:border-0">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[16px] font-semibold">{e.name}</span>
                      <span className="block truncate text-[13px] text-muted">{e.category}</span>
                      <span className="mt-0.5 flex items-center gap-2 text-[13px]">
                        <TokenStack allocation={e.allocation} size={16} />
                        <Money value={e.navUsd} className="text-muted" />
                        <Change value={e.change24h} />
                      </span>
                    </span>
                  </Link>
                  <BuyCapsule etf={e} />
                </li>
              ))}
            </ol>
          ) : (
            <div className="card grid place-items-center gap-2 p-12 text-center">
              <SymTile name="layers" size={40} />
              <span className="text-[17px] font-semibold">No {tab} ETFs yet</span>
              <Link href="/create" className="text-[15px] font-semibold text-tint">
                Create the first one
              </Link>
            </div>
          )}
        </Group>

        <Group title="Top Creators">
          <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {CREATORS.map((c) => (
              <li key={c.name}>
                <Link href={`/etf/${c.etf.id}`} className="card flex flex-col items-center gap-2 p-4 text-center transition hover:bg-fill/40">
                  <span className="relative size-16 overflow-hidden rounded-full" style={{ background: c.etf.bg }}>
                    <Image src={c.etf.image} alt="" fill sizes="64px" className="object-cover" />
                  </span>
                  <span className="w-full truncate text-[15px] font-semibold">{c.name}</span>
                  <span className="text-[12px] text-muted">
                    {c.count} {c.count === 1 ? "ETF" : "ETFs"} · <Money value={c.nav} />
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </Group>
      </div>
    </>
  );
}

/** Full-bleed editorial card with an app-style footer, like the App Store "Today" tab. */
function Story({ etf, eyebrow, headline }: { etf: Etf; eyebrow: string; headline: string }) {
  return (
    <Link href={`/etf/${etf.id}`} className="group relative flex aspect-[4/5] w-[78vw] max-w-[420px] shrink-0 snap-start flex-col overflow-hidden rounded-[22px] md:w-auto md:max-w-none" style={{ background: etf.bg }}>
      <Image src={etf.image} alt={etf.name} fill priority sizes="(min-width: 768px) 33vw, 80vw" className="object-cover transition duration-500 group-hover:scale-[1.03]" />
      <span className="relative p-5">
        <span className="block text-[12px] font-semibold uppercase tracking-wide text-[#1d1d1f]/60">{eyebrow}</span>
        <span className="mt-1 block max-w-[16ch] text-[26px] font-bold leading-[1.1] text-[#1d1d1f]">{headline}</span>
      </span>
      <span className="material relative mt-auto flex items-center gap-3 rounded-none p-3.5">
        <Artwork etf={etf} size={44} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold">{etf.name}</span>
          <span className="block truncate text-[12px] text-muted">
            NAV <Money value={etf.navUsd} />
          </span>
        </span>
        <span className="btn-tint grid h-8 place-items-center px-4 text-[14px]">{etf.listed ? `Ⓝ ${etf.priceNear}` : "VIEW"}</span>
      </span>
    </Link>
  );
}
