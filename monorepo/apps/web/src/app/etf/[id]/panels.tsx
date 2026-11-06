"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { BasketGraph } from "@/components/basket-graph";
import { AllocationBar, Artwork, Change, EVENT } from "@/components/etf-card";
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

// ponytail: synthetic depth around the vault's ask and its open offers; replace with the indexer's order book
function bookFor(etf: Etf, tick: number) {
  const offers = offersFor(etf);
  const floor = etf.listed ? etf.priceNear : Math.round((etf.navUsd / NEAR_USD) * 1.05);
  const n = Number(etf.id);
  const round = (v: number, up: boolean) => (up ? Math.ceil(v / tick) : Math.floor(v / tick)) * tick;
  const group = (rows: { price: number; qty: number }[], up: boolean) =>
    Object.values(
      rows.reduce<Record<number, { price: number; qty: number }>>((m, r) => {
        const p = round(r.price, up);
        (m[p] ??= { price: p, qty: 0 }).qty += r.qty;
        return m;
      }, {}),
    );
  const asks = group(
    Array.from({ length: 9 }, (_, i) => ({ price: floor * (1 + i * 0.035), qty: 1 + ((n * 7 + i * 5) % 17) })),
    true,
  ).sort((a, b) => b.price - a.price);
  const bids = group(
    offers.map((o, i) => ({ price: o.priceNear, qty: 1 + ((n + i * 3) % 9) })),
    false,
  ).sort((a, b) => b.price - a.price);
  return { asks, bids, floor: asks[asks.length - 1].price, offers };
}

const TICKS = [1, 5, 10, 25] as const;

/** Order book for this basket: asks above the floor band, bids below, trade ticket on the side. */
export function OffersPanel({ etf }: { etf: Etf }) {
  const open = useTx();
  const [tick, setTick] = useState<(typeof TICKS)[number]>(5);
  const [buyQty, setBuyQty] = useState(1);
  const [sellQty, setSellQty] = useState(0);
  const { asks, bids, floor, offers } = bookFor(etf, tick);
  const bestBid = bids[0]?.price ?? 0;
  const max = Math.max(...asks.map((a) => a.qty), ...bids.map((b) => b.qty));
  const mine = etf.owner === ME;
  const change = etf.change24h;

  const accept = () => open({ kind: "accept", etfId: etf.id, offer: { from: offers[0].from, priceNear: offers[0].priceNear } });
  const trade = () => (sellQty > 0 && mine ? accept() : buyQty > 0 ? open({ kind: etf.listed ? "buy" : "offer", etfId: etf.id }) : open({ kind: "offer", etfId: etf.id }));

  return (
    <section className="card flex flex-col gap-3 p-3">
      <header className="flex items-center gap-3 rounded-[20px] bg-fill p-2 pr-4">
        <Artwork etf={etf} size={40} />
        <span className="flex min-w-0 flex-1 items-center gap-2 text-[14px]">
          <NearAmount amount={offers[0].priceNear} className="font-semibold" />
          <span className="truncate text-muted">Top bid · {offers[0].from}</span>
        </span>
        <span className="text-[12px] font-semibold uppercase tracking-wide text-muted">
          Depth <span className="text-text">{asks.reduce((s, a) => s + a.qty, 0) + bids.reduce((s, b) => s + b.qty, 0)}</span>
        </span>
      </header>

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
        {/* book */}
        <div className="flex flex-col overflow-hidden rounded-[20px] bg-fill/50">
          <ol className="flex flex-col">
            {asks.map((a) => (
              <Level key={`a${a.price}`} etf={etf} price={a.price} qty={a.qty} max={max} side="ask" onClick={() => open({ kind: etf.listed ? "buy" : "offer", etfId: etf.id })} />
            ))}
          </ol>
          <div className="flex items-center justify-between bg-fill px-3 py-2.5 text-[13px]">
            <span>
              <span className="block text-muted">Floor price</span>
              <NearAmount amount={floor} className="font-semibold" />
            </span>
            <span className="text-right">
              <span className="block text-muted">24h change</span>
              <span className={change >= 0 ? "text-up" : "text-down"}>
                ({change >= 0 ? "+" : "−"}
                {Math.abs(change).toFixed(2)}%)
              </span>
            </span>
          </div>
          <ol className="flex flex-col">
            {bids.map((b) => (
              <Level key={`b${b.price}`} etf={etf} price={b.price} qty={b.qty} max={max} side="bid" onClick={mine ? accept : () => open({ kind: "offer", etfId: etf.id })} />
            ))}
          </ol>
        </div>

        {/* ticket */}
        <div className="flex flex-col gap-2 rounded-[20px] bg-fill/50 p-2">
          <Qty label="Buy" value={buyQty} onChange={setBuyQty} />
          <div className="flex flex-1 flex-col justify-end px-2 pb-1 text-right">
            <span className="text-[12px] text-muted">at floor</span>
            <NearAmount amount={buyQty * floor} className="title-chunky justify-end text-[30px]" />
          </div>
          <div className="grid h-10 place-items-center rounded-[12px] bg-fill text-[13px] font-semibold text-muted">
            Spread <NearAmount amount={Math.max(0, floor - bestBid)} className="ml-1 inline-flex text-text" />
          </div>
          <div className="flex flex-1 flex-col px-2 pt-1 text-right">
            <NearAmount amount={sellQty * bestBid} className="title-chunky justify-end text-[30px]" />
            <span className="text-[12px] text-muted">{mine ? "at best bid" : "you own none"}</span>
          </div>
          <Qty label="Sell" value={sellQty} onChange={setSellQty} max={mine ? 1 : 0} />
        </div>
      </div>

      <footer className="flex items-center gap-2">
        <button
          onClick={() => setTick(TICKS[(TICKS.indexOf(tick) + 1) % TICKS.length])}
          title="Group price levels"
          className="flex h-12 items-center gap-1.5 rounded-[16px] bg-fill px-4 text-[15px] font-semibold hover:bg-line"
        >
          <NearAmount amount={tick} />
        </button>
        <span className="hidden flex-1 text-[12px] text-muted sm:block">Tap a red row to buy at that price, a green row to {mine ? "accept the bid" : "bid alongside"}.</span>
        <button onClick={trade} className="btn-tint ml-auto flex h-12 items-center gap-2 px-6 text-[15px]">
          <Sym name="swap" size={18} weight="bold" /> New trade
        </button>
      </footer>
    </section>
  );
}

