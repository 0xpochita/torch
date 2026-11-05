"use client";

import Link from "next/link";
import { useState } from "react";
import { EtfCard, EtfRow, Group } from "@/components/etf-card";
import { Sym, SymTile } from "@/components/icons";
import { Topbar } from "@/components/navbar";
import { Segmented } from "@/components/ui";
import { ETFS, MY_FAVORITES } from "@/lib/mock";

const LAYOUTS = ["Grid", "List"] as const;

export function Favorites() {
  // ponytail: in-memory favorites; persist per wallet once accounts exist
  const [ids, setIds] = useState<string[]>(MY_FAVORITES);
  const [layout, setLayout] = useState<(typeof LAYOUTS)[number]>("Grid");
  const favs = ETFS.filter((e) => ids.includes(e.id));
  const suggestions = ETFS.filter((e) => !ids.includes(e.id));
  const remove = (id: string) => setIds((x) => x.filter((i) => i !== id));

  return (
    <>
      <Topbar title="Favorites" subtitle={`${favs.length} saved ${favs.length === 1 ? "ETF" : "ETFs"}`} />

      <div className="flex flex-col gap-7 pt-5">
        <Group title="Saved" action={<Segmented options={LAYOUTS} value={layout} onChange={setLayout} />}>
          {!favs.length ? (
            <div className="card grid place-items-center gap-2 p-12 text-center">
              <SymTile name="heart" size={44} />
              <span className="text-[17px] font-semibold">No favorites yet</span>
              <span className="text-[15px] text-muted">Tap the heart on any ETF to keep it here.</span>
              <Link href="/" className="mt-1 text-[15px] font-semibold text-tint">
                Browse Explore
              </Link>
            </div>
          ) : layout === "Grid" ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {favs.map((e) => (
                <div key={e.id} className="relative">
                  <EtfCard etf={e} />
                  <button onClick={() => remove(e.id)} aria-label={`Remove ${e.name}`} className="absolute right-5 top-14 grid size-8 place-items-center rounded-full bg-chip text-[#ff2d55] backdrop-blur-md">
                    <Sym name="heart" size={15} stroke={2.6} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="card py-1">
              {favs.map((e) => (
                <EtfRow key={e.id} etf={e} trailing={<span className="text-[13px] text-muted">{e.listed ? `Ⓝ ${e.priceNear}` : "—"}</span>} />
              ))}
            </div>
          )}
        </Group>

        {suggestions.length > 0 && (
          <Group title="You might like">
            <div className="card py-1">
              {suggestions.map((e) => (
                <div key={e.id} className="flex items-center">
                  <div className="min-w-0 flex-1">
                    <EtfRow etf={e} />
                  </div>
                  <button onClick={() => setIds((x) => [...x, e.id])} className="btn-tint mr-3 h-8 shrink-0 px-3 text-[13px]">
                    Save
                  </button>
                </div>
              ))}
            </div>
          </Group>
        )}
      </div>
    </>
  );
}
