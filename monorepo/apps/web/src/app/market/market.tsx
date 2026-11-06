"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { BasketArt } from "@/components/basket-art";
import { useState } from "react";
import { Artwork, Group, tint } from "@/components/etf-card";
import ShinyText from "@/components/react-bits/ShinyText";
import { Sym } from "@/components/icons";
import { ToolbarChip, Topbar } from "@/components/navbar";
import { OrderBook } from "@/components/order-book";
import { useTx } from "@/components/tx-sheet";
import ElasticSlider from "@/components/react-bits/ElasticSlider";
import GlideSelect from "@/components/react-bits/GlideSelect";
import PulseHeart from "@/components/react-bits/PulseHeart";
import SquishSwitch from "@/components/react-bits/SquishSwitch";
import { Avatar, CountUpNumber, Money, NearAmount, Segmented, StatTile, TokenStack } from "@/components/ui";
import { EmptyState, ErrorState, Skeleton } from "@/components/load-state";
import { toListing, useApi, type MarketItem, type MarketListing, type Stats } from "@/lib/api";
import { CATEGORIES, type Category } from "@/lib/mock";

type Listing = MarketItem & { vs: number };

// Every listing is buy-now on chain; offers live in the order book.
const STATUS = ["All", "buy", "new"] as const;
const STATUS_LABEL: Record<(typeof STATUS)[number], string> = { All: "All", buy: "Buy now", new: "New" };
const STATUS_ICON = { All: "store", buy: "tag", new: "sparkle" } as const;
const SORTS = { low: "Price: low to high", high: "Price: high to low", value: "Best vs value", recent: "Recently listed" } as const;
type Sort = keyof typeof SORTS;
const LAYOUTS = ["Grid", "List"] as const;
const BUCKETS = 14;

/** Price relative to what the basket inside is worth: negative = buying below value. */
const vsValue = (l: Listing) => l.vs;