function Level({ etf, price, qty, max, side, onClick }: { etf: Etf; price: number; qty: number; max: number; side: "ask" | "bid"; onClick: () => void }) {
  const ask = side === "ask";
  return (
    <li>
      <button onClick={onClick} className="group relative flex w-full items-center gap-2.5 px-2 py-1.5 text-left transition hover:bg-fill">
        <span className={`absolute inset-y-0.5 right-0 rounded-l-[6px] ${ask ? "bg-down/15" : "bg-up/15"}`} style={{ width: `${Math.max(6, (qty / max) * 45)}%` }} />
        <Artwork etf={etf} size={30} />
        <NearAmount amount={price} className={`relative text-[15px] font-semibold ${ask ? "text-down" : "text-up"}`} />
        <span className="relative ml-auto pr-2 text-[14px] tabular-nums text-muted group-hover:text-text">{qty}</span>
      </button>
    </li>
  );
}

function Qty({ label, value, onChange, max = 99 }: { label: string; value: number; onChange: (v: number) => void; max?: number }) {
  return (
    <div className="flex h-12 items-center gap-2 rounded-[14px] bg-fill pl-4 pr-1.5">
      <span className="flex-1 text-[15px] text-muted">
        {label}: <span className="font-semibold text-text">{value}</span>
      </span>
      {[-1, 1].map((d) => (
        <button
          key={d}
          disabled={value + d < 0 || value + d > max}
          onClick={() => onChange(value + d)}
          aria-label={`${d > 0 ? "More" : "Less"} ${label.toLowerCase()}`}
          className="grid size-9 place-items-center rounded-[10px] bg-surface text-[18px] font-semibold disabled:opacity-30"
        >
          {d > 0 ? "+" : "−"}
        </button>
      ))}
    </div>
  );
}
