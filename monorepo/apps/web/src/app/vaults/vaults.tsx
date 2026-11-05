"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Change, EtfRow, Group } from "@/components/etf-card";
import { SymTile } from "@/components/icons";
import { Topbar } from "@/components/navbar";
import { ActionCircle, Donut, Money, Segmented, StatTile } from "@/components/ui";
import { ETFS, ME, MY_VAULTS, TOKENS, type Allocation, type TokenKey } from "@/lib/mock";

const VIEWS = ["Owned", "Created", "Listed"] as const;

export function Vaults() {
  const [view, setView] = useState<(typeof VIEWS)[number]>("Owned");

  const owned = ETFS.filter((e) => (MY_VAULTS.owned as readonly string[]).includes(e.id));
  const list =
    view === "Owned" ? owned : view === "Created" ? ETFS.filter((e) => (MY_VAULTS.created as readonly string[]).includes(e.id)) : owned.filter((e) => e.listed);

  const total = owned.reduce((s, e) => s + e.navUsd, 0);
  const dayChange = owned.reduce((s, e) => s + (e.navUsd * e.change24h) / 100, 0);

  // Look-through exposure: every token across every owned vault, weighted by NAV.
  const exposure = Object.entries(
    owned.reduce<Record<string, number>>((acc, e) => {
      e.allocation.forEach((a) => (acc[a.token] = (acc[a.token] ?? 0) + (e.navUsd * a.weight) / 100));
      return acc;
    }, {}),
  )
    .map(([token, usd]) => ({ token: token as TokenKey, usd, weight: Math.round((usd / total) * 100) }))
    .sort((a, b) => b.usd - a.usd);
  const donut: Allocation[] = exposure.map((x) => ({ token: x.token, weight: x.weight }));

  return (
    <>
      <Topbar title="My Vaults" subtitle={`Signed in as ${ME} · mock wallet`} />

      <div className="grid gap-6 pt-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <main className="flex min-w-0 flex-col gap-6">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
            <div className="relative flex min-h-[210px] flex-col justify-between overflow-hidden rounded-[28px] bg-pink p-6">
              <div className="flex items-start justify-between">
                <span className="title-chunky text-[28px] text-pink-ink">torch</span>
                <span className="relative size-24 -translate-y-2 translate-x-2 rotate-12">
                  <Image src="/brand/torch-mark.png" alt="" fill sizes="96px" className="object-contain" />
                </span>
              </div>
              <div>
                <div className="text-[13px] font-semibold text-pink-ink/80">Total value</div>
                <Money value={total} className="title-chunky text-[44px]" />
                <div className="mt-1 flex items-center justify-between text-[14px] font-medium">
                  <span>
                    <Change value={(dayChange / total) * 100} /> <span className="text-muted">today</span>
                  </span>
                  <span className="font-mono tracking-widest text-muted">•••• {ME}</span>
                </div>
              </div>
            </div>
            <div className="card flex flex-col justify-between gap-4 p-5">
              <div className="grid grid-cols-4 gap-2">
                <ActionCircle icon="down" label="Deposit" />
                <ActionCircle icon="up" label="Withdraw" />
                <ActionCircle icon="share" label="Transfer" />
                <ActionCircle icon="plus" label="New" href="/create" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <StatTile icon="vault" tone="lilac" label="Vaults" value={owned.length} />
                <StatTile icon="tag" tone="peach" label="Listed" value={owned.filter((e) => e.listed).length} />
                <StatTile icon="layers" tone="sky" label="Tokens" value={exposure.length} />
              </div>
            </div>
          </div>

          <Group title="Vaults" action={<Segmented options={VIEWS} value={view} onChange={setView} />}>
            {list.length ? (
              <div className="card py-1">
                {list.map((e) => (
                  <EtfRow
                    key={e.id}
                    etf={e}
                    trailing={
                      <span className="text-right">
                        <span className={`block rounded-full px-2 py-0.5 text-[11px] font-semibold ${e.listed ? "bg-up/15 text-up-text" : "bg-fill text-muted"}`}>{e.listed ? `Listed Ⓝ ${e.priceNear}` : "Not listed"}</span>
                      </span>
                    }
                  />
                ))}
              </div>
            ) : (
              <div className="card grid place-items-center gap-2 p-12 text-center">
                <SymTile name="tag" size={40} />
                <span className="text-[17px] font-semibold">Nothing listed</span>
                <span className="text-[15px] text-muted">List a vault from its page to sell the whole basket.</span>
              </div>
            )}
          </Group>
        </main>

        <aside className="flex flex-col gap-6">
          <Group title="Exposure">
            <div className="card flex flex-col gap-4 p-5">
              <div className="flex items-center gap-4">
                <Donut allocation={donut} size={110} label={<span className="text-[13px] font-semibold">{exposure.length} tokens</span>} />
                <p className="text-[13px] text-muted">What you actually hold once every vault is opened up, weighted by NAV.</p>
              </div>
              <ul>
                {exposure.map((x) => (
                  <li key={x.token} className="flex items-center gap-3 border-b border-line-soft py-2 text-[15px] last:border-0">
                    <span className="size-2.5 rounded-full" style={{ background: TOKENS[x.token].color }} />
                    <span className="flex-1 font-medium">{TOKENS[x.token].symbol}</span>
                    <span className="text-muted">{x.weight}%</span>
                    <Money value={x.usd} className="w-24 text-right" />
                  </li>
                ))}
              </ul>
            </div>
          </Group>

          <Link href="/create" className="card flex items-center gap-3 p-4">
            <SymTile name="plus" size={36} accent />
            <span className="flex-1">
              <span className="block text-[15px] font-semibold">Create a new vault</span>
              <span className="text-[13px] text-muted">Pick tokens, set weights, mint.</span>
            </span>
          </Link>
        </aside>
      </div>
    </>
  );
}
