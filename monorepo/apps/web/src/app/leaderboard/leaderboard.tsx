"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Change } from "@/components/etf-card";
import { Sym } from "@/components/icons";
import { Topbar } from "@/components/navbar";
import { Avatar, Money, Segmented } from "@/components/ui";
import { CREATOR_STATS, ETFS, ME, type CreatorStat } from "@/lib/mock";

const SORTS = ["Value", "Return", "Holders"] as const;
const PERIODS = ["24h", "7D", "30D", "Season"] as const;
type Sort = (typeof SORTS)[number];
// ponytail: mock period scaling; replace with indexed per-period NAV once the indexer exists
const SCALE: Record<(typeof PERIODS)[number], number> = { "24h": 0.08, "7D": 0.35, "30D": 1, Season: 2.4 };
// Season 1 closes at the hackathon deadline.
const SEASON_END = Date.UTC(2026, 10, 14);

const TROPHY = ["#f5b73b", "#c9ced6", "#c98a5b"];
const TIERS = [
  { min: 3500, name: "Diamond", color: "#8fd3ff" },
  { min: 2000, name: "Platinum", color: "#c9ced6" },
  { min: 1000, name: "Gold", color: "#f5b73b" },
  { min: 0, name: "Silver", color: "#9aa0a8" },
];
const tier = (usd: number) => TIERS.find((t) => usd >= t.min)!;

type Row = CreatorStat & { ret: number };

