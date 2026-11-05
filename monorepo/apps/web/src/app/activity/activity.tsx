"use client";

import { useState } from "react";
import { ActivityRow, EVENT, Group } from "@/components/etf-card";
import { Sym } from "@/components/icons";
import { ToolbarChip, Topbar } from "@/components/navbar";
import { PastelIcon } from "@/components/ui";
import { ALL_ACTIVITY, type HistoryEvent } from "@/lib/mock";

const FILTERS = ["All", "rebalance", "deposit", "withdraw", "transfer", "mint"] as const;
const LABEL: Record<(typeof FILTERS)[number], string> = { All: "All", rebalance: "Rebalances", deposit: "Deposits", withdraw: "Withdrawals", transfer: "Sales", mint: "Mints" };

const TODAY = "2026-11-05";
const YESTERDAY = "2026-11-04";
const section = (at: string) => (at === TODAY ? "Today" : at === YESTERDAY ? "Yesterday" : at >= "2026-10-29" ? "This Week" : "Earlier");

const TONE = { mint: "lilac", deposit: "mint", rebalance: "sky", withdraw: "peach", transfer: "pink" } as const;

// Last 7 days ending today (mock "today" is 2026-11-05).
const DAYS = Array.from({ length: 7 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 10, 5 - 6 + i));
  return { iso: d.toISOString().slice(0, 10), dow: d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }), dom: d.getUTCDate() };
});

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

  const counts = (Object.keys(EVENT) as HistoryEvent["type"][]).map((t) => ({ t, n: ALL_ACTIVITY.filter((a) => a.type === t).length }));

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

      <div className="grid gap-6 pt-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <main className="flex min-w-0 flex-col gap-6">
          <div className="card no-scrollbar flex gap-2 overflow-x-auto p-3">
            {DAYS.map((d) => {
              const n = ALL_ACTIVITY.filter((a) => a.at === d.iso).length;
              const on = day === d.iso;
              return (
                <button
                  key={d.iso}
                  onClick={() => setDay(on ? null : d.iso)}
                  className={`flex min-w-[64px] flex-1 flex-col items-center gap-1 rounded-[18px] py-2.5 transition ${on ? "bg-tint text-white" : "hover:bg-fill"}`}
                >
                  <span className={`text-[13px] font-semibold ${on ? "text-white/80" : "text-muted"}`}>{d.dow}</span>
                  <span className="text-[20px] font-bold leading-none">{d.dom}</span>
                  <span className={`size-1.5 rounded-full ${n ? (on ? "bg-white" : "bg-tint") : "bg-transparent"}`} />
                </button>
              );
            })}
          </div>
          {!items.length && (
            <div className="card grid place-items-center gap-2 p-12 text-center">
              <span className="title-chunky text-[32px]">All quiet</span>
              <span className="text-[15px] text-muted">No vault events on this day.</span>
            </div>
          )}
          {groups.map((g) => (
            <Group key={g.title} title={g.title}>
              <div className="card py-1">
                {g.rows.map((a, i) => (
                  <ActivityRow key={i} h={a} etf={a.etf} />
                ))}
              </div>
            </Group>
          ))}
        </main>

        <aside>
          <Group title="Summary">
            <div className="card py-1">
              {counts.map(({ t, n }) => (
                <button key={t} onClick={() => setFilter(t)} className="group flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-fill/60">
                  <PastelIcon icon={EVENT[t].icon} tone={TONE[t]} size={30} />
                  <span className="flex flex-1 items-center border-b border-line-soft py-1.5 text-[15px] group-last:border-0">
                    <span className="flex-1">{LABEL[t]}</span>
                    <span className="text-muted">{n}</span>
                  </span>
                </button>
              ))}
            </div>
          </Group>
        </aside>
      </div>
    </>
  );
}
