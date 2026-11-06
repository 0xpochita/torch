"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useState } from "react";
import { Artwork, EVENT } from "@/components/etf-card";
import { Icon3D, Sym, type Icon3DName } from "@/components/icons";
import { ToolbarChip, Topbar } from "@/components/navbar";
import { Avatar, NearAmount, PASTEL, Segmented, TokenIcon, Title } from "@/components/ui";
import { EmptyState, ErrorState, Skeleton } from "@/components/load-state";
import { eventUsd, toEvents, toVault, useApi, type ActivityItem, type Stats, type Vault, type VaultEvent, type VaultSummary } from "@/lib/api";
import type { HistoryEvent } from "@/lib/tokens";

type Kind = HistoryEvent["type"];
type Row = VaultEvent & { etf: Vault; time: string; usd: number };

const FILTERS = ["All", "deposit", "withdraw", "transfer", "mint"] as const;
const LABEL: Record<(typeof FILTERS)[number], string> = { All: "All", deposit: "Deposits", withdraw: "Withdrawals", transfer: "Sales", mint: "Mints" };
const STATUS: Record<Kind, string> = { mint: "Minted", deposit: "Deposit", withdraw: "Withdraw", transfer: "Sold" };
const TONE = { mint: "lilac", deposit: "mint", withdraw: "peach", transfer: "pink" } as const;
const PERIODS = ["Today", "7D", "30D", "All"] as const;
const COLS = [
  { key: "account", label: "Account", icon: "person" },
  { key: "vault", label: "Vault", icon: "vault" },
  { key: "type", label: "Event", icon: "pulse" },
  { key: "usd", label: "Amount", icon: "wallet" },
  { key: "at", label: "Date", icon: "calendar" },
] as const satisfies readonly { key: string; label: string; icon: Icon3DName }[];
type SortKey = (typeof COLS)[number]["key"];

const DAY = 86_400_000;
const SINCE_DAYS = { Today: 1, "7D": 7, "30D": 30, All: Infinity } as const;
const time = (ms: number) => new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: n < 1 ? 6 : 2 });

