"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Avatars, Change, EtfCard, tint } from "@/components/etf-card";
import { Money, SectionHeader, Segmented } from "@/components/ui";
import { Topbar } from "@/components/navbar";
import { CATEGORIES, ETFS, TOKENS, type Category, type Etf, type HistoryEvent } from "@/lib/mock";

const TABS = ["All ETFs", ...CATEGORIES] as const;

const ACTIVITY_ICON: Record<HistoryEvent["type"], { glyph: string; bg: string }> = {
  mint: { glyph: "✦", bg: "#e4e0ff" },
  deposit: { glyph: "↓", bg: "#d8f3e4" },
  rebalance: { glyph: "⇄", bg: "#dcecff" },
  withdraw: { glyph: "↑", bg: "#ffe0e3" },
  transfer: { glyph: "◈", bg: "#ffe7d1" },
};

// Latest events across every vault, newest first.
const ACTIVITY = ETFS.flatMap((e) => e.history.map((h) => ({ ...h, etf: e })))
  .sort((a, b) => b.at.localeCompare(a.at))
  .slice(0, 8);

// Creators ranked by total NAV of the ETFs they made.
const CREATORS = Object.values(
  ETFS.reduce<Record<string, { name: string; nav: number; change: number; etf: Etf }>>((acc, e) => {
    const c = (acc[e.creator] ??= { name: e.creator, nav: 0, change: 0, etf: e });
    c.nav += e.navUsd;
    c.change = e.change24h;
    return acc;
  }, {}),
)
  .sort((a, b) => b.nav - a.nav)
  .slice(0, 4);

const STATS = [
  { k: "Total value locked", v: ETFS.reduce((s, e) => s + e.navUsd, 0), change: 3.18 },
  { k: "24h volume", v: 12_480.5, change: 8.4 },
  { k: "ETF vaults", n: ETFS.length, sub: `${ETFS.filter((e) => e.listed).length} listed` },
  { k: "Unique holders", n: new Set(ETFS.map((e) => e.owner)).size, sub: "+2 this week" },
];

const SORTS = ["Trending", "NAV", "Newest"] as const;

