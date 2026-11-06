"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { useState } from "react";
import { Artwork, Change, Group } from "@/components/etf-card";
import { Sym } from "@/components/icons";
import { ToolbarChip, Topbar } from "@/components/navbar";
import { Avatar, Money, PASTEL, Segmented, StatTile, type Pastel } from "@/components/ui";
import { CREATOR_STATS, ME, type CreatorStat } from "@/lib/mock";

const PERIODS = ["7D", "30D", "All time"] as const;
const SORTS = ["Value", "Return", "Holders"] as const;
// ponytail: mock period scaling; replace with indexed per-period NAV once the indexer exists
const SCALE: Record<(typeof PERIODS)[number], number> = { "7D": 0.35, "30D": 1, "All time": 2.4 };

const PODIUM: { tone: Pastel }[] = [{ tone: "peach" }, { tone: "sky" }, { tone: "lilac" }];

// Season 1 runs until the hackathon deadline; mock "today" is 2026-11-05.
const SEASON_DAYS_LEFT = 9;

export function Leaderboard() {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>("30D");
  const [sort, setSort] = useState<(typeof SORTS)[number]>("Value");

  const rows = CREATOR_STATS.map((c) => ({ ...c, ret: c.return30d * SCALE[period] }))
    .sort((a, b) => (sort === "Value" ? b.valueUsd - a.valueUsd : sort === "Return" ? b.ret - a.ret : b.holders - a.holders));
  const top = rows.slice(0, 3);
  const rest = rows.slice(3);
  const total = rows.reduce((s, c) => s + c.valueUsd, 0);
  const avg = rows.reduce((s, c) => s + c.ret, 0) / rows.length;

  return (
    <>
      <Topbar title="Leaderboard" subtitle="Creators ranked by the baskets they build, Season 1">
        {PERIODS.map((p) => (
          <ToolbarChip key={p} active={period === p} onClick={() => setPeriod(p)} icon={<Sym name="clock" size={15} stroke={2.2} />}>
            {p}
          </ToolbarChip>
        ))}
      </Topbar>

      <div className="grid gap-6 pt-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <main className="flex min-w-0 flex-col gap-6">
          {/* Podium: 2 · 1 · 3 */}
          <div className="grid items-end gap-3 sm:grid-cols-3">
            {[1, 0, 2].map((i) => top[i] && <PodiumCard key={top[i].account} c={top[i]} rank={i + 1} sort={sort} />)}
          </div>

          <Group title="Rankings" action={<Segmented options={SORTS} value={sort} onChange={setSort} />}>
            <div className="card overflow-hidden py-1">
              <div className="hidden grid-cols-[44px_minmax(0,1fr)_90px_110px_90px_80px] gap-3 px-4 py-2 text-[12px] font-semibold text-muted md:grid">
                <span>#</span>
                <span>Creator</span>
                <span className="text-right">Vaults</span>
                <span className="text-right">Value</span>
                <span className="text-right">Return</span>
                <span className="text-right">Holders</span>
              </div>
              <ol>
                {rest.map((c, i) => (
                  <motion.li key={c.account} layout transition={{ type: "spring", stiffness: 420, damping: 36 }}>
                    <RankRow c={c} rank={i + 4} />
                  </motion.li>
                ))}
              </ol>
            </div>
          </Group>
        </main>

        <aside className="flex flex-col gap-6">
          <Group title="Your rank">
            <div className="card flex flex-col gap-4 p-5">
              <div className="flex items-center gap-3">
                <Avatar account={ME} size={48} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[16px] font-semibold">{ME}</div>
                  <div className="text-[13px] text-muted">Not ranked yet</div>
                </div>
                <span className="title-chunky text-[30px] text-faint">—</span>
              </div>
              <p className="text-[13px] text-muted">Mint a basket people hold and it starts counting toward your rank.</p>
              <Link href="/create" className="btn-ink grid h-11 place-items-center text-[15px]">
                Create an ETF
              </Link>
            </div>
          </Group>

          <div className="flex items-center gap-3 rounded-[26px] bg-lime p-5 text-lime-ink">
            <Sym name="trophy" size={28} stroke={2} />
            <div className="flex-1">
              <div className="text-[13px] font-semibold opacity-80">Season 1 ends in</div>
              <div className="title-chunky text-[30px] text-text">{SEASON_DAYS_LEFT} days</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <StatTile icon="person" label="Creators" value={rows.length} />
            <StatTile icon="vault" label="Vaults" value={rows.reduce((s, c) => s + c.vaults, 0)} />
            <StatTile icon="layers" label="Total value" value={<Money value={total} />} />
            <StatTile icon="pulse" label={`Avg ${period}`} value={<Change value={avg} />} />
          </div>
        </aside>
      </div>
    </>
  );
}