export function Market() {
  const listingsQ = useApi<MarketListing[]>("/market/listings");
  const statsQ = useApi<Stats>("/stats");
  const [status, setStatus] = useState<(typeof STATUS)[number]>("All");
  const [cats, setCats] = useState<Category[]>([]);
  const [cap, setCap] = useState<number | null>(null);
  const [underValue, setUnderValue] = useState(false);
  const [sort, setSort] = useState<Sort>("low");
  const [layout, setLayout] = useState<(typeof LAYOUTS)[number]>("Grid");
  const [book, setBook] = useState<"popular" | "best">("popular");

  const nearUsd = statsQ.data?.nearUsd ?? 0;
  const listings: Listing[] = (listingsQ.data ?? []).map((m) => {
    const l = toListing(m, listingsQ.at);
    return { ...l, vs: l.navUsd ? ((l.priceNear * nearUsd) / l.navUsd - 1) * 100 : 0 };
  });
  const MAX_PRICE = Math.max(0, ...listings.map((l) => l.priceNear));
  const maxPrice = cap ?? MAX_PRICE;
  const TEMPLATE = Object.fromEntries(CATEGORIES.map((c) => [c, listings.find((l) => l.etf.category === c)?.etf])) as Record<Category, Listing["etf"] | undefined>;
  // ponytail: no likes indexed yet; "popular" = biggest basket on sale
  const POPULAR = [...listings].sort((a, b) => b.navUsd - a.navUsd)[0];
  const BEST = [...listings].filter((l) => l.id !== POPULAR?.id).sort((a, b) => vsValue(a) - vsValue(b))[0];
  const bookListing = (book === "best" && BEST) || POPULAR;
  const HIST = Array.from({ length: BUCKETS }, (_, b) => listings.filter((l) => Math.min(BUCKETS - 1, Math.floor((l.priceNear / (MAX_PRICE || 1)) * BUCKETS)) === b).length);

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const reset = () => (setCats([]), setCap(null), setUnderValue(false), setStatus("All"));

  const items = listings.filter(
    (l) =>
      (status === "All" || (status === "new" ? l.listedDaysAgo <= 3 : l.status === status)) &&
      (!cats.length || cats.includes(l.etf.category)) &&
      l.priceNear <= maxPrice &&
      (!underValue || vsValue(l) < 0),
  ).sort((a, b) => (sort === "low" ? a.priceNear - b.priceNear : sort === "high" ? b.priceNear - a.priceNear : sort === "value" ? vsValue(a) - vsValue(b) : b.listedAt - a.listedAt));

  const floor = listings.length ? Math.min(...listings.map((l) => l.priceNear)) : 0;
  const under = listings.filter((l) => vsValue(l) < 0).length;
  const error = listingsQ.error ?? statsQ.error;
  const loading = listingsQ.loading || statsQ.loading;

  return (
    <>
      <Topbar title="Marketplace" subtitle="Buy whole baskets. The vault and every token inside move with the NFT.">
        {STATUS.map((s) => (
          <ToolbarChip
            key={s}
            active={status === s}
            onClick={() => setStatus(s)}
            count={s === "All" ? listings.length : listings.filter((l) => (s === "new" ? l.listedDaysAgo <= 3 : l.status === s)).length}
            icon={<Sym name={STATUS_ICON[s]} size={15} weight="bold" />}
          >
            {STATUS_LABEL[s]}
          </ToolbarChip>
        ))}
      </Topbar>

      {error ? (
        <ErrorState error={error} className="card mt-5" />
      ) : loading ? (
        <div className="flex flex-col gap-6 pt-5">
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[84px]" />
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[360px] !rounded-[28px]" />
            ))}
          </div>
        </div>
      ) : !listings.length ? (
        <EmptyState title="Nothing for sale yet" body="No vault is listed on testnet yet. List one from My Vaults to open the market." className="card mt-5">
          <Link href="/vaults" className="btn-ink mt-2 h-10 px-5 text-[14px] leading-10">
            My Vaults
          </Link>
        </EmptyState>
      ) : (
      <>
      <div className="grid grid-cols-2 gap-2.5 pt-5 lg:grid-cols-4">
        <StatTile icon="store" label="Listings" value={<CountUpNumber value={listings.length} />} />
        <StatTile icon="tag" label="Floor" value={<NearAmount amount={floor} />} />
        <StatTile icon="pulse" label="Below vault value" value={`${under} of ${listings.length}`} />
        <StatTile icon="person" label="Sellers" value={new Set(listings.map((l) => l.seller)).size} />
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
                    <TokenStack allocation={TEMPLATE[c]?.allocation.slice(0, 2) ?? []} size={18} />
                    <span className="flex-1 truncate font-medium">{c}</span>
                    <span className="text-[12px] text-muted">{listings.filter((l) => l.etf.category === c).length}</span>
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
                stepSize={Math.max(0.1, Math.round(MAX_PRICE / 5) / 10)}
                onChange={(v) => setCap(Math.max(floor, v))}
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
          <div className="grid gap-3 xl:grid-cols-2">
            <Featured l={POPULAR} label="Most popular" stat={<Money value={POPULAR.navUsd} />} sub="biggest basket" active={bookListing === POPULAR} onSelect={() => setBook("popular")} />
            {BEST && (
              <Featured
                l={BEST}
                label="Best profit"
                stat={`${Math.abs(vsValue(BEST)).toFixed(0)}% ${vsValue(BEST) < 0 ? "off" : "over"}`}
                sub={vsValue(BEST) < 0 ? "below basket value" : "closest to basket value"}
                active={bookListing === BEST}
                onSelect={() => setBook("best")}
              />
            )}
          </div>
          <OrderBook
            etf={bookListing.etf}
            header={
              <div className="flex items-center gap-3 px-1">
                <h2 className="text-[20px] font-bold">Order book</h2>
                <div className="flex gap-1.5">
                  {([["popular", "Most popular", POPULAR], ["best", "Best profit", BEST]] as const).filter(([, , l]) => l).map(([k, label, l]) => (
                    <button
                      key={k}
                      onClick={() => setBook(k)}
                      className={`flex h-9 shrink-0 items-center gap-2 rounded-full pl-1 pr-3 text-[13px] font-semibold transition ${bookListing === l ? "bg-text text-surface" : "bg-fill hover:bg-line"}`}
                    >
                      <Artwork etf={l.etf} size={28} className="rounded-full" />
                      {label} · {l.etf.name}
                    </button>
                  ))}
                </div>
              </div>
            }
          />

          <div className="flex flex-wrap items-center gap-2 px-1 pt-3">
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
      )}
    </>
  );
}

