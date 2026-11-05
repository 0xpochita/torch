"use client";

import { useState } from "react";
import { BasketGraph } from "@/components/basket-graph";
import { AllocationBar, Change } from "@/components/etf-card";
import { NavChart } from "@/components/nav-chart";
import { Money, Segmented, TokenIcon } from "@/components/ui";
import { TOKENS, type Etf } from "@/lib/mock";

const TABS = ["Basket", "Holdings", "History", "Holders"] as const;
const PERIODS = ["7D", "14D", "30D"] as const;

const EVENT = {
  mint: { label: "Minted", glyph: "✦", bg: "#e4e0ff" },
  deposit: { label: "Deposit", glyph: "↓", bg: "#d8f3e4" },
  rebalance: { label: "Rebalance", glyph: "⇄", bg: "#dcecff" },
  withdraw: { label: "Withdraw", glyph: "↑", bg: "#ffe0e3" },
  transfer: { label: "Sale", glyph: "◈", bg: "#ffe7d1" },
};

// Deterministic per-token drift and 24h move so SSR and client agree.
const jitter = (s: string, span: number) => ((s.split("").reduce((a, c) => a * 31 + c.charCodeAt(0), 7) % 1000) / 1000 - 0.5) * span;

export function DetailTabs({ etf }: { etf: Etf }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Basket");

  const drifted = etf.allocation.map((a) => Math.max(0, a.weight + jitter(etf.id + a.token, 4)));
  const driftSum = drifted.reduce((s, w) => s + w, 0);
  const holdings = etf.allocation.map((a, i) => {
    const t = TOKENS[a.token];
    const actual = (drifted[i] / driftSum) * 100; // actual weights always sum to 100% of NAV
    const value = (etf.navUsd * actual) / 100;
    return { ...a, t, actual, value, amount: value / t.price, change: jitter(a.token, 12) };
  });

  const holders = [
    ...new Map(
      etf.history.filter((h) => h.type === "mint" || h.type === "transfer").map((h) => [h.account, { account: h.account, since: h.at }]),
    ).values(),
  ].reverse();

  return (
    <section className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented options={TABS} value={tab} onChange={setTab} />
        <span className="text-xs text-muted">Data refreshes every block · mock</span>
      </div>

      {tab === "Basket" && (
        <div className="flex flex-col gap-4">
          <BasketGraph etf={etf} />
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { k: "Access keys on vault", v: "None", ok: true, d: "Only the collection contract can move funds" },
              { k: "Withdrawals while listed", v: etf.listed ? "Locked" : "Open", ok: true, d: "Seller can't drain the basket mid-sale" },
              { k: "Vault code", v: "Immutable", ok: true, d: "Global contract deployed by hash" },
            ].map((s) => (
              <div key={s.k} className="flex flex-col gap-1 rounded-2xl border border-line p-4">
                <span className="flex items-center gap-2 text-xs text-muted">
                  <span className="grid size-4 place-items-center rounded-full bg-up/15 text-[9px] text-up">✓</span>
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
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-panel text-left text-xs text-muted">
              <tr>
                {["Token", "Target", "Actual", "Amount", "Price", "Value", "24h"].map((h, i) => (
                  <th key={h} className={`px-4 py-3 font-medium ${i ? "text-right" : ""}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {holdings.map((h) => (
                <tr key={h.token} className="border-t border-line-soft">
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-3">
                      <TokenIcon token={h.token} size={30} />
                      <span>
                        <span className="block font-medium">{h.t.symbol}</span>
                        <span className="text-xs text-muted">{h.t.name}</span>
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
                  <td className="px-4 py-3 text-right tabular-nums">${h.t.price < 1 ? h.t.price.toPrecision(3) : h.t.price.toLocaleString("en-US")}</td>
                  <td className="px-4 py-3 text-right font-medium">
                    <Money value={h.value} />
                  </td>
                  <td className="px-4 py-3 text-right text-xs">
                    <Change value={h.change} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between border-t border-line px-4 py-3 text-xs text-muted">
            <span>Drift above 1.5% is corrected at the next {etf.rebalance.toLowerCase()} rebalance.</span>
            <span className="font-medium text-text">
              Total <Money value={holdings.reduce((s, h) => s + h.value, 0)} />
            </span>
          </div>
        </div>
      )}

      {tab === "History" && (
        <ol id="history" className="flex flex-col rounded-2xl border border-line">
          {[...etf.history].reverse().map((h, i) => (
            <li key={i} className="flex items-center gap-4 border-b border-line-soft px-4 py-3 last:border-0">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl text-base" style={{ background: EVENT[h.type].bg }}>
                {EVENT[h.type].glyph}
              </span>
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
        <ol className="flex flex-col rounded-2xl border border-line">
          {holders.map((h, i) => (
            <li key={h.account} className="flex items-center gap-4 border-b border-line-soft px-4 py-3 last:border-0">
              <span className="grid size-10 place-items-center rounded-full bg-panel text-sm font-semibold uppercase">{h.account[0]}</span>
              <span className="flex-1">
                <span className="block text-sm font-medium">{h.account}</span>
                <span className="text-xs text-muted">since {h.since}</span>
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${i === 0 ? "bg-ink text-white" : "bg-panel text-muted"}`}>
                {i === 0 ? "Current owner" : "Previous"}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function NavPanel({ etf }: { etf: Etf }) {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>("30D");
  const values = etf.nav30d.slice(-Number(period.replace("D", "")));
  const delta = ((values[values.length - 1] - values[0]) / values[0]) * 100;

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-line p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-xs text-muted">Net asset value</div>
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
        {etf.allocation.map((a) => (
          <span key={a.token} className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: TOKENS[a.token].color }} />
            {TOKENS[a.token].symbol} {a.weight}%
          </span>
        ))}
      </div>
    </div>
  );
}
