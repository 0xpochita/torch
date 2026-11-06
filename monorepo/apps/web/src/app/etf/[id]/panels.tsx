"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { BasketGraph } from "@/components/basket-graph";
import { AllocationBar, Change, EVENT } from "@/components/etf-card";
import { SymTile } from "@/components/icons";
import { NavChart } from "@/components/nav-chart";
import { EmptyState, Skeleton } from "@/components/load-state";
import { Avatar, Money, Segmented, TokenIcon, shade } from "@/components/ui";
import { localDate, tokenKey, toUnits, type Balance, type Holder, type NavPoint, type VaultEvent } from "@/lib/api";
import { TOKENS, type Etf } from "@/lib/tokens";

const TABS = ["Basket", "Holdings", "History", "Holders"] as const;
const PERIODS = ["7D", "14D", "30D"] as const;
const DAY = 86_400_000;

export function DetailTabs({ etf, balances, holders: owners, events }: { etf: Etf; balances: Balance[]; holders: Holder[]; events?: VaultEvent[] }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Basket");

  const total = balances.reduce((s, b) => s + b.valueUsd, 0);
  const holdings = balances.map((b) => {
    const token = tokenKey(b.ftId);
    return {
      key: b.ftId,
      token,
      symbol: b.symbol,
      name: token ? TOKENS[token].name : b.ftId,
      weight: etf.allocation.find((a) => a.token === token)?.weight ?? 0,
      actual: total ? (b.valueUsd / total) * 100 : 0,
      value: b.valueUsd,
      price: b.priceUsd,
      amount: toUnits(b.ftId, b.amount),
    };
  });

  // Current owner first.
  const holders = [...owners].reverse().map((h) => ({ account: h.accountId, since: localDate(h.since) }));

  return (
    <section className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented options={TABS} value={tab} onChange={setTab} />
        <span className="text-[13px] text-muted">Live from the indexer</span>
      </div>

      <AnimatePresence mode="wait" initial={false}>
      <motion.div key={tab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
      {tab === "Basket" && (
        <div className="flex flex-col gap-4">
          <BasketGraph etf={etf} />
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { k: "Access keys on vault", icon: "key" as const, v: "None", ok: true, d: "Only the collection contract can move funds" },
              { k: "Withdrawals while listed", icon: "lock" as const, v: etf.listed ? "Locked" : "Open", ok: true, d: "Seller can't drain the basket mid-sale" },
              { k: "Vault code", icon: "shield" as const, v: "Immutable", ok: true, d: "Global contract deployed by hash" },
            ].map((s) => (
              <div key={s.k} className="flex flex-col gap-1 card p-4">
                <span className="flex items-center gap-2 text-xs text-muted">
                  <SymTile name={s.icon} size={22} />
                  {s.k}
                </span>
                <span className="font-semibold">{s.v}</span>
                <span className="text-xs text-muted">{s.d}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "Holdings" && (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-[12px] text-muted">
              <tr>
                {["Token", "Target", "Actual", "Amount", "Price", "Value"].map((h, i) => (
                  <th key={h} className={`px-4 py-3 font-medium ${i ? "text-right" : ""}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {holdings.map((h) => (
                <tr key={h.key} className="border-t border-line-soft">
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-3">
                      {h.token ? <TokenIcon token={h.token} size={30} /> : <span className="size-[30px] rounded-full bg-fill" />}
                      <span>
                        <span className="block font-medium">{h.symbol}</span>
                        <span className="text-xs text-muted">{h.name}</span>
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{h.weight}%</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {h.actual.toFixed(1)}%
                    <span className={`ml-1 text-xs ${Math.abs(h.actual - h.weight) > 1.5 ? "text-down" : "text-muted"}`}>
                      ({h.actual >= h.weight ? "+" : "−"}
                      {Math.abs(h.actual - h.weight).toFixed(1)})
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{h.amount < 1 ? h.amount.toFixed(5) : h.amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}</td>
                  <td className="px-4 py-3 text-right tabular-nums">${h.price < 1 ? h.price.toPrecision(3) : h.price.toLocaleString("en-US")}</td>
                  <td className="px-4 py-3 text-right font-medium">
                    <Money value={h.value} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!holdings.length && <EmptyState title="Empty vault" body="No tokens deposited yet." />}
          <div className="flex items-center justify-between border-t border-line px-4 py-3 text-xs text-muted">
            <span>Live balances read from the vault account.</span>
            <span className="font-medium text-text">
              Total <Money value={holdings.reduce((s, h) => s + h.value, 0)} />
            </span>
          </div>
        </div>
      )}

      {tab === "History" && !events && <Skeleton className="h-[240px] !rounded-[28px]" />}
      {tab === "History" && events?.length === 0 && <EmptyState title="No events yet" body="Mints, deposits, withdrawals and sales show up here." className="card" />}
      {tab === "History" && !!events?.length && (
        <ol id="history" className="card flex flex-col py-1">
          {[...events].reverse().map((h, i) => (
            <li key={i} className="flex items-center gap-4 border-b border-line-soft px-4 py-3 last:border-0">
              <SymTile name={EVENT[h.type].icon} size={36} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{EVENT[h.type].label}</span>
                <span className="block truncate text-xs text-muted">{h.detail}</span>
              </span>
              <span className="hidden font-mono text-xs text-muted sm:inline">{h.account}</span>
              <span className="w-20 text-right text-xs text-muted">{h.at}</span>
            </li>
          ))}
        </ol>
      )}

      {tab === "Holders" && (
        <ol className="card flex flex-col">
          {holders.map((h, i) => (
            <li key={h.account} className="flex items-center gap-4 border-b border-line-soft px-4 py-3 last:border-0">
              <Avatar account={h.account} size={40} />
              <span className="flex-1">
                <span className="block text-sm font-medium">{h.account}</span>
                <span className="text-xs text-muted">since {h.since}</span>
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${i === 0 ? "bg-tint/12 text-tint" : "bg-fill text-muted"}`}>
                {i === 0 ? "Current owner" : "Previous"}
              </span>
            </li>
          ))}
        </ol>
      )}
      </motion.div>
      </AnimatePresence>
    </section>
  );
}

export function NavPanel({ etf, history }: { etf: Etf; history: NavPoint[] }) {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>("30D");
  // Points inside the window, plus the last one before it so the line starts at the window edge.
  const end = history.at(-1)?.at ?? 0;
  const from = end - Number(period.replace("D", "")) * DAY;
  const firstIn = history.findIndex((p) => p.at >= from);
  const values = history.slice(Math.max(0, firstIn - 1)).map((p) => p.navUsd);
  if (values.length < 2) values.unshift(values[0] ?? etf.navUsd);
  // From the first funded point: a fresh vault starts at $0 until its first deposit.
  const base = values.find((v) => v > 0) ?? 0;
  const delta = base ? ((values[values.length - 1] - base) / base) * 100 : 0;

  return (
    <div className="flex flex-col gap-4 card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-xs text-muted">Portfolio value</div>
          <Money value={etf.navUsd} className="text-3xl font-semibold" />
          <div className="mt-1 text-xs">
            <Change value={delta} /> <span className="text-muted">last {period.toLowerCase()}</span>
          </div>
        </div>
        <Segmented options={PERIODS} value={period} onChange={setPeriod} />
      </div>
      <NavChart values={values} />
      <AllocationBar etf={etf} className="h-2" />
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {etf.allocation.map((a, i) => (
          <span key={a.token} className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: shade(i) }} />
            {TOKENS[a.token].symbol} {a.weight}%
          </span>
        ))}
      </div>
    </div>
  );
}