/** Highlighted listing: full-bleed basket art with a glass info panel on top (NFT drop card style). */
function Featured({ l, label, stat, sub, active, onSelect }: { l: Listing; label: string; stat: React.ReactNode; sub: string; active: boolean; onSelect: () => void }) {
  const open = useTx();
  const stop = (fn: () => void) => (e: React.MouseEvent) => (e.stopPropagation(), fn());
  return (
    <article
      onClick={onSelect}
      className={`grain group relative isolate flex min-h-[230px] cursor-pointer overflow-hidden rounded-[28px] p-3 text-[#121212] transition ${active ? "" : "opacity-80 hover:opacity-100"}`}
      style={{ background: l.etf.bg }}
    >
      {/* basket art fills the right side of the card */}
      <span className="absolute inset-y-6 left-[364px] right-4 transition duration-500 group-hover:scale-[1.04] max-sm:hidden">
        <BasketArt allocation={l.etf.allocation} className="!bg-none" />
      </span>

      <div className="relative flex w-full max-w-[340px] flex-col justify-between gap-3 rounded-[22px] bg-white/55 p-4 backdrop-blur-xl">
        <div className="flex items-center justify-between gap-2">
          <ShinyText color="#5c5c66" shineColor="#ff8a00" speed={2.4} className="text-[11px] font-bold uppercase tracking-[0.1em]">
            {label}
          </ShinyText>
          <span className="flex items-center gap-1 rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-semibold">
            <Sym name={l.status === "buy" ? "tag" : "swap"} size={11} weight="bold" />
            {l.status === "buy" ? "Buy now" : "Offers"}
          </span>
        </div>
        <div>
          <Link href={`/etf/${l.etf.id}`} onClick={(e) => e.stopPropagation()} className="title-chunky block truncate text-[24px] leading-tight hover:underline">
            {l.name}
          </Link>
          <span className="flex items-center gap-1.5 text-[12px] text-[#121212]/65">
            <Avatar account={l.seller} size={16} /> {l.seller} · {sub}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 border-t border-[#121212]/10 pt-3">
          <span>
            <span className="block text-[11px] text-[#121212]/60">Price</span>
            <NearAmount amount={l.priceNear} className="text-[17px] font-bold" />
          </span>
          <span>
            <span className="block text-[11px] text-[#121212]/60">{label === "Most popular" ? "Basket inside" : "Vs value"}</span>
            <span className="text-[17px] font-bold">{stat}</span>
          </span>
        </div>
        <div className="flex gap-2">
          {l.status === "buy" && (
            <button onClick={stop(() => open({ kind: "buy", etfId: l.etf.id }))} className="h-10 flex-1 rounded-full bg-[#121212] text-[14px] font-semibold text-white transition active:scale-95">
              Buy now
            </button>
          )}
          <button onClick={stop(() => open({ kind: "offer", etfId: l.etf.id }))} className="h-10 rounded-full bg-white/80 px-4 text-[14px] font-semibold transition hover:bg-white active:scale-95">
            Make offer
          </button>
        </div>
      </div>

      {active && (
        <span className="absolute right-4 top-4 flex items-center gap-1.5 rounded-full bg-[#121212] px-3 py-1.5 text-[12px] font-semibold text-white">
          <Sym name="pulse" size={13} weight="bold" /> In order book
        </span>
      )}
    </article>
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
  const open = useTx();
  return (
    <article className="card group relative flex flex-col gap-3 p-2.5">
      <Link href={href} className="relative block aspect-[5/4] overflow-hidden rounded-[20px]" style={{ background: tint(l.etf.bg, 30) }}>
        <BasketArt allocation={l.etf.allocation} />
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
            <button onClick={() => open({ kind: "buy", etfId: l.etf.id })} className="btn-ink h-10 flex-1 text-[14px]">
              Buy now
            </button>
          )}
          <button onClick={() => open({ kind: "offer", etfId: l.etf.id })} className={`${l.status === "buy" ? "btn-line" : "btn-ink flex-1"} h-10 px-4 text-[14px]`}>
            Make offer
          </button>
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
