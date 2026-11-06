"use client";

import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Artwork, Group, tint } from "@/components/etf-card";
import { Sym } from "@/components/icons";
import { ToolbarChip, Topbar } from "@/components/navbar";
import ElasticSlider from "@/components/react-bits/ElasticSlider";
import GlideSelect from "@/components/react-bits/GlideSelect";
import HoldButton from "@/components/react-bits/HoldButton";
import PulseHeart from "@/components/react-bits/PulseHeart";
import SquishSwitch from "@/components/react-bits/SquishSwitch";
import { Avatar, CountUpNumber, Money, NearAmount, Segmented, StatTile, TokenStack } from "@/components/ui";
import { CATEGORIES, ETFS, LISTINGS, NEAR_USD, type Category, type Listing } from "@/lib/mock";

const STATUS = ["All", "buy", "offer", "new"] as const;
const STATUS_LABEL: Record<(typeof STATUS)[number], string> = { All: "All", buy: "Buy now", offer: "Has offers", new: "New" };
const STATUS_ICON = { All: "store", buy: "tag", offer: "swap", new: "sparkle" } as const;
const SORTS = { low: "Price: low to high", high: "Price: high to low", value: "Best vs value", liked: "Most liked", recent: "Recently listed" } as const;
type Sort = keyof typeof SORTS;
const LAYOUTS = ["Grid", "List"] as const;
const REBALANCE = ["Daily", "Weekly", "Monthly"] as const;

/** Price relative to what the basket inside is worth: negative = buying below value. */
const vsValue = (l: Listing) => ((l.priceNear * NEAR_USD) / l.navUsd - 1) * 100;
const TEMPLATE = Object.fromEntries(CATEGORIES.map((c) => [c, ETFS.find((e) => e.category === c)!])) as Record<Category, (typeof ETFS)[number]>;
const MAX_PRICE = Math.max(...LISTINGS.map((l) => l.priceNear));
const BUCKETS = 14;
const HIST = Array.from({ length: BUCKETS }, (_, b) => LISTINGS.filter((l) => Math.min(BUCKETS - 1, Math.floor((l.priceNear / MAX_PRICE) * BUCKETS)) === b).length);

