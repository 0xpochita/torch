import Image from "next/image";
import { notFound } from "next/navigation";
import { BasketGraph } from "@/components/basket-graph";
import { AllocationBar, Change, tint } from "@/components/etf-card";
import { NavChart } from "@/components/nav-chart";
import { Topbar } from "@/components/navbar";
import { ETFS, fmtUsd, getEtf } from "@/lib/mock";

export function generateStaticParams() {
  return ETFS.map((e) => ({ id: e.id }));
}

export async function generateMetadata({ params }: PageProps<"/etf/[id]">) {
  const etf = getEtf((await params).id);
  return { title: etf ? `${etf.name} · Torch` : "Torch" };
}

const EVENT_COLOR = { mint: "text-[#6b5cf0]", deposit: "text-up", rebalance: "text-[#2f7de1]", withdraw: "text-down", transfer: "text-[#c77a12]" };

export default async function EtfPage({ params }: PageProps<"/etf/[id]">) {
  const etf = getEtf((await params).id);
  if (!etf) notFound();

  return (
    <>
      <Topbar />
    <div className="flex flex-1 flex-col gap-5 py-6">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl p-4" style={{ background: tint(etf.bg, 70) }}>
        <div className="flex items-center gap-3">
          <span className="relative size-10 overflow-hidden rounded-lg" style={{ background: etf.bg }}>
            <Image src={etf.image} alt="" fill sizes="40px" className="object-cover" />
          </span>
          <h1 className="text-xl font-semibold">{etf.name}</h1>
          <span className="text-up">✓</span>
          <span className="hidden border-l border-line pl-3 font-mono text-sm text-muted sm:inline">{etf.id}.torch.near</span>
        </div>
        <dl className="ml-auto flex flex-wrap divide-x divide-black/10 text-right">
          {[
            ["Chain", "Ⓝ NEAR"],
            ["NAV", fmtUsd(etf.navUsd)],
            ["Tokens", String(etf.allocation.length)],
            ["Rebalance", etf.rebalance],
            ["Owner", etf.owner],
            ["Price", etf.listed ? `Ⓝ ${etf.priceNear}` : "—"],
          ].map(([k, v]) => (
            <div key={k} className="px-4 last:pr-0">
              <dt className="text-xs font-medium uppercase text-muted">{k}</dt>
              <dd className="text-sm font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="grid flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_440px]">
        <section className="flex min-w-0 flex-col gap-4">
          <BasketGraph etf={etf} />

          <div id="history" className="rounded-2xl border border-line">
            <div className="flex items-center justify-between border-b border-line px-4 py-2.5 text-sm">
              <span className="font-medium">Vault history</span>
              <span className="font-mono text-xs text-muted">NEP-297 events</span>
            </div>
            <ol className="flex flex-col font-mono text-xs">
              {etf.history.map((h, i) => (
                <li key={i} className="flex gap-3 border-b border-line/60 px-4 py-2 last:border-0">
                  <span className="w-5 text-right text-muted">{i + 1}</span>
                  <span className="w-20 text-muted">{h.at}</span>
                  <span className={`w-20 ${EVENT_COLOR[h.type]}`}>{h.type}</span>
                  <span className="flex-1 truncate">{h.detail}</span>
                  <span className="hidden text-muted md:inline">{h.account}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="flex min-w-0 flex-col gap-4">
          <div className="relative overflow-hidden rounded-2xl" style={{ background: etf.bg }}>
            <div className="relative aspect-square">
              <Image src={etf.image} alt={etf.name} fill priority sizes="(min-width: 1280px) 440px, 100vw" className="object-cover" />
            </div>
            <div className="absolute right-3 top-3 flex flex-col gap-2">
              {["♡", "⤴", "⛶"].map((icon) => (
                <button key={icon} className="grid size-9 place-items-center rounded-lg bg-black/45 text-white backdrop-blur hover:bg-black/60">
                  {icon}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-2xl border border-line p-4">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <div className="text-xs text-muted">Net asset value</div>
                <div className="text-2xl font-semibold">{fmtUsd(etf.navUsd)}</div>
              </div>
              <div className="text-right text-sm">
                <Change value={etf.change24h} /> <span className="text-muted">24h</span>
              </div>
            </div>
            <NavChart values={etf.nav30d} markers={[14, 28]} />
            <div className="flex justify-between font-mono text-[10px] text-muted">
              <span>30d ago</span>
              <span>¦ rebalance</span>
              <span>now</span>
            </div>
            <AllocationBar etf={etf} className="h-2" />
            <div className="grid grid-cols-2 gap-2">
              <button className="btn-line h-11">Make offer</button>
              <button className="btn-ink h-11" disabled={!etf.listed}>
                {etf.listed ? `Buy · Ⓝ ${etf.priceNear}` : "Not listed"}
              </button>
            </div>
            <dl className="grid grid-cols-2 gap-3 pt-1 text-sm sm:grid-cols-4">
              <Stat k="Category" v={etf.category} />
              <Stat k="Owner" v={etf.owner} />
              <Stat k="Creator" v={etf.creator} />
              <Stat k="Rebalance" v={etf.rebalance} />
            </dl>
          </div>
        </section>
      </div>
    </div>
    </>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-xl bg-panel px-3 py-2">
      <dt className="text-xs text-muted">{k}</dt>
      <dd className="truncate font-medium">{v}</dd>
    </div>
  );
}