export function Leaderboard() {
  const [sort, setSort] = useState<Sort>("Value");
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>("30D");
  const [mine, setMine] = useState(false);

  const rows: Row[] = CREATOR_STATS.map((c) => ({ ...c, ret: c.return30d * SCALE[period] })).sort((a, b) =>
    sort === "Value" ? b.valueUsd - a.valueUsd : sort === "Return" ? b.ret - a.ret : b.holders - a.holders,
  );
  const max = { vaults: Math.max(...rows.map((r) => r.vaults)), ret: Math.max(...rows.map((r) => Math.abs(r.ret))), holders: Math.max(...rows.map((r) => r.holders)) };
  const leader = rows[0];

  return (
    <>
      <Topbar />

      {/* hero */}
      <section className="grain relative mt-5 overflow-hidden rounded-[28px] bg-fill">
        <div aria-hidden className="absolute inset-[-30%] opacity-60 blur-[80px] [&_svg]:!size-full">
          <Avatar account={leader.account} size={400} />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/70 to-transparent" />
        <div className="relative flex flex-col gap-6 p-6 pt-5">
          <div className="flex justify-end">
            <Countdown />
          </div>
          <div className="flex flex-wrap items-end gap-5">
            <div className="min-w-0 flex-1">
              <h1 className="title-chunky text-[34px]">Creator Season 1</h1>
              <p className="max-w-[560px] text-[14px] text-muted">Creators ranked by the baskets they build on Torch. Value, returns and holders are read from every vault they minted.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button aria-label="Save" className="btn-line grid size-11 place-items-center">
                <Sym name="heart" size={17} />
              </button>
              <Link href="/vaults" className="btn-line flex h-11 items-center gap-2 px-4 text-[14px]">
                <Sym name="person" size={16} /> My stats
              </Link>
              <Link href="/create" className="flex h-11 items-center gap-2 rounded-full bg-tint px-5 text-[14px] font-semibold text-white transition active:scale-95">
                <Sym name="plus" size={16} weight="bold" /> Create an ETF
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* controls */}
      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line-soft pt-5">
        <Segmented options={SORTS} value={sort} onChange={setSort} />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Segmented options={PERIODS} value={period} onChange={setPeriod} />
          <button onClick={() => setMine((m) => !m)} className={`h-9 rounded-[10px] px-4 text-[13px] font-semibold transition ${mine ? "bg-text text-surface" : "bg-fill hover:bg-line"}`}>
            Show my place
          </button>
        </div>
      </div>

      {/* top three */}
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {rows.slice(0, 3).map((c, i) => (
          <motion.article
            key={c.account}
            layout
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="card relative flex flex-col gap-4 overflow-hidden p-5"
          >
            <span aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(var(--text)_1px,transparent_1px),linear-gradient(90deg,var(--text)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(circle_at_85%_20%,#000,transparent_60%)]" />
            <div className="flex items-center gap-3">
              <Avatar account={c.account} size={40} />
              <span className="min-w-0 flex-1 truncate text-[17px] font-semibold">{c.account}</span>
              <span style={{ color: TROPHY[i] }}>
                <Sym name="trophy" size={36} weight="fill" className="drop-shadow-[0_4px_12px_#00000055]" />
              </span>
            </div>
            <TierBadge usd={c.valueUsd} />
            <div className="grid grid-cols-3 gap-3 text-[12px] text-muted">
              <Metric label="Value" value={<Money value={c.valueUsd} />} bar={c.valueUsd / rows[0].valueUsd} color="var(--tint)" />
              <Metric label={`Return ${period}`} value={<Change value={c.ret} />} bar={Math.abs(c.ret) / max.ret} color="var(--up)" />
              <Metric label="Holders" value={c.holders} bar={c.holders / max.holders} color="var(--lilac-ink)" />
            </div>
          </motion.article>
        ))}
      </div>

      {/* table */}
      <div className="card mt-3 overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-[14px]">
            <thead>
              <tr className="bg-fill/60 text-left text-[12px] text-muted">
                <th className="px-5 py-3 font-medium">Place</th>
                <th className="px-3 py-3 font-medium">Creator</th>
                <th className="px-3 py-3 font-medium">Vaults</th>
                <th className="px-3 py-3 font-medium">Return {period}</th>
                <th className="px-3 py-3 font-medium">Holders</th>
                <th className="px-3 py-3 font-medium">Value</th>
                <th className="px-5 py-3 font-medium">Tier</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(3).map((c, i) => {
                const top = c.etf;
                return (
                  <motion.tr key={c.account} layout transition={{ type: "spring", stiffness: 420, damping: 36 }} className="border-t border-line-soft transition-colors hover:bg-fill/50">
                    <td className="px-5 py-3 tabular-nums text-muted">{i + 4}</td>
                    <td className="px-3 py-3">
                      {top ? (
                        <Link href={`/etf/${top.id}`} className="flex items-center gap-2.5 hover:underline">
                          <Avatar account={c.account} size={26} />
                          {c.account}
                        </Link>
                      ) : (
                        <span className="flex items-center gap-2.5">
                          <Avatar account={c.account} size={26} />
                          {c.account}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <Dashed value={c.vaults} of={max.vaults} color="var(--tint)">
                        {c.vaults}
                      </Dashed>
                    </td>
                    <td className="px-3 py-3">
                      <Dashed value={Math.abs(c.ret)} of={max.ret} color={c.ret >= 0 ? "var(--up)" : "var(--down)"}>
                        <Change value={c.ret} />
                      </Dashed>
                    </td>
                    <td className="px-3 py-3">
                      <Dashed value={c.holders} of={max.holders} color="var(--lilac-ink)">
                        {c.holders}
                      </Dashed>
                    </td>
                    <td className="px-3 py-3 font-medium">
                      <Money value={c.valueUsd} />
                    </td>
                    <td className="px-5 py-3">
                      <TierBadge usd={c.valueUsd} plain />
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <AnimatePresence>
          {mine && (
            <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
              <div className="flex items-center gap-3 border-t-2 border-tint/60 bg-tint/10 px-5 py-3 text-[14px]">
                <span className="w-8 text-muted">—</span>
                <Avatar account={ME} size={26} />
                <span className="font-semibold">{ME}</span>
                <span className="text-muted">Not ranked yet. Mint a basket people hold to enter the season.</span>
                <Link href="/create" className="ml-auto font-semibold text-tint">
                  Create an ETF
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <p className="px-1 pt-3 text-[12px] text-muted">
        {rows.length} creators · {ETFS.length} live vaults · tiers by total basket value
      </p>
    </>
  );
}

function TierBadge({ usd, plain = false }: { usd: number; plain?: boolean }) {
  const t = tier(usd);
  return (
    <span className={`inline-flex w-fit items-center gap-1.5 text-[13px] font-semibold ${plain ? "" : "rounded-full bg-fill px-2.5 py-1"}`}>
      <Sym name="shield" size={15} weight="fill" className="shrink-0" />
      <span style={{ color: t.color }}>{t.name}</span>
    </span>
  );
}

function Metric({ label, value, bar, color }: { label: string; value: React.ReactNode; bar: number; color: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span>{label}</span>
      <span className="text-[15px] font-semibold text-text">{value}</span>
      <Dash n={Math.max(1, Math.round(bar * 6))} color={color} />
    </div>
  );
}

function Dashed({ value, of, color, children }: { value: number; of: number; color: string; children: React.ReactNode }) {
  return (
    <span className="flex flex-col gap-1">
      <span className="tabular-nums">{children}</span>
      <Dash n={Math.max(1, Math.round((value / (of || 1)) * 6))} color={color} />
    </span>
  );
}

function Dash({ n, color }: { n: number; color: string }) {
  return (
    <span className="flex gap-[3px]" aria-hidden>
      {Array.from({ length: n }, (_, i) => (
        <span key={i} className="h-[3px] w-3 rounded-full" style={{ background: color }} />
      ))}
    </span>
  );
}

function Countdown() {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setLeft(Math.max(0, SEASON_END - Date.now()));
    const id = setInterval(tick, 1000);
    const first = setTimeout(tick, 0);
    return () => (clearInterval(id), clearTimeout(first));
  }, []);
  const parts =
    left === null
      ? ["--", "--", "--", "--"]
      : [Math.floor(left / 86_400_000), Math.floor(left / 3_600_000) % 24, Math.floor(left / 60_000) % 60, Math.floor(left / 1000) % 60].map((v) => String(v).padStart(2, "0"));
  return (
    <span className="flex items-center gap-2 text-[13px] text-muted">
      Season ends in
      <span className="flex items-center gap-1 font-mono text-[14px] font-semibold text-text">
        {parts.map((p, i) => (
          <span key={i} className="flex items-center gap-1">
            <span className="rounded-[6px] bg-surface/70 px-1.5 py-0.5 tabular-nums">{p}</span>
            {i < 3 && <span className="text-muted">{["d", "h", "m"][i]}</span>}
          </span>
        ))}
      </span>
    </span>
  );
}
