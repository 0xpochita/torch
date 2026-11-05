"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useState } from "react";
import { Artwork, EVENT, Group } from "@/components/etf-card";
import { Sym } from "@/components/icons";
import { ToolbarChip, Topbar } from "@/components/navbar";
import { Avatar, NearAmount, PASTEL, TokenIcon } from "@/components/ui";
import { ALL_ACTIVITY, type HistoryEvent } from "@/lib/mock";

type Kind = HistoryEvent["type"];
const FILTERS = ["All", "rebalance", "deposit", "withdraw", "transfer", "mint"] as const;
const LABEL: Record<(typeof FILTERS)[number], string> = { All: "All", rebalance: "Rebalances", deposit: "Deposits", withdraw: "Withdrawals", transfer: "Sales", mint: "Mints" };
const VERB: Record<Kind, string> = { mint: "minted", deposit: "deposited into", rebalance: "rebalanced", withdraw: "withdrew from", transfer: "sold" };
const TONE = { mint: "lilac", deposit: "mint", rebalance: "sky", withdraw: "peach", transfer: "pink" } as const;

const TODAY = "2026-11-05";
const YESTERDAY = "2026-11-04";
const section = (at: string) => (at === TODAY ? "Today" : at === YESTERDAY ? "Yesterday" : at >= "2026-10-29" ? "This Week" : "Earlier");

// Five full weeks (Mon-start) ending the week of mock "today"; days after today are greyed out.
const CAL = Array.from({ length: 35 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 9, 5 + i));
  return { iso: d.toISOString().slice(0, 10), dom: d.getUTCDate() };
});
const PER_DAY = ALL_ACTIVITY.reduce<Record<string, number>>((m, a) => ((m[a.at] = (m[a.at] ?? 0) + 1), m), {});

export function Activity() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [day, setDay] = useState<string | null>(null);
  const items = ALL_ACTIVITY.filter((a) => (filter === "All" || a.type === filter) && (!day || a.at === day));

  const groups = items.reduce<{ title: string; rows: typeof items }[]>((acc, a) => {
    const t = section(a.at);
    const g = acc.find((x) => x.title === t) ?? (acc.push({ title: t, rows: [] }), acc[acc.length - 1]);
    g.rows.push(a);
    return acc;
  }, []);

  const counts = (Object.keys(EVENT) as Kind[]).map((t) => ({ t, n: ALL_ACTIVITY.filter((a) => a.type === t).length }));
  const week = ALL_ACTIVITY.filter((a) => a.at >= "2026-10-30");

  return (
    <>
      <Topbar title="Activity" subtitle="Every vault event across Torch, from NEP-297 logs">
        {FILTERS.map((f) => (
          <ToolbarChip
            key={f}
            active={filter === f}
            onClick={() => setFilter(f)}
            count={f === "All" ? ALL_ACTIVITY.length : ALL_ACTIVITY.filter((a) => a.type === f).length}
            icon={
              <span className="grid size-6 place-items-center rounded-full bg-raised text-text shadow-[0_0_0_1px_var(--line)]">
                <Sym name={f === "All" ? "pulse" : EVENT[f].icon} size={13} stroke={2.4} />
              </span>
            }
          >
            {LABEL[f]}
          </ToolbarChip>
        ))}
      </Topbar>

      <div className="grid gap-6 pt-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <main className="flex min-w-0 flex-col gap-6">
          {/* Event mix: one pill per type, width by share */}
          <section className="card flex flex-col gap-4 p-5">
            <div className="flex items-end justify-between gap-4">
              <div>
                <div className="text-[13px] font-semibold text-muted">Last 7 days</div>
                <div className="title-chunky text-[40px]">{week.length} events</div>
              </div>
              <span className="pb-2 text-[13px] text-muted">{new Set(week.map((a) => a.etf.id)).size} vaults touched</span>
            </div>
            <div className="flex gap-1.5">
              {counts.map(({ t }) => ({ t, n: week.filter((a) => a.type === t).length })).filter(({ n }) => n > 0).map(({ t, n }) => (
                <button
                  key={t}
                  onClick={() => setFilter(filter === t ? "All" : t)}
                  style={{ flexGrow: n }}
                  className={`flex h-12 min-w-[52px] basis-0 items-center gap-2 rounded-full px-3 text-[13px] font-semibold transition ${PASTEL[TONE[t]].bg} ${PASTEL[TONE[t]].ink} ${filter !== "All" && filter !== t ? "opacity-40" : ""}`}
                >
                  <Sym name={EVENT[t].icon} size={15} stroke={2.4} />
                  <span className="hidden truncate sm:inline">{LABEL[t]}</span>
                  <span className="ml-auto tabular-nums text-text">{n}</span>
                </button>
              ))}
            </div>
          </section>

          {!items.length && (
            <div className="card grid place-items-center gap-2 p-12 text-center">
              <span className="title-chunky text-[32px]">All quiet</span>
              <span className="text-[15px] text-muted">No vault events match.</span>
            </div>
          )}
          <AnimatePresence mode="popLayout" initial={false}>
            {groups.map((g) => (
              <motion.div key={g.title + filter + day} layout initial={{ y: 8 }} animate={{ y: 0 }} exit={{ opacity: 0 }}>
                <Group title={g.title}>
                  <ol className="card relative p-2">
                    {g.rows.map((a, i) => (
                      <TimelineItem key={i} h={a} last={i === g.rows.length - 1} />
                    ))}
                  </ol>
                </Group>
              </motion.div>
            ))}
          </AnimatePresence>
        </main>

        <aside className="flex flex-col gap-6">
          <Group title="Calendar" action={day && <button onClick={() => setDay(null)} className="text-[13px] font-semibold text-tint">Clear</button>}>
            <div className="card p-4">
              <div className="mb-2 flex items-center justify-between px-1 text-[13px] font-semibold">
                <span>Oct – Nov 2026</span>
                <span className="flex items-center gap-1 text-muted">
                  less
                  {[0, 1, 2].map((l) => (
                    <span key={l} className="size-2.5 rounded-[3px]" style={{ background: heat(l) }} />
                  ))}
                  more
                </span>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-muted">
                {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                  <span key={i} className="py-1">
                    {d}
                  </span>
                ))}
                {CAL.map((d) => {
                  const n = PER_DAY[d.iso] ?? 0;
                  const future = d.iso > TODAY;
                  const on = day === d.iso;
                  return (
                    <button
                      key={d.iso}
                      disabled={future}
                      onClick={() => setDay(on ? null : d.iso)}
                      title={`${d.iso} · ${n} events`}
                      className={`grid aspect-square place-items-center rounded-[10px] text-[13px] font-semibold transition disabled:cursor-default disabled:opacity-30 ${on ? "bg-tint text-white" : n ? "text-text hover:ring-2 hover:ring-tint/40" : "text-muted hover:bg-fill"} ${d.iso === TODAY && !on ? "ring-2 ring-text" : ""}`}
                      style={on || !n ? undefined : { background: heat(Math.min(n, 3) - 1) }}
                    >
                      {d.dom}
                    </button>
                  );
                })}
              </div>
            </div>
          </Group>

          <Group title="Summary">
            <div className="grid grid-cols-2 gap-2.5">
              {counts.map(({ t, n }) => (
                <button
                  key={t}
                  onClick={() => setFilter(filter === t ? "All" : t)}
                  className={`flex flex-col gap-3 rounded-[22px] p-4 text-left transition active:scale-[0.98] ${PASTEL[TONE[t]].bg} ${filter === t ? "ring-2 ring-text" : ""}`}
                >
                  <span className={`grid size-8 place-items-center rounded-full bg-surface ${PASTEL[TONE[t]].ink}`}>
                    <Sym name={EVENT[t].icon} size={16} stroke={2.4} />
                  </span>
                  <span>
                    <span className="title-chunky block text-[28px]">{n}</span>
                    <span className="text-[13px] font-semibold text-muted">{LABEL[t]}</span>
                  </span>
                </button>
              ))}
              <Link href="/create" className="flex flex-col justify-between gap-3 rounded-[22px] bg-ink p-4 text-on-ink">
                <Sym name="plus" size={20} stroke={2.4} />
                <span className="text-[14px] font-semibold leading-tight">Mint your own vault</span>
              </Link>
            </div>
          </Group>
        </aside>
      </div>
    </>
  );
}

