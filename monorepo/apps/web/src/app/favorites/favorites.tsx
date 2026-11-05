"use client";

import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { BuyCapsule, Change, EtfRow, Group, tint } from "@/components/etf-card";
import { Sym, SymTile } from "@/components/icons";
import GlareHover from "@/components/react-bits/GlareHover";
import { Topbar } from "@/components/navbar";
import {
  Avatar,
  Money,
  NearAmount,
  Segmented,
  StatTile,
  TokenStack,
} from "@/components/ui";
import { ETFS, MY_FAVORITES, type Etf } from "@/lib/mock";

const LAYOUTS = ["Grid", "List"] as const;
const spring = { type: "spring", stiffness: 380, damping: 30 } as const;

export function Favorites() {
  // ponytail: in-memory favorites; persist per wallet once accounts exist
  const [ids, setIds] = useState<string[]>(MY_FAVORITES);
  const [layout, setLayout] = useState<(typeof LAYOUTS)[number]>("Grid");
  const favs = ETFS.filter((e) => ids.includes(e.id));
  const suggestions = ETFS.filter((e) => !ids.includes(e.id));
  const remove = (id: string) => setIds((x) => x.filter((i) => i !== id));
  const add = (id: string) => setIds((x) => [...x, id]);

  const best = [...favs].sort((a, b) => b.change24h - a.change24h)[0];
  const listed = favs.filter((e) => e.listed);
  const floor = listed.length ? Math.min(...listed.map((e) => e.priceNear)) : 0;

  return (
    <>
      <Topbar
        title="Favorites"
        subtitle={`${favs.length} saved ${favs.length === 1 ? "ETF" : "ETFs"}`}
      />

      <div className="flex flex-col gap-7 pt-5">
        {favs.length > 0 && (
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            <StatTile
              icon="vault"
              label="Saved value"
              value={
                <Money value={favs.reduce((s, e) => s + e.navUsd, 0)} count />
              }
            />
            <StatTile
              icon="pulse"
              label="Best 24h"
              value={
                best && (
                  <span className="flex items-baseline gap-2">
                    <Change value={best.change24h} />
                    <span className="truncate text-[13px] font-medium text-muted">
                      {best.name}
                    </span>
                  </span>
                )
              }
            />
            <StatTile
              icon="tag"
              label="For sale"
              value={`${listed.length} of ${favs.length}`}
            />
            <StatTile
              icon="sparkle"
              label="Cheapest"
              value={floor ? <NearAmount amount={floor} /> : "—"}
            />
          </div>
        )}

        <Group
          title="Saved"
          action={
            <Segmented options={LAYOUTS} value={layout} onChange={setLayout} />
          }
        >
          {!favs.length ? (
            <div className="card grid place-items-center gap-2 p-12 text-center">
              <SymTile name="heart" size={44} />
              <span className="text-[17px] font-semibold">
                No favorites yet
              </span>
              <span className="text-[15px] text-muted">
                Tap the heart on any ETF to keep it here.
              </span>
              <Link
                href="/"
                className="mt-1 text-[15px] font-semibold text-tint"
              >
                Browse Explore
              </Link>
            </div>
          ) : layout === "Grid" ? (
            <motion.div
              layout
              className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
            >
              <AnimatePresence mode="popLayout">
                {favs.map((e) => (
                  <motion.div
                    key={e.id}
                    layout
                    initial={{ scale: 0.96 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    transition={spring}
                  >
                    <FavCard etf={e} onRemove={() => remove(e.id)} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          ) : (
            <div className="card py-1">
              {favs.map((e) => (
                <div key={e.id} className="flex items-center">
                  <div className="min-w-0 flex-1">
                    <EtfRow
                      etf={e}
                      trailing={
                        <span className="text-[13px] text-muted">
                          {e.listed ? <NearAmount amount={e.priceNear} /> : "—"}
                        </span>
                      }
                    />
                  </div>
                  <button
                    onClick={() => remove(e.id)}
                    aria-label={`Remove ${e.name}`}
                    className="mr-3 grid size-8 shrink-0 place-items-center rounded-full bg-fill text-[#ff2d55]"
                  >
                    <Sym name="heart" size={15} stroke={2.6} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Group>

        {suggestions.length > 0 && (
          <Group title="You might like">
            <div className="no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
              <AnimatePresence mode="popLayout">
                {suggestions.map((e) => (
                  <motion.div
                    key={e.id}
                    layout
                    exit={{ scale: 0.9, opacity: 0 }}
                    transition={spring}
                    className="card flex w-[280px] shrink-0 items-center gap-3 p-3"
                  >
                    <Link
                      href={`/etf/${e.id}`}
                      className="relative size-16 shrink-0 overflow-hidden rounded-[18px]"
                      style={{ background: e.bg }}
                    >
                      <Image
                        src={e.image}
                        alt={e.name}
                        fill
                        sizes="128px"
                        className="object-cover"
                      />
                    </Link>
                    <Link href={`/etf/${e.id}`} className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold">
                        {e.name}
                      </span>
                      <span className="block text-[13px] text-muted">
                        {e.category}
                      </span>
                      <span className="text-[13px] font-medium">
                        <Change value={e.change24h} />
                      </span>
                    </Link>
                    <button
                      onClick={() => add(e.id)}
                      aria-label={`Save ${e.name}`}
                      className="btn-tint grid size-9 shrink-0 place-items-center"
                    >
                      <Sym name="plus" size={16} stroke={2.6} />
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </Group>
        )}
      </div>
    </>
  );
}

function FavCard({ etf, onRemove }: { etf: Etf; onRemove: () => void }) {
  return (
    <article className="card group flex flex-col gap-3 p-2.5">
      <GlareHover
        borderRadius="20px"
        glareOpacity={0.4}
        className="!grid w-full !place-items-stretch"
      >
        <div
          className="relative aspect-[4/3] overflow-hidden rounded-[20px]"
          style={{ background: tint(etf.bg, 30) }}
        >
          <Link
            href={`/etf/${etf.id}`}
            aria-label={etf.name}
            className="absolute inset-0"
          >
            <Image
              src={etf.image}
              alt=""
              fill
              sizes="(min-width: 1536px) 22vw, (min-width: 1280px) 28vw, (min-width: 640px) 45vw, 100vw"
              className="object-cover transition duration-500 group-hover:scale-105"
            />
          </Link>
          <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-surface/80 px-2.5 py-1 text-[12px] font-semibold backdrop-blur-md">
            {etf.category}
          </span>
          <button
            onClick={onRemove}
            aria-label={`Remove ${etf.name}`}
            className="absolute right-3 top-3 grid size-9 place-items-center rounded-full bg-surface text-[#ff2d55] shadow-[0_2px_8px_#0000001a] transition active:scale-90"
          >
            <Sym name="heart" size={16} weight="fill" />
          </button>
        </div>
      </GlareHover>
      <div className="flex flex-col gap-2.5 px-1.5 pb-1.5">
        <div className="flex items-center justify-between gap-2">
          <Link
            href={`/etf/${etf.id}`}
            className="truncate text-[17px] font-semibold"
          >
            {etf.name}
          </Link>
          <TokenStack allocation={etf.allocation} size={20} />
        </div>
        <div className="flex items-center gap-1.5 text-[13px] text-muted">
          <Avatar account={etf.creator} size={18} /> {etf.creator}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-line-soft pt-2.5">
          <span>
            <Money
              value={etf.navUsd}
              className="block text-[16px] font-semibold"
            />
            <span className="text-[13px]">
              <Change value={etf.change24h} />
            </span>
          </span>
          <BuyCapsule etf={etf} />
        </div>
      </div>
    </article>
  );
}