type Row = CreatorStat & { ret: number };

function metric(c: Row, sort: (typeof SORTS)[number]) {
  if (sort === "Return") return <Change value={c.ret} />;
  if (sort === "Holders") return <>{c.holders} holders</>;
  return <Money value={c.valueUsd} count />;
}

function PodiumCard({ c, rank, sort }: { c: Row; rank: number; sort: (typeof SORTS)[number] }) {
  const p = PODIUM[rank - 1];
  return (
    <motion.article
      layout
      initial={{ y: 16 }}
      animate={{ y: 0 }}
      whileHover={{ y: -4 }}
      transition={{ type: "spring", stiffness: 380, damping: 26 }}
      className={`relative isolate flex flex-col overflow-hidden rounded-[28px] p-5 ${PASTEL[p.tone].bg} ${rank === 1 ? "min-h-[300px]" : "min-h-[260px]"}`}
    >
      <div className="flex items-start justify-between">
        <Avatar account={c.account} size={rank === 1 ? 64 : 56} />
        <span className={`title-chunky ${rank === 1 ? "text-[64px]" : "text-[52px]"} leading-none ${PASTEL[p.tone].ink}`}>{rank}</span>
      </div>
      <div className="mt-auto pt-6">
        <div className="truncate text-[17px] font-semibold">{c.account}</div>
        <div className="title-chunky mt-0.5 text-[30px]">{metric(c, sort)}</div>
        <div className="mt-3 flex flex-wrap gap-1.5 text-[12px] font-semibold">
          <span className="rounded-full bg-surface/70 px-2.5 py-1">{c.vaults} {c.vaults === 1 ? "vault" : "vaults"}</span>
          <span className="rounded-full bg-surface/70 px-2.5 py-1">
            <Change value={c.ret} />
          </span>
          <span className="rounded-full bg-surface/70 px-2.5 py-1">{c.followers} followers</span>
        </div>
        {c.etf && (
          <Link href={`/etf/${c.etf.id}`} className="mt-3 flex items-center gap-3 rounded-[18px] bg-surface/70 p-2 pr-3 transition hover:bg-surface">
            <Artwork etf={c.etf} size={40} />
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-semibold text-muted">Top vault</span>
              <span className="block truncate text-[14px] font-semibold">{c.etf.name}</span>
            </span>
            <Sym name="chevron" size={14} weight="bold" className="text-muted" />
          </Link>
        )}
      </div>
    </motion.article>
  );
}

function Move({ n }: { n: number }) {
  if (!n) return <span className="text-[12px] text-faint">–</span>;
  return (
    <span className={`flex items-center text-[12px] font-semibold ${n > 0 ? "text-up" : "text-down"}`}>
      <Sym name={n > 0 ? "arrowUp" : "arrowDown"} size={12} stroke={2.6} />
      {Math.abs(n)}
    </span>
  );
}

function RankRow({ c, rank }: { c: Row; rank: number }) {
  const inner = (
    <>
      <span className="flex items-center gap-1.5">
        <span className="title-chunky w-6 text-[20px]">{rank}</span>
        <Move n={c.move} />
      </span>
      <span className="flex min-w-0 items-center gap-3">
        <Avatar account={c.account} size={40} />
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-semibold">{c.account}</span>
          <span className="block truncate text-[13px] text-muted">{c.etf ? `Top: ${c.etf.name}` : `${c.followers} followers`}</span>
        </span>
      </span>
      <span className="hidden text-right text-[15px] md:block">{c.vaults}</span>
      <Money value={c.valueUsd} className="text-right text-[15px] font-medium" />
      <span className="hidden text-right text-[15px] md:block">
        <Change value={c.ret} />
      </span>
      <span className="hidden text-right text-[15px] text-muted md:block">{c.holders}</span>
    </>
  );
  const cls = "grid grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-3 border-t border-line-soft px-4 py-3 transition hover:bg-fill/60 md:grid-cols-[44px_minmax(0,1fr)_90px_110px_90px_80px]";
  return c.etf ? (
    <Link href={`/etf/${c.etf.id}`} className={cls}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}
