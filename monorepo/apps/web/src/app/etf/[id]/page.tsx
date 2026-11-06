import Link from "next/link";
import { BasketArt } from "@/components/basket-art";
import { notFound } from "next/navigation";
import { Artwork, Change } from "@/components/etf-card";
import { Sym } from "@/components/icons";
import { Topbar } from "@/components/navbar";
import { TxAction, TxButton } from "@/components/tx-sheet";
import { ActionCircle, Money, NearAmount, StatTile, TokenStack } from "@/components/ui";
import { ETFS, getEtf, offersFor } from "@/lib/mock";
import { DetailTabs, NavPanel, OffersPanel } from "./panels";

export function generateStaticParams() {
  return ETFS.map((e) => ({ id: e.id }));
}

export async function generateMetadata({ params }: PageProps<"/etf/[id]">) {
  const etf = getEtf((await params).id);
  return { title: etf ? `${etf.name} · Torch` : "Torch" };
}

export default async function EtfPage({ params }: PageProps<"/etf/[id]">) {
  const etf = getEtf((await params).id);
  if (!etf) notFound();


  return (
    <>
      <Topbar>
        <Link href="/" className="flex h-9 items-center gap-1 rounded-full px-3 text-[15px] font-medium text-tint hover:bg-tint/10">
          <Sym name="chevron" size={14} stroke={2.6} className="rotate-180" /> Explore
        </Link>
        <span className="truncate px-2 text-[15px] font-semibold">{etf.name}</span>
      </Topbar>

      <div className="flex flex-1 flex-col gap-6 pt-5">
        <header className="card flex flex-col gap-5 p-5">
          <div className="flex flex-wrap items-center gap-5">
            <Artwork etf={etf} size={112} />
            <div className="min-w-0 flex-1">
              <h1 className="title-chunky text-[38px]">{etf.name}</h1>
              <p className="text-[15px] text-muted">
                {etf.category} basket · by {etf.creator}
              </p>
              <p className="mt-1 font-mono text-[12px] text-muted">{etf.id}.torch.near</p>
              <div className="mt-3 flex items-center gap-2">
                {etf.listed ? (
                  <TxButton tx={{ kind: "buy", etfId: etf.id }} className="btn-ink h-9 px-5 text-[15px]">
                    <span className="flex items-center gap-1.5">
                      Buy <NearAmount amount={etf.priceNear} />
                    </span>
                  </TxButton>
                ) : (
                  <button disabled className="btn-ink h-9 px-5 text-[15px]">
                    Not listed
                  </button>
                )}
                <TxButton tx={{ kind: "offer", etfId: etf.id }} className="btn-line h-9 px-4 text-[15px]">
                  Make Offer
                </TxButton>
                <button className="btn-line grid size-9 place-items-center" aria-label="Share">
                  <Sym name="share" size={17} />
                </button>
              </div>
            </div>
          </div>

          <div className="grid gap-3 border-t border-line-soft pt-4 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-center">
            <div className="flex gap-5 lg:pr-4">
              <TxAction tx={{ kind: etf.listed ? "buy" : "offer", etfId: etf.id }} icon="tag" label={etf.listed ? "Buy" : "Offer"} />
              {etf.listed && <TxAction tx={{ kind: "offer", etfId: etf.id }} icon="swap" label="Offer" />}
              <TxAction tx={{ kind: "transfer", etfId: etf.id }} icon="share" label="Send" />
              <ActionCircle icon="ellipsis" label="More" />
            </div>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <StatTile icon="vault" label="Value" value={<Money value={etf.navUsd} />} />
              <StatTile icon="pulse" label="24h" value={<Change value={etf.change24h} />} />
              <StatTile icon="layers" label="Tokens" value={etf.allocation.length}>
                <TokenStack allocation={etf.allocation} size={18} />
              </StatTile>
              <StatTile icon="swap" label="Top offer" value={<NearAmount amount={offersFor(etf)[0].priceNear} />} />
            </div>
          </div>
        </header>

        <div className="grid flex-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="flex min-w-0 flex-col gap-6">
            <OffersPanel etf={etf} />
            <DetailTabs etf={etf} />
          </div>

          <aside className="flex min-w-0 flex-col gap-4">
            <div className="card relative overflow-hidden p-0">
              <div className="relative aspect-square" style={{ background: etf.bg }}>
                <BasketArt allocation={etf.allocation} />
              </div>
            </div>

            <NavPanel etf={etf} />

            <p className="flex items-start gap-2 px-1 text-[13px] text-muted">
              <Sym name="shield" size={16} className="mt-0.5 shrink-0" />
              The vault and every token in it transfer with the NFT. Previous owners lose all access.
            </p>
          </aside>
        </div>
      </div>
    </>
  );
}
