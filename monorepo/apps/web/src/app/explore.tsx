"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Change, EtfCard, Group } from "@/components/etf-card";
import { SymTile } from "@/components/icons";
import { ToolbarChip, Topbar } from "@/components/navbar";
import { Money, Segmented, TokenIcon } from "@/components/ui";
import { CATEGORIES, ETFS, TOKENS, type Category, type Etf } from "@/lib/mock";

const TABS = ["All", ...CATEGORIES] as const;
const SORTS = ["Trending", "NAV", "Newest"] as const;
const FEATURED = [ETFS[0], ETFS[4], ETFS[3]];

// Creators ranked by total NAV of the ETFs they made.
const CREATORS = Object.values(
  ETFS.reduce<Record<string, { name: string; nav: number; etf: Etf }>>((acc, e) => {
    const c = (acc[e.creator] ??= { name: e.creator, nav: 0, etf: e });
    c.nav += e.navUsd;
    return acc;
  }, {}),
).sort((a, b) => b.nav - a.nav);

export function Explore() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("All");
  const [sort, setSort] = useState<(typeof SORTS)[number]>("Trending");

  const items = ETFS.filter((e) => tab === "All" || e.category === (tab as Category)).sort((a, b) =>
    sort === "NAV" ? b.navUsd - a.navUsd : sort === "Newest" ? Number(b.id) - Number(a.id) : b.likes - a.likes,
  );

  return (
    <>
      <Topbar title="Explore">
        {TABS.map((t) => (
          <ToolbarChip key={t} active={tab === t} onClick={() => setTab(t)}>
            {t}
          </ToolbarChip>
        ))}
      </Topbar>

      <div className="flex max-w-[1180px] flex-col gap-10 pt-6">
        {tab === "All" && <Featured />}

        <Group title={tab === "All" ? "Trending" : tab} action={<Segmented options={SORTS} value={sort} onChange={setSort} />}>
          {items.length ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((e) => (
                <EtfCard key={e.id} etf={e} />
              ))}
            </div>
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
          <div className="no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
            {CREATORS.map((c) => (
              <Link key={c.name} href={`/etf/${c.etf.id}`} className="card flex w-[168px] shrink-0 flex-col items-center gap-2 p-4 text-center">
                <span className="relative size-16 overflow-hidden rounded-full" style={{ background: c.etf.bg }}>
                  <Image src={c.etf.image} alt="" fill sizes="64px" className="object-cover" />
                </span>
                <span className="w-full truncate text-[15px] font-semibold">{c.name}</span>
                <Money value={c.nav} className="text-[13px] text-muted" />
              </Link>
            ))}
          </div>
        </Group>
      </div>
    </>
  );
}

/** Featured ETF, App Store "Today" style: artwork, title, price, one action. */
function Featured() {
  const [i, setI] = useState(0);
  const etf = FEATURED[i];

  return (
    <section className="flex flex-col gap-3">
      <Link href={`/etf/${etf.id}`} className="card grid gap-6 p-4 sm:grid-cols-[minmax(0,300px)_1fr] sm:items-center sm:p-5">
        <span className="relative aspect-square overflow-hidden rounded-[20px]" style={{ background: etf.bg }}>
          <Image key={etf.id} src={etf.image} alt={etf.name} fill priority sizes="300px" className="object-cover" />
        </span>
        <span className="flex min-w-0 flex-col gap-4 sm:pr-4">
          <span>
            <span className="block text-[13px] font-semibold uppercase tracking-wide text-muted">Featured</span>
            <span className="mt-1 block text-[34px] font-bold leading-tight">{etf.name}</span>
            <span className="text-[17px] text-muted">by {etf.creator}</span>
          </span>
          <span className="flex flex-wrap gap-2">
            {etf.allocation.map((a) => (
              <span key={a.token} className="flex items-center gap-1.5 rounded-full bg-fill py-1 pl-1 pr-3 text-[13px] font-medium">
                <TokenIcon token={a.token} size={22} />
                {TOKENS[a.token].symbol} <span className="text-muted">{a.weight}%</span>
              </span>
            ))}
          </span>
          <span className="flex items-end justify-between gap-4">
            <span>
              <span className="block text-[13px] text-muted">Net asset value</span>
              <Money value={etf.navUsd} className="text-[28px] font-semibold" /> <Change value={etf.change24h} />
            </span>
            <span className="btn-ink grid h-11 place-items-center px-6 text-[15px]">{etf.listed ? `Buy · Ⓝ ${etf.priceNear}` : "View"}</span>
          </span>
        </span>
      </Link>
      <div className="flex justify-center gap-1.5">
        {FEATURED.map((f, n) => (
          <button key={f.id} onClick={() => setI(n)} aria-label={`Show ${f.name}`} className={`h-1.5 rounded-full transition-all ${n === i ? "w-5 bg-ink" : "w-1.5 bg-faint"}`} />
        ))}
      </div>
    </section>
  );
}
