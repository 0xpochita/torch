"use client";

import { useState } from "react";
import { ActivityRow, EVENT, Group } from "@/components/etf-card";
import { SymTile } from "@/components/icons";
import { ToolbarChip, Topbar } from "@/components/navbar";
import { ALL_ACTIVITY, type HistoryEvent } from "@/lib/mock";

const FILTERS = ["All", "rebalance", "deposit", "withdraw", "transfer", "mint"] as const;
const LABEL: Record<(typeof FILTERS)[number], string> = { All: "All", rebalance: "Rebalances", deposit: "Deposits", withdraw: "Withdrawals", transfer: "Sales", mint: "Mints" };

const TODAY = "2026-11-05";
const YESTERDAY = "2026-11-04";
const section = (at: string) => (at === TODAY ? "Today" : at === YESTERDAY ? "Yesterday" : at >= "2026-10-29" ? "This Week" : "Earlier");

export function Activity() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const items = ALL_ACTIVITY.filter((a) => filter === "All" || a.type === filter);

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
          <ToolbarChip key={f} active={filter === f} onClick={() => setFilter(f)} count={f === "All" ? ALL_ACTIVITY.length : ALL_ACTIVITY.filter((a) => a.type === f).length}>
            {LABEL[f]}
          </ToolbarChip>
        ))}
      </Topbar>

      <div className="grid gap-6 pt-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <main className="flex min-w-0 flex-col gap-6">
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
                  <SymTile name={EVENT[t].icon} size={30} />
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