export function Explore() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("All ETFs");
  const [showAll, setShowAll] = useState(false);
  const [sort, setSort] = useState<(typeof SORTS)[number]>("Trending");
  const [following, setFollowing] = useState<string[]>([]);

  const items = ETFS.filter((e) => tab === "All ETFs" || e.category === (tab as Category)).sort((a, b) =>
    sort === "NAV" ? b.navUsd - a.navUsd : sort === "Newest" ? Number(b.id) - Number(a.id) : b.likes - a.likes,
  );

  return (
    <>
      <Topbar title="Explore">
        <nav className="no-scrollbar flex gap-1 overflow-x-auto text-[14px]">
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`shrink-0 rounded-full px-3 py-1.5 font-medium transition ${tab === t ? "bg-ink text-white" : "text-text/70 hover:bg-fill"}`}>
              {t}
            </button>
          ))}
        </nav>
      </Topbar>

      <div className="grid flex-1 gap-8 py-6 2xl:grid-cols-[minmax(0,1fr)_340px]">
        <main className="flex min-w-0 flex-col gap-8">
          <dl className="card grid grid-cols-2 overflow-hidden lg:grid-cols-4">
            {STATS.map((st) => (
              <div key={st.k} className="flex flex-col gap-1 border-line-soft p-4 [&:not(:first-child)]:border-l max-lg:[&:nth-child(3)]:border-l-0 max-lg:[&:nth-child(n+3)]:border-t">
                <dt className="text-xs text-muted">{st.k}</dt>
                <dd className="text-xl font-semibold">{"v" in st && st.v !== undefined ? <Money value={st.v} /> : st.n}</dd>
                <dd className="text-xs">{"change" in st && st.change !== undefined ? <Change value={st.change} /> : <span className="text-muted">{st.sub}</span>}</dd>
              </div>
            ))}
          </dl>

          <Hero />

          <section className="flex flex-col gap-4">
            <SectionHeader
              title="Trending ETFs"
              sub="Baskets the community is buying and rebalancing this week"
              action={<Segmented options={SORTS} value={sort} onChange={setSort} />}
            />
            {items.length ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {items.map((e) => (
                  <EtfCard key={e.id} etf={e} />
                ))}
              </div>
            ) : (
              <p className="rounded-2xl border border-dashed border-line p-10 text-center text-muted">No ETF in this category yet.</p>
            )}
          </section>
        </main>

        <aside className="grid gap-8 lg:grid-cols-2 2xl:flex 2xl:flex-col">
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Recent Activity</h2>
              <span className="rounded-full bg-fill px-3 py-1 text-xs font-medium">This week ⌄</span>
            </div>
            <ul className="card flex flex-col p-1.5">
              {(showAll ? ACTIVITY : ACTIVITY.slice(0, 4)).map((a, i) => (
                <li key={i}>
                  <Link href={`/etf/${a.etf.id}`} className="flex items-center gap-3 rounded-[16px] p-2.5 transition hover:bg-fill">
                    <span className="grid size-11 shrink-0 place-items-center rounded-lg text-lg" style={{ background: ACTIVITY_ICON[a.type].bg }}>
                      {ACTIVITY_ICON[a.type].glyph}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-sm font-medium">
                        <span className="truncate">
                          {a.etf.name} · {a.type}
                        </span>
                        {i < 2 && <span className="size-1.5 shrink-0 rounded-full bg-down" />}
                        <span className="shrink-0 text-[11px] font-normal text-faint">{a.at.slice(5)}</span>
                      </span>
                      <span className="block truncate text-xs text-muted">{a.detail}</span>
                    </span>
                    <span className="text-faint">···</span>
                  </Link>
                </li>
              ))}
            </ul>
            <button onClick={() => setShowAll(!showAll)} className="btn-line h-11 text-sm text-tint">
              {showAll ? "Show less" : "Show more"}
            </button>
          </section>

          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Top Creators</h2>
              <span className="text-[15px] text-tint">View all</span>
            </div>
            <ol className="card flex flex-col p-1.5">
              {CREATORS.map((c, i) => (
                <li key={c.name} className="flex items-center gap-4 rounded-[16px] px-3 py-2.5">
                  <span className="w-3 text-sm font-medium">{i + 1}</span>
                  <span className="relative size-11 shrink-0 overflow-hidden rounded-full" style={{ background: c.etf.bg }}>
                    <Image src={c.etf.image} alt="" fill sizes="44px" className="object-cover" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">@{c.name.replace(".near", "")}</span>
                    <span className="text-xs text-muted">
                      NAV <Money value={c.nav} />
                    </span>
                  </span>
                  <span className="flex flex-col items-end gap-1 text-xs font-medium">
                    <Change value={c.change} />
                    <button
                      onClick={() => setFollowing((f) => (f.includes(c.name) ? f.filter((x) => x !== c.name) : [...f, c.name]))}
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${following.includes(c.name) ? "bg-fill text-muted" : "bg-tint text-white"}`}
                    >
                      {following.includes(c.name) ? "Following" : "Follow"}
                    </button>
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </>
  );
}

const FEATURED = [ETFS[0], ETFS[4], ETFS[3], ETFS[2]];

function Hero() {
  const [i, setI] = useState(0);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0); // client-only clock, avoids a hydration mismatch
    const t = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);
  const etf = FEATURED[i];

  // Next keeper rebalance: top of the next 3-hour window (mock schedule).
  const left = now === null ? null : 3 * 3600_000 - (now % (3 * 3600_000));
  const hms = left === null ? "--h --m --s" : [3600_000, 60_000, 1000].map((u, k) => `${String(Math.floor((left / u) % (k ? 60 : 24))).padStart(2, "0")}${"hms"[k]}`).join(" ");

  const perks = [
    { glyph: "◎", bg: "#ffd9e4", k: "Basket", v: `${etf.allocation.length} tokens` },
    { glyph: "▣", bg: "#ffffff", k: "Vault", v: `${etf.id}.torch.near` },
    { glyph: "⇄", bg: "#ded9ff", k: "Strategy", v: `${etf.rebalance} rebalance` },
  ];

  return (
    <section className="grid gap-6 rounded-[28px] bg-[radial-gradient(120%_140%_at_100%_0%,#3b1d7a_0%,#141018_55%)] p-4 text-white shadow-[0_20px_50px_-24px_rgb(60_20_140/0.6)] sm:grid-cols-[minmax(0,240px)_1fr] sm:p-5 lg:grid-cols-[minmax(0,300px)_1fr]">
      <Link href={`/etf/${etf.id}`} className="relative aspect-square overflow-hidden rounded-[22px]" style={{ background: etf.bg }}>
        <Image key={etf.id} src={etf.image} alt={etf.name} fill priority sizes="300px" className="object-cover" />
      </Link>

      <div className="flex min-w-0 flex-col gap-5 py-1">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-3">
            <h1 className="text-2xl font-semibold">{etf.name}</h1>
            <span className="flex items-center gap-2.5">
              <span className="grid size-9 place-items-center rounded-full bg-white/15 text-sm font-semibold uppercase">{etf.creator[0]}</span>
              <span className="leading-tight">
                <span className="block text-sm font-medium">{etf.creator}</span>
                <span className="text-xs text-white/50">creator</span>
              </span>
            </span>
          </div>
          <span className="text-xl" aria-label={`${etf.likes} likes`}>
            ♥
          </span>
        </div>

        <dl className="flex flex-wrap gap-x-12 gap-y-3">
          <div>
            <dt className="text-xs text-white/50">NAV per NFT</dt>
            <dd className="text-xl font-semibold">
              <Money value={etf.navUsd} />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-white/50">Next rebalance in</dt>
            <dd className="font-mono text-xl font-semibold tabular-nums" suppressHydrationWarning>
              {hms}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-white/50">24h</dt>
            <dd className="text-xl font-semibold">
              <Change value={etf.change24h} />
            </dd>
          </div>
        </dl>

        <ul className="flex flex-wrap gap-x-8 gap-y-3">
          {perks.map((p) => (
            <li key={p.k} className="flex items-center gap-2.5">
              <span className="grid size-10 place-items-center rounded-lg text-lg text-ink" style={{ background: p.bg }}>
                {p.glyph}
              </span>
              <span className="leading-tight">
                <span className="block text-[11px] text-white/50">{p.k}</span>
                <span className="text-sm">{p.v}</span>
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-auto flex flex-wrap items-center gap-3">
          <Link href={`/etf/${etf.id}`} className="grid h-11 place-items-center rounded-full bg-white px-6 text-[15px] font-semibold text-ink active:scale-[0.97]">
            View basket
          </Link>
          <Link href={`/etf/${etf.id}`} className="grid h-11 place-items-center rounded-full bg-white/15 px-6 text-[15px] font-semibold backdrop-blur hover:bg-white/20">
            {etf.listed ? `Buy · Ⓝ ${etf.priceNear}` : "Make offer"}
          </Link>
          <div className="ml-auto flex gap-1.5">
            {FEATURED.map((f, n) => (
              <button
                key={f.id}
                onClick={() => setI(n)}
                aria-label={`Show ${f.name}`}
                className={`relative size-9 overflow-hidden rounded-lg ring-2 transition ${n === i ? "ring-white" : "opacity-50 ring-transparent hover:opacity-80"}`}
                style={{ background: f.bg }}
              >
                <Image src={f.image} alt="" fill sizes="36px" className="object-cover" />
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {etf.allocation.map((a) => (
            <span key={a.token} className="rounded-lg px-2 py-1 text-xs text-ink" style={{ background: tint(TOKENS[a.token].color, 55) }}>
              {TOKENS[a.token].symbol} {a.weight}%
            </span>
          ))}
          <span className="ml-auto self-center">
            <Avatars etf={etf} className="text-white/70" />
          </span>
        </div>
      </div>
    </section>
  );
}
