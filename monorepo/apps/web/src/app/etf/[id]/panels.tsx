"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { BasketGraph } from "@/components/basket-graph";
import { AllocationBar, Change, EVENT } from "@/components/etf-card";
import { Sym, SymTile } from "@/components/icons";
import { useTx } from "@/components/tx-sheet";
import { NavChart } from "@/components/nav-chart";
import { Avatar, Money, NearAmount, Segmented, TokenIcon, shade } from "@/components/ui";
import { ME, NEAR_USD, TOKENS, offersFor, type Etf } from "@/lib/mock";

const TABS = ["Basket", "Holdings", "History", "Holders"] as const;
const PERIODS = ["7D", "14D", "30D"] as const;


// Deterministic per-token drift and 24h move so SSR and client agree.
const jitter = (s: string, span: number) => ((s.split("").reduce((a, c) => a * 31 + c.charCodeAt(0), 7) % 1000) / 1000 - 0.5) * span;

export function DetailTabs({ etf }: { etf: Etf }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Basket");

  const drifted = etf.allocation.map((a) => Math.max(0, a.weight + jitter(etf.id + a.token, 4)));
  const driftSum = drifted.reduce((s, w) => s + w, 0);
  const holdings = etf.allocation.map((a, i) => {
    const t = TOKENS[a.token];
    const actual = (drifted[i] / driftSum) * 100; // actual weights always sum to 100% of the vault value
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
        <span className="text-[13px] text-muted">Mock data · refreshes every block</span>
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
        <ol id="history" className="card flex flex-col py-1">
          {[...etf.history].reverse().map((h, i) => (
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

export function NavPanel({ etf }: { etf: Etf }) {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>("30D");
  const values = etf.nav30d.slice(-Number(period.replace("D", "")));
  const delta = ((values[values.length - 1] - values[0]) / values[0]) * 100;

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

const expires = (h: number) => (h < 24 ? `${h}h` : `${Math.round(h / 24)}d`);

/** Open offers on this vault, best first. The owner can accept any of them. */
export function OffersPanel({ etf }: { etf: Etf }) {
  const open = useTx();
  const offers = offersFor(etf);
  const top = offers[0];
  const mine = etf.owner === ME;
  const accept = (o: (typeof offers)[number]) => open({ kind: "accept", etfId: etf.id, offer: { from: o.from, priceNear: o.priceNear } });

  return (
    <section className="card flex flex-col gap-4 p-5">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-[20px] font-bold">
          Offers <span className="rounded-full bg-fill px-2 py-0.5 text-[12px] font-semibold text-muted">{offers.length}</span>
        </h2>
        {!mine && (
          <button onClick={() => open({ kind: "offer", etfId: etf.id })} className="btn-line h-9 px-4 text-[14px]">
            Make offer
          </button>
        )}
      </div>

      <div className="grain flex flex-wrap items-center gap-4 rounded-[22px] bg-peach p-4">
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-semibold text-peach-ink">Top offer</div>
          <div className="flex items-baseline gap-2">
            <NearAmount amount={top.priceNear} className="title-chunky text-[34px]" />
            <span className="text-[13px] text-muted">
              ≈ <Money value={top.priceNear * NEAR_USD} />
            </span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[13px] text-muted">
            <Avatar account={top.from} size={18} /> {top.from} · expires in {expires(top.expiresHours)}
          </div>
        </div>
        {mine ? (
          <button onClick={() => accept(top)} className="btn-ink h-11 px-6 text-[15px]">
            Accept
          </button>
        ) : (
          <button onClick={() => open({ kind: "offer", etfId: etf.id })} className="btn-ink h-11 px-6 text-[15px]">
            Outbid
          </button>
        )}
      </div>

      <div className="-mx-2 overflow-x-auto">
        <table className="w-full min-w-[520px] text-[14px]">
          <thead>
            <tr className="text-left text-[12px] font-semibold text-muted">
              <th className="px-2 py-2 font-semibold">Price</th>
              <th className="px-2 py-2 font-semibold">USD</th>
              <th className="px-2 py-2 font-semibold">{etf.listed ? "vs ask" : "vs value"}</th>
              <th className="px-2 py-2 font-semibold">Expires</th>
              <th className="px-2 py-2 font-semibold">From</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {offers.map((o, i) => {
              const ref = etf.listed ? etf.priceNear : etf.navUsd / NEAR_USD;
              const diff = (o.priceNear / ref - 1) * 100;
              return (
                <tr key={o.id} className="border-t border-line-soft">
                  <td className="px-2 py-2.5 font-semibold">
                    <span className="flex items-center gap-2">
                      <NearAmount amount={o.priceNear} />
                      {i === 0 && <span className="rounded-full bg-tint/15 px-1.5 py-0.5 text-[10px] font-bold text-tint">TOP</span>}
                    </span>
                  </td>
                  <td className="px-2 py-2.5 text-muted">
                    <Money value={o.priceNear * NEAR_USD} />
                  </td>
                  <td className={`px-2 py-2.5 ${diff >= 0 ? "text-up" : "text-muted"}`}>{diff >= 0 ? `${diff.toFixed(0)}% above` : `${Math.abs(diff).toFixed(0)}% below`}</td>
                  <td className="px-2 py-2.5 text-muted">
                    <span className="flex items-center gap-1">
                      <Sym name="clock" size={13} /> {expires(o.expiresHours)}
                    </span>
                  </td>
                  <td className="px-2 py-2.5">
                    <span className="flex items-center gap-1.5 font-medium">
                      <Avatar account={o.from} size={20} /> {o.from}
                    </span>
                  </td>
                  <td className="px-2 py-2.5 text-right">
                    {mine && (
                      <button onClick={() => accept(o)} className="btn-tint h-8 px-3 text-[13px]">
                        Accept
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
