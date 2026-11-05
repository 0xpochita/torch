import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { tint } from "@/components/etf-card";
import { Topbar } from "@/components/navbar";
import { Money, Pill, TokenStack } from "@/components/ui";
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

  return (
    <>
      <Topbar>
        <nav className="flex items-center gap-2 text-sm text-muted">
          <Link href="/" className="hover:text-text">
            Explore
          </Link>
          <span>/</span>
          <span className="text-text">{etf.name}</span>
        </nav>
      </Topbar>

      <div className="flex flex-1 flex-col gap-6 py-6">
        <header className="flex flex-wrap items-center gap-x-8 gap-y-4 rounded-[28px] p-5" style={{ background: tint(etf.bg, 70) }}>
          <div className="flex items-center gap-4">
            <span className="relative size-16 overflow-hidden rounded-2xl ring-4 ring-white" style={{ background: etf.bg }}>
              <Image src={etf.image} alt="" fill sizes="64px" className="object-cover" />
            </span>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-semibold">{etf.name}</h1>
                <span className="grid size-5 place-items-center rounded-full bg-up text-[10px] text-white" title="Verified vault">
                  ✓
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-white/70 px-2 py-0.5 font-mono text-xs">{etf.id}.torch.near</span>
                <Pill tone="dark">{etf.category}</Pill>
                <Pill tone={etf.listed ? "up" : "neutral"}>{etf.listed ? "● Listed" : "Not listed"}</Pill>
                <TokenStack allocation={etf.allocation} size={20} />
              </div>
            </div>
          </div>
          <dl className="ml-auto grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">
            {[
              ["NAV", <Money key="n" value={etf.navUsd} />],
              ["Price", etf.listed ? `Ⓝ ${etf.priceNear}` : "—"],
              ["Rebalance", etf.rebalance],
              ["Owner", etf.owner],
            ].map(([k, v]) => (
              <div key={String(k)}>
                <dt className="text-xs text-muted">{k}</dt>
                <dd className="font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
        </header>

        <div className="grid flex-1 gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
          <DetailTabs etf={etf} />

          <aside className="flex min-w-0 flex-col gap-4">
            <div className="relative overflow-hidden rounded-[28px]" style={{ background: etf.bg }}>
              <div className="relative aspect-square">
                <Image src={etf.image} alt={etf.name} fill priority sizes="(min-width: 1280px) 400px, 100vw" className="object-cover" />
              </div>
              <div className="absolute right-3 top-3 flex gap-2">
                {["♡", "⤴"].map((icon) => (
                  <button key={icon} className="grid size-9 place-items-center rounded-full bg-white/75 text-ink backdrop-blur-md hover:bg-white">
                    {icon}
                  </button>
                ))}
              </div>
              <span className="absolute bottom-3 left-3 rounded-full bg-white/85 px-3 py-1 text-xs font-medium backdrop-blur">♡ {etf.likes} favorites</span>
            </div>

            <NavPanel etf={etf} />

            <div className="flex flex-col gap-3 rounded-[26px] bg-[radial-gradient(120%_140%_at_100%_0%,#3b1d7a_0%,#141018_60%)] p-5 text-white shadow-[0_20px_50px_-24px_rgb(60_20_140/0.6)]">
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/60">{etf.listed ? "Buy now price" : "Owner hasn't listed this ETF"}</span>
                <span className="text-xs text-white/50">Fee 2% · royalty 0%</span>
              </div>
              <div className="text-2xl font-semibold">{etf.listed ? `Ⓝ ${etf.priceNear}` : "—"}</div>
              <div className="grid grid-cols-2 gap-2">
                <button className="h-12 rounded-full bg-white/15 text-[15px] font-semibold backdrop-blur hover:bg-white/20 active:scale-[0.97]">Make offer</button>
                <button disabled={!etf.listed} className="h-12 rounded-full bg-white text-[15px] font-semibold text-ink active:scale-[0.97] disabled:opacity-40">
                  {etf.listed ? "Buy now" : "Not listed"}
                </button>
              </div>
              <p className="text-[11px] text-white/50">The vault and every token in it transfer with the NFT. Previous owners lose all access.</p>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}
