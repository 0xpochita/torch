import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Artwork, Change } from "@/components/etf-card";
import { Sym } from "@/components/icons";
import { Topbar } from "@/components/navbar";
import { Money, TokenStack } from "@/components/ui";
import { ETFS, getEtf } from "@/lib/mock";
import { DetailTabs, NavPanel } from "./panels";

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

  // App Store–style info strip under the header.
  const info = [
    { k: "NAV", v: <Money value={etf.navUsd} />, s: "per NFT" },
    { k: "24H", v: <Change value={etf.change24h} />, s: "change" },
    { k: "TOKENS", v: etf.allocation.length, s: <TokenStack allocation={etf.allocation} size={14} /> },
    { k: "REBALANCE", v: etf.rebalance, s: `≤${(etf.slippageBps / 100).toFixed(2)}% slip` },
    { k: "OWNER", v: etf.owner.replace(".near", ""), s: ".near" },
  ];

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
              <h1 className="text-[28px] font-bold leading-tight">{etf.name}</h1>
              <p className="text-[15px] text-muted">
                {etf.category} basket · by {etf.creator}
              </p>
              <p className="mt-1 font-mono text-[12px] text-muted">{etf.id}.torch.near</p>
              <div className="mt-3 flex items-center gap-2">
                <button disabled={!etf.listed} className="btn-ink h-9 px-5 text-[15px]">
                  {etf.listed ? `Buy Ⓝ ${etf.priceNear}` : "Not listed"}
                </button>
                <button className="btn-line h-9 px-4 text-[15px]">Make Offer</button>
                <button className="btn-line grid size-9 place-items-center" aria-label="Share">
                  <Sym name="share" size={17} />
                </button>
              </div>
            </div>
          </div>

          <dl className="no-scrollbar -mx-5 flex overflow-x-auto border-t border-line-soft px-5 pt-4">
            {info.map((x, n) => (
              <div key={x.k} className={`flex min-w-[110px] flex-1 flex-col items-center gap-0.5 px-3 text-center ${n ? "border-l border-line" : ""}`}>
                <dt className="text-[11px] font-semibold text-muted">{x.k}</dt>
                <dd className="text-[20px] font-semibold leading-tight">{x.v}</dd>
                <dd className="flex h-4 items-center text-[12px] text-muted">{x.s}</dd>
              </div>
            ))}
          </dl>
        </header>

        <div className="grid flex-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <DetailTabs etf={etf} />

          <aside className="flex min-w-0 flex-col gap-4">
            <div className="card relative overflow-hidden p-0">
              <div className="relative aspect-square" style={{ background: etf.bg }}>
                <Image src={etf.image} alt={etf.name} fill priority sizes="(min-width: 1280px) 380px, 100vw" className="object-cover" />
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
