"use client";

import { useState } from "react";
import { Artwork } from "@/components/etf-card";
import { Sym } from "@/components/icons";
import { useTx } from "@/components/tx-sheet";
import { NearAmount } from "@/components/ui";
import { ErrorState, Skeleton } from "@/components/load-state";
import { toNear, useApi, type Orderbook } from "@/lib/api";
import type { Etf } from "@/lib/mock";
import { useAccount } from "@/providers/near-provider";

// One NFT per vault, so the ask side is the single listing (if any) and the bids are the open offers,
// grouped into price levels of `tick` NEAR.
function bookFor(ob: Orderbook, tick: number) {
  const offers = ob.bids.map((o) => ({ from: o.buyerId, priceNear: toNear(o.amount) }));
  const level = (v: number) => Math.round(Math.floor(v / tick) * tick * 1000) / 1000;
  const bids = Object.values(
    offers.reduce<Record<number, { price: number; qty: number }>>((m, o) => {
      const p = level(o.priceNear);
      (m[p] ??= { price: p, qty: 0 }).qty += 1;
      return m;
    }, {}),
  ).sort((a, b) => b.price - a.price);
  const asks = ob.ask ? [{ price: toNear(ob.ask.price), qty: 1 }] : [];
  return { asks, bids, floor: asks[0]?.price ?? 0, offers, lastSale: ob.sales[0] ? toNear(ob.sales[0].price) : null };
}

const TICKS = [0.1, 0.5, 1, 5] as const;

/** Order book for this basket: asks above the floor band, bids below, trade ticket on the side. */
export function OrderBook({ etf, header }: { etf: Etf; header?: React.ReactNode }) {
  const open = useTx();
  const [tick, setTick] = useState<(typeof TICKS)[number]>(0.5);
  const [buyQty, setBuyQty] = useState(1);
  const [sellQty, setSellQty] = useState(0);
  const account = useAccount();
  const q = useApi<Orderbook>(`/market/orderbook/${encodeURIComponent(etf.id)}`);

  if (q.error)
    return (
      <section className="card flex flex-col gap-3 p-3">
        {header}
        <ErrorState error={q.error} className="rounded-[20px] bg-fill" />
      </section>
    );
  if (!q.data)
    return (
      <section className="card flex flex-col gap-3 p-3">
        {header}
        <Skeleton className="h-14" />
        <Skeleton className="h-[260px]" />
      </section>
    );

  const { asks, bids, floor, offers, lastSale } = bookFor(q.data, tick);
  const bestBid = bids[0]?.price ?? 0;
  const max = Math.max(1, ...asks.map((a) => a.qty), ...bids.map((b) => b.qty));
  const mine = etf.owner === account;

  const accept = () => offers[0] && open({ kind: "accept", etfId: etf.id, tokenId: etf.id, offer: { from: offers[0].from, priceNear: offers[0].priceNear } });
  const trade = () => (sellQty > 0 && mine ? accept() : buyQty > 0 ? open({ kind: etf.listed ? "buy" : "offer", etfId: etf.id, tokenId: etf.id }) : open({ kind: "offer", etfId: etf.id, tokenId: etf.id }));

  return (
    <section className="card flex flex-col gap-3 p-3">
      {header}
      <header className="flex items-center gap-3 rounded-[20px] bg-fill p-2 pr-4">
        <Artwork etf={etf} size={40} />
        <span className="flex min-w-0 flex-1 items-center gap-2 text-[14px]">
          {offers[0] ? (
            <>
              <NearAmount amount={offers[0].priceNear} className="font-semibold" />
              <span className="truncate text-muted">Top bid · {offers[0].from}</span>
            </>
          ) : (
            <span className="truncate text-muted">No bids yet</span>
          )}
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
              <Level key={`a${a.price}`} etf={etf} price={a.price} qty={a.qty} max={max} side="ask" onClick={() => open({ kind: etf.listed ? "buy" : "offer", etfId: etf.id, tokenId: etf.id })} />
            ))}
          </ol>
          <div className="flex items-center justify-between bg-fill px-3 py-2.5 text-[13px]">
            <span>
              <span className="block text-muted">{asks.length ? "Ask" : "Not listed"}</span>
              {asks.length ? <NearAmount amount={floor} className="font-semibold" /> : <span className="text-muted">—</span>}
            </span>
            <span className="text-right">
              <span className="block text-muted">Last sale</span>
              {lastSale !== null ? <NearAmount amount={lastSale} className="justify-end font-semibold" /> : <span className="text-muted">—</span>}
            </span>
          </div>
          <ol className="flex flex-col">
            {bids.map((b) => (
              <Level key={`b${b.price}`} etf={etf} price={b.price} qty={b.qty} max={max} side="bid" onClick={mine ? accept : () => open({ kind: "offer", etfId: etf.id, tokenId: etf.id })} />
            ))}
          </ol>
        </div>

        {/* ticket */}
        <div className="flex flex-col gap-2 rounded-[20px] bg-fill/50 p-2">
          <Qty label="Buy" value={buyQty} onChange={setBuyQty} max={1} />
          <div className="flex flex-1 flex-col justify-end px-2 pb-1 text-right">
            <span className="text-[12px] text-muted">{asks.length ? "at ask" : "no ask"}</span>
            <NearAmount amount={buyQty * floor} className="title-chunky justify-end text-[30px]" />
          </div>
          <div className="grid h-10 place-items-center rounded-[12px] bg-fill text-[13px] font-semibold text-muted">
            Spread <NearAmount amount={Math.round(Math.max(0, floor - bestBid) * 1000) / 1000} className="ml-1 inline-flex text-text" />
          </div>
          <div className="flex flex-1 flex-col px-2 pt-1 text-right">
            <NearAmount amount={sellQty * bestBid} className="title-chunky justify-end text-[30px]" />
            <span className="text-[12px] text-muted">{mine ? (bids.length ? "at best bid" : "no bids") : "you own none"}</span>
          </div>
          <Qty label="Sell" value={sellQty} onChange={setSellQty} max={mine && bids.length ? 1 : 0} />
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