const heat = (level: number) => `color-mix(in oklab, var(--tint) ${[18, 36, 60][level]}%, transparent)`;

/** Amount chip parsed from the event detail ("Topped up 120 USDC", "Sold for 610 NEAR"). */
function Amount({ h }: { h: (typeof ALL_ACTIVITY)[number] }) {
  if (h.type === "transfer") return <NearAmount amount={h.etf.priceNear} className="text-[14px] font-semibold" />;
  const usdc = h.detail.match(/(\d+) USDC/)?.[1];
  if (!usdc) return null;
  return (
    <span className={`flex items-center gap-1.5 text-[14px] font-semibold ${h.type === "withdraw" ? "text-down" : "text-up"}`}>
      {h.type === "withdraw" ? "−" : "+"}
      {usdc}
      <TokenIcon token="USDC" size={16} />
    </span>
  );
}

function TimelineItem({ h, last }: { h: (typeof ALL_ACTIVITY)[number]; last: boolean }) {
  const t = TONE[h.type];
  return (
    <li className="relative flex gap-3 rounded-[18px] px-2 py-2.5 transition hover:bg-fill/60">
      {!last && <span className="absolute bottom-[-10px] left-[25px] top-[46px] w-[2px] rounded-full bg-line" />}
      <span className={`relative grid size-9 shrink-0 place-items-center rounded-full ${PASTEL[t].bg} ${PASTEL[t].ink}`}>
        <Sym name={EVENT[h.type].icon} size={16} stroke={2.4} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[15px]">
          <span className="flex items-center gap-1.5 font-semibold">
            <Avatar account={h.account} size={20} />
            {h.account}
          </span>
          <span className="text-muted">{VERB[h.type]}</span>
          <Link href={`/etf/${h.etf.id}`} className="flex items-center gap-1.5 rounded-full bg-fill py-0.5 pl-0.5 pr-2.5 font-semibold hover:bg-line">
            <Artwork etf={h.etf} size={22} className="rounded-full" />
            {h.etf.name}
          </Link>
        </div>
        <div className="mt-1 truncate text-[13px] text-muted">{h.detail}</div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <Amount h={h} />
        <span className="text-[12px] text-muted">{new Date(h.at + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}</span>
      </div>
    </li>
  );
}