export function Activity() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>("30D");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "at", dir: -1 });
  const [picked, setPicked] = useState<string[]>([]);

  const activityQ = useApi<ActivityItem[]>("/activity?limit=500");
  const vaultsQ = useApi<VaultSummary[]>("/vaults");
  const statsQ = useApi<Stats>("/stats");
  const now = activityQ.at;
  const error = activityQ.error ?? vaultsQ.error ?? statsQ.error;
  const loading = activityQ.loading || vaultsQ.loading || statsQ.loading;
  const byId = new Map((vaultsQ.data ?? []).map((v) => [v.tokenId, toVault(v)]));
  const ROWS: Row[] = toEvents(activityQ.data ?? []).flatMap((e) => {
    const etf = byId.get(e.tokenId);
    return etf ? [{ ...e, etf, time: time(e.ms), usd: eventUsd(e, statsQ.data?.nearUsd ?? 0) }] : [];
  });
  const startOfToday = new Date(now).setHours(0, 0, 0, 0);
  const day = (ms: number) =>
    ms >= startOfToday ? "Today" : ms >= startOfToday - DAY ? "Yesterday" : new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });

  const inPeriod = ROWS.filter((r) => r.ms >= (period === "Today" ? startOfToday : now - SINCE_DAYS[period] * DAY));
  const rows = inPeriod
    .filter((r) => (filter === "All" || r.type === filter) && `${r.account} ${r.etf.name}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => {
      const v = (r: Row) => (sort.key === "vault" ? r.etf.name : sort.key === "usd" ? r.usd : sort.key === "type" ? r.type : sort.key === "account" ? r.account : r.ms);
      return (v(a) > v(b) ? 1 : v(a) < v(b) ? -1 : 0) * sort.dir;
    });
  const all = rows.length > 0 && rows.every((r) => picked.includes(r.key));
  const toggle = (k: string) => setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  const sum = (k: Kind) => inPeriod.filter((r) => r.type === k).reduce((s, r) => s + r.usd, 0);

  const exportCsv = () => {
    const out = ROWS.filter((r) => picked.includes(r.key)).map((r) => [r.at, r.time, r.account, r.etf.name, STATUS[r.type], r.usd.toFixed(2), r.detail].map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","));
    const url = URL.createObjectURL(new Blob([["date,time,account,vault,event,usd,detail", ...out].join("\n")], { type: "text/csv" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "torch-activity.csv" });
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <Topbar>
        {FILTERS.map((f) => (
          <ToolbarChip
            key={f}
            active={filter === f}
            onClick={() => setFilter(f)}
            count={f === "All" ? inPeriod.length : inPeriod.filter((a) => a.type === f).length}
            icon={
              <span className="grid size-6 place-items-center">
                <Icon3D name={f === "All" ? "pulse" : (EVENT[f].icon as Icon3DName)} size={16} />
              </span>
            }
          >
            {LABEL[f]}
          </ToolbarChip>
        ))}
      </Topbar>

      <section className="card mt-5 flex flex-1 flex-col overflow-hidden p-0">
        {/* header: title left, live counters right */}
        <div className="flex flex-wrap items-end justify-between gap-6 px-6 pb-5 pt-6">
          <div>
            <Title size="text-[40px]">Activity</Title>
            <p className="mt-1 text-[14px] text-muted">Every vault event across Torch, from NEP-297 logs</p>
          </div>
          <div className="flex flex-wrap gap-6">
            <Counter icon="down" value={sum("deposit")} label="Deposited" sub={`${inPeriod.filter((r) => r.type === "deposit").length} events`} />
            <Counter icon="up" value={sum("withdraw")} label="Withdrawn" sub={`${inPeriod.filter((r) => r.type === "withdraw").length} events`} />
            <Counter icon="tag" value={sum("transfer")} label="Sold" sub={`${inPeriod.filter((r) => r.type === "transfer").length} sales`} />
          </div>
        </div>

        {/* toolbar */}
        <div className="flex flex-wrap items-center gap-2 border-y border-line-soft px-6 py-3">
          <label className="flex h-9 w-64 items-center gap-2 rounded-full bg-fill px-3 text-muted">
            <Sym name="search" size={15} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search account or vault" className="w-full bg-transparent text-[14px] text-text outline-none placeholder:text-muted" />
          </label>
          <Segmented options={PERIODS} value={period} onChange={setPeriod} />
          <AnimatePresence>
            {picked.length > 0 && (
              <motion.div initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-2">
                <span className="text-[13px] font-semibold">{picked.length} selected</span>
                <button onClick={() => setPicked([])} className="text-[13px] font-semibold text-muted hover:text-text">
                  Clear
                </button>
              </motion.div>
            )}
          </AnimatePresence>
          <button onClick={exportCsv} disabled={!picked.length} className="btn-line ml-auto flex h-9 items-center gap-2 px-4 text-[13px] disabled:opacity-40">
            <Sym name="download" size={15} weight="bold" /> Export CSV
          </button>
        </div>

        {/* table */}
        <div className="flex-1 overflow-x-auto">
          {error ? (
            <ErrorState error={error} />
          ) : loading ? (
            <div className="flex flex-col gap-2 p-6">
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-[52px]" />
              ))}
            </div>
          ) : !ROWS.length ? (
            <EmptyState title="Nothing yet" body="No vault events indexed on testnet yet. Mint a vault to start the feed." />
          ) : (
          <table className="w-full min-w-[860px] text-[14px]">
            <thead>
              <tr className="text-left text-[13px] text-muted">
                <th className="w-12 py-3 pl-6">
                  <Check on={all} onClick={() => setPicked(all ? [] : rows.map((r) => r.key))} label="Select all" />
                </th>
                {COLS.map((c) => (
                  <th key={c.key} className={`px-3 py-3 font-medium ${c.key === "usd" ? "text-right" : ""}`}>
                    <button
                      onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? (-s.dir as 1 | -1) : c.key === "at" || c.key === "usd" ? -1 : 1 }))}
                      className={`inline-flex items-center gap-1.5 hover:text-text ${sort.key === c.key ? "text-text" : ""}`}
                    >
                      <Icon3D name={c.icon} size={16} />
                      {c.label}
                      <Sym name="sort" size={13} className={sort.key === c.key ? "" : "opacity-40"} />
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const on = picked.includes(r.key);
                const t = TONE[r.type];
                return (
                  <tr key={r.key} onClick={() => toggle(r.key)} className={`cursor-pointer border-t border-line-soft transition-colors ${on ? "bg-fill" : "hover:bg-fill/50"}`}>
                    <td className="py-3 pl-6">
                      <Check on={on} onClick={() => toggle(r.key)} label={`Select ${r.etf.name} ${STATUS[r.type]}`} />
                    </td>
                    <td className="px-3 py-3">
                      <span className="flex items-center gap-3">
                        <Avatar account={r.account} size={34} />
                        <span>
                          <span className="block font-semibold">{r.account}</span>
                          <span className="flex items-center gap-1 text-[12px] text-muted">
                            <Sym name="clock" size={12} /> {day(r.ms)} at {r.time}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <Link href={`/etf/${r.etf.id}`} onClick={(e) => e.stopPropagation()} className="flex items-center gap-2.5 hover:underline">
                        <Artwork etf={r.etf} size={30} className="rounded-full" />
                        <span>
                          <span className="block font-medium">{r.etf.name}</span>
                          <span className="block font-mono text-[11px] text-muted">#{r.etf.id}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold ${PASTEL[t].bg} ${PASTEL[t].ink}`}>
                        <Icon3D name={EVENT[r.type].icon as Icon3DName} size={14} /> {STATUS[r.type]}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums">
                      {r.type === "transfer" ? (
                        <NearAmount amount={r.near ?? 0} className="justify-end" />
                      ) : r.type === "mint" ? (
                        <span className="text-muted">—</span>
                      ) : (
                        <span className={`inline-flex items-center gap-1.5 ${r.type === "withdraw" ? "text-down" : "text-up"}`} title={`$${r.usd.toFixed(2)}`}>
                          {r.type === "withdraw" ? "−" : "+"}
                          {fmt(r.units ?? 0)} {r.token && <TokenIcon token={r.token} size={16} />}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 pr-6 text-muted">{r.at.slice(5).replace("-", "/")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          )}
          {!error && !loading && !!ROWS.length && !rows.length && (
            <div className="grid place-items-center gap-2 py-20 text-center">
              <span className="title-chunky text-[28px]">All quiet</span>
              <span className="text-[15px] text-muted">No vault events match.</span>
            </div>
          )}
        </div>
      </section>
    </>
  );
}

function Counter({ icon, value, label, sub }: { icon: Icon3DName; value: number; label: string; sub: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-10 place-items-center rounded-full bg-fill">
        <Icon3D name={icon} size={24} />
      </span>
      <span>
        <span className="block text-[20px] font-bold tabular-nums">${Math.round(value).toLocaleString("en-US")}</span>
        <span className="text-[12px] text-muted">
          {label} · <span className="text-text">{sub}</span>
        </span>
      </span>
    </div>
  );
}

function Check({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      role="checkbox"
      aria-checked={on}
      aria-label={label}
      onClick={(e) => (e.stopPropagation(), onClick())}
      className={`grid size-[18px] place-items-center rounded-[5px] border-2 transition ${on ? "border-tint bg-tint text-white" : "border-line hover:border-muted"}`}
    >
      {on && <Sym name="check" size={11} weight="bold" />}
    </button>
  );
}