export function Market() {
  const [status, setStatus] = useState<(typeof STATUS)[number]>("All");
  const [cats, setCats] = useState<Category[]>([]);
  const [rebalance, setRebalance] = useState<string[]>([]);
  const [maxPrice, setMaxPrice] = useState(MAX_PRICE);
  const [underValue, setUnderValue] = useState(false);
  const [sort, setSort] = useState<Sort>("low");
  const [layout, setLayout] = useState<(typeof LAYOUTS)[number]>("Grid");

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const reset = () => (setCats([]), setRebalance([]), setMaxPrice(MAX_PRICE), setUnderValue(false), setStatus("All"));

  const items = LISTINGS.filter(
    (l) =>
      (status === "All" || (status === "new" ? l.listedDaysAgo <= 3 : l.status === status)) &&
      (!cats.length || cats.includes(l.etf.category)) &&
      (!rebalance.length || rebalance.includes(l.etf.rebalance)) &&
      l.priceNear <= maxPrice &&
      (!underValue || vsValue(l) < 0),
  ).sort((a, b) =>
    sort === "low" ? a.priceNear - b.priceNear : sort === "high" ? b.priceNear - a.priceNear : sort === "value" ? vsValue(a) - vsValue(b) : sort === "liked" ? b.likes - a.likes : a.listedDaysAgo - b.listedDaysAgo,
  );

  const floor = Math.min(...LISTINGS.map((l) => l.priceNear));
  const under = LISTINGS.filter((l) => vsValue(l) < 0).length;

  return (
    <>
      <Topbar title="Marketplace" subtitle="Buy whole baskets. The vault and every token inside move with the NFT.">
        {STATUS.map((s) => (
          <ToolbarChip
            key={s}
            active={status === s}
            onClick={() => setStatus(s)}
            count={s === "All" ? LISTINGS.length : LISTINGS.filter((l) => (s === "new" ? l.listedDaysAgo <= 3 : l.status === s)).length}
            icon={<Sym name={STATUS_ICON[s]} size={15} weight="bold" />}
          >
            {STATUS_LABEL[s]}
          </ToolbarChip>
        ))}
      </Topbar>

      <div className="grid grid-cols-2 gap-2.5 pt-5 lg:grid-cols-4">
        <StatTile icon="store" label="Listings" value={<CountUpNumber value={LISTINGS.length} />} />
        <StatTile icon="tag" label="Floor" value={<NearAmount amount={floor} />} />
        <StatTile icon="pulse" label="Below vault value" value={`${under} of ${LISTINGS.length}`} />
        <StatTile icon="person" label="Sellers" value={new Set(LISTINGS.map((l) => l.seller)).size} />
      </div>

      <div className="grid gap-6 pt-6 lg:grid-cols-[270px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <div className="card flex flex-col gap-5 p-5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-[17px] font-bold">
                <Sym name="funnel" size={18} weight="bold" /> Filters
              </span>
              <button onClick={reset} className="text-[13px] font-semibold text-tint">
                Reset
              </button>
            </div>

            <FilterGroup title="Category">
              {CATEGORIES.map((c) => {
                const on = cats.includes(c);
                return (
                  <button key={c} onClick={() => setCats((x) => toggle(x, c))} className="flex items-center gap-2.5 rounded-[12px] px-1 py-1.5 text-left text-[14px] hover:bg-fill">
                    <span className={`grid size-5 place-items-center rounded-[6px] border-2 transition ${on ? "border-text bg-text text-surface" : "border-line"}`}>{on && <Sym name="check" size={12} weight="bold" />}</span>
                    <TokenStack allocation={TEMPLATE[c].allocation.slice(0, 2)} size={18} />
                    <span className="flex-1 truncate font-medium">{c}</span>
                    <span className="text-[12px] text-muted">{LISTINGS.filter((l) => l.etf.category === c).length}</span>
                  </button>
                );
              })}
            </FilterGroup>

            <FilterGroup title="Price">
              <div className="flex h-14 items-end gap-[3px]">
                {HIST.map((n, b) => (
                  <span
                    key={b}
                    className={`flex-1 rounded-t-[3px] transition-colors ${(b / BUCKETS) * MAX_PRICE <= maxPrice ? "bg-text" : "bg-fill"}`}
                    style={{ height: `${12 + (n / Math.max(...HIST)) * 88}%` }}
                  />
                ))}
              </div>
              <ElasticSlider
                value={maxPrice}
                maxValue={MAX_PRICE}
                isStepped
                stepSize={10}
                onChange={(v) => setMaxPrice(Math.max(floor, v))}
                valuePosition="none"
                trackColor="var(--fill)"
                rangeColor="var(--text)"
                thumbColor="var(--surface)"
                ariaLabel="Maximum price"
                className="w-full text-text"
              />
              <div className="flex justify-between text-[12px] font-semibold">
                <NearAmount amount={floor} />
                <span className="flex items-center gap-1 text-muted">
                  up to <NearAmount amount={maxPrice} className="text-text" />
                </span>
              </div>
            </FilterGroup>

            <FilterGroup title="Rebalance">
              <div className="flex flex-wrap gap-1.5">
                {REBALANCE.map((r) => (
                  <button
                    key={r}
                    onClick={() => setRebalance((x) => toggle(x, r))}
                    className={`h-8 rounded-full px-3 text-[13px] font-semibold transition ${rebalance.includes(r) ? "bg-text text-surface" : "bg-fill text-text hover:bg-line"}`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </FilterGroup>

            <div className="flex items-center justify-between gap-3 rounded-[16px] bg-fill p-3">
              <span>
                <span className="block text-[14px] font-semibold">Below value only</span>
                <span className="text-[12px] text-muted">Price under the basket inside</span>
              </span>
              <SquishSwitch checked={underValue} onChange={setUnderValue} width={52} height={30} radius={15} trackColor="var(--line)" trackOnColor="var(--tint)" thumbColor="var(--surface)" thumbOnColor="#ffffff" ariaLabel="Below value only" />
            </div>
          </div>
        </aside>

        <main className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2 px-1">
            <span className="flex-1 text-[15px] font-semibold">
              {items.length} {items.length === 1 ? "listing" : "listings"}
            </span>
            <GlideSelect
              options={(Object.keys(SORTS) as Sort[]).map((k) => ({ value: k, label: SORTS[k] }))}
              value={sort}
              onChange={(v) => setSort(v as Sort)}
              size="sm"
              radius={18}
              menuWidth={210}
              align="right"
              accentColor="var(--text)"
              surfaceColor="var(--fill)"
              highlightColor="var(--line)"
              textColor="var(--text)"
              ariaLabel="Sort listings"
              className="text-[13px] font-semibold"
            />
            <Segmented options={LAYOUTS} value={layout} onChange={setLayout} />
          </div>

          {!items.length ? (
            <div className="card grid place-items-center gap-2 p-12 text-center">
              <span className="title-chunky text-[30px]">Nothing matches</span>
              <span className="text-[15px] text-muted">Loosen a filter to see more baskets.</span>
              <button onClick={reset} className="btn-ink mt-2 h-10 px-5 text-[14px]">
                Reset filters
              </button>
            </div>
          ) : layout === "Grid" ? (
            <motion.div layout className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              <AnimatePresence mode="popLayout">
                {items.map((l) => (
                  <motion.div key={l.id} layout initial={{ scale: 0.96 }} animate={{ scale: 1 }} exit={{ scale: 0.92, opacity: 0 }} transition={{ type: "spring", stiffness: 380, damping: 30 }}>
                    <ListingCard l={l} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          ) : (
            <Group>
              <div className="card overflow-hidden py-1">
                {items.map((l) => (
                  <ListingRow key={l.id} l={l} />
                ))}
              </div>
            </Group>
          )}
        </main>
      </div>
    </>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-t border-line-soft pt-4">
      <span className="text-[13px] font-semibold text-muted">{title}</span>
      {children}
    </div>
  );
}

function VsValue({ l }: { l: Listing }) {
  const v = vsValue(l);
  return (
    <span className={`rounded-full px-2 py-0.5 text-[12px] font-semibold ${v < 0 ? "bg-up/15 text-up-text" : "bg-fill text-muted"}`}>
      {v < 0 ? `${Math.abs(v).toFixed(0)}% below value` : `${v.toFixed(0)}% above value`}
    </span>
  );
}

function ListingCard({ l }: { l: Listing }) {
  const href = `/etf/${l.etf.id}`;
  return (
    <article className="card group relative flex flex-col gap-3 p-2.5">
      <Link href={href} className="relative block aspect-[5/4] overflow-hidden rounded-[20px]" style={{ background: tint(l.etf.bg, 30) }}>
        <Image src={l.etf.image} alt={l.name} fill sizes="(min-width: 1536px) 26vw, (min-width: 640px) 38vw, 100vw" className="object-cover transition duration-500 group-hover:scale-105" />
        <span className="absolute left-3 top-3 rounded-full bg-surface/85 px-2.5 py-1 text-[12px] font-semibold backdrop-blur-md">{l.status === "buy" ? "Buy now" : "Open to offers"}</span>
      </Link>
      <span className="absolute right-5 top-5">
        <PulseHeart count={l.likes} size={30} likedColor="#ff2d55" idleColor="var(--muted)" pillColor="var(--surface)" textColor="var(--text)" label={`Like ${l.name}`} />
      </span>
      <div className="flex flex-col gap-3 px-1.5 pb-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link href={href} className="block truncate text-[17px] font-semibold">
              {l.name}
            </Link>
            <span className="flex items-center gap-1.5 text-[13px] text-muted">
              <Avatar account={l.seller} size={18} /> {l.seller}
            </span>
          </div>
          <TokenStack allocation={l.etf.allocation} size={20} />
        </div>
        <div className="grid grid-cols-2 gap-2 rounded-[16px] bg-fill p-3">
          <span>
            <span className="block text-[12px] text-muted">Price</span>
            <NearAmount amount={l.priceNear} className="text-[17px] font-bold" />
          </span>
          <span>
            <span className="block text-[12px] text-muted">Basket inside</span>
            <Money value={l.navUsd} className="text-[17px] font-bold" />
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <VsValue l={l} />
          <span className="text-[12px] text-muted">{l.listedDaysAgo ? `${l.listedDaysAgo}d ago` : "Today"}</span>
        </div>
        <div className="flex gap-2">
          {l.status === "buy" && (
            // ponytail: mock purchase; wire to the collection's nft_buy once the contract is live
            <HoldButton size="sm" radius={20} holdTime={1200} backgroundColor="var(--text)" fillColor="var(--tint)" textColor="var(--surface)" fillTextColor="#ffffff" doneLabel="Bought" resetAfter={2200} className="h-10 flex-1 text-[14px] font-semibold">
              Hold to buy
            </HoldButton>
          )}
          <button className={`${l.status === "buy" ? "btn-line" : "btn-ink flex-1"} h-10 px-4 text-[14px]`}>Make offer</button>
        </div>
      </div>
    </article>
  );
}

function ListingRow({ l }: { l: Listing }) {
  return (
    <Link href={`/etf/${l.etf.id}`} className="flex items-center gap-3 border-t border-line-soft px-3 py-2.5 transition first:border-0 hover:bg-fill/60">
      <Artwork etf={l.etf} size={52} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold">{l.name}</span>
        <span className="flex items-center gap-1.5 text-[13px] text-muted">
          <Avatar account={l.seller} size={16} /> {l.seller}
        </span>
      </span>
      <span className="hidden md:block">
        <VsValue l={l} />
      </span>
      <Money value={l.navUsd} className="hidden w-24 text-right text-[14px] text-muted sm:block" />
      <span className="btn-tint grid h-8 min-w-[84px] place-items-center px-3 text-[14px]">
        <NearAmount amount={l.priceNear} />
      </span>
    </Link>
  );
}
