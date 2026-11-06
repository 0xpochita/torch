"use client";

import { motion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { BasketArt } from "@/components/basket-art";
import { useState } from "react";
import { AllocationBar, Change, Group, tint } from "@/components/etf-card";
import { Sym, SymTile } from "@/components/icons";
import GlareHover from "@/components/react-bits/GlareHover";
import { Topbar } from "@/components/navbar";
import { useTx } from "@/components/tx-sheet";
import {
  ActionCircle,
  Donut,
  Money,
  NearAmount,
  Segmented,
  StatTile,
  TokenIcon,
  TokenStack,
} from "@/components/ui";
import {
  ETFS,
  ME,
  MY_VAULTS,
  TOKENS,
  type Allocation,
  type Etf,
  type TokenKey,
} from "@/lib/mock";

const VIEWS = ["Owned", "Created", "Listed"] as const;

export function Vaults() {
  const open = useTx();
  const [view, setView] = useState<(typeof VIEWS)[number]>("Owned");

  const owned = ETFS.filter((e) =>
    (MY_VAULTS.owned as readonly string[]).includes(e.id),
  );
  const list =
    view === "Owned"
      ? owned
      : view === "Created"
        ? ETFS.filter((e) =>
            (MY_VAULTS.created as readonly string[]).includes(e.id),
          )
        : owned.filter((e) => e.listed);

  const total = owned.reduce((s, e) => s + e.navUsd, 0);
  const dayChange = owned.reduce(
    (s, e) => s + (e.navUsd * e.change24h) / 100,
    0,
  );
  const series = owned[0].nav30d.map((_, i) =>
    owned.reduce((s, e) => s + e.nav30d[i], 0),
  );

  // Look-through exposure: every token across every owned vault, weighted by value.
  const exposure = Object.entries(
    owned.reduce<Record<string, number>>((acc, e) => {
      e.allocation.forEach(
        (a) =>
          (acc[a.token] = (acc[a.token] ?? 0) + (e.navUsd * a.weight) / 100),
      );
      return acc;
    }, {}),
  )
    .map(([token, usd]) => ({
      token: token as TokenKey,
      usd,
      weight: Math.round((usd / total) * 100),
    }))
    .sort((a, b) => b.usd - a.usd);
  const donut: Allocation[] = exposure.map((x) => ({
    token: x.token,
    weight: x.weight,
  }));

  return (
    <>
      <Topbar title="My Vaults" subtitle={`Signed in as ${ME} · mock wallet`} />

      <div className="grid gap-6 pt-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <main className="flex min-w-0 flex-col gap-6">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <div className="relative isolate flex min-h-[230px] flex-col overflow-hidden rounded-[28px] bg-pink p-6">
              <span className="absolute right-5 top-5 -z-10 size-24 rotate-12">
                <Image
                  src="/brand/torch-mark.png"
                  alt=""
                  fill
                  sizes="112px"
                  className="object-contain"
                />
              </span>
              <span className="title-chunky text-[26px] text-pink-ink">
                torch
              </span>
              <div className="mt-4 text-[13px] font-semibold text-pink-ink/80">
                Total value
              </div>
              <Money value={total} count className="title-chunky text-[44px]" />
              <div className="text-[14px] font-medium">
                <Change value={(dayChange / total) * 100} />{" "}
                <span className="text-muted">today</span>
              </div>
              <Spark values={series} />
              <div className="mt-auto flex items-center justify-between pt-2 text-[13px]">
                <span className="text-pink-ink/80">30 days</span>
                <span className="font-mono tracking-widest text-muted">
                  •••• {ME}
                </span>
              </div>
            </div>
            <div className="card flex flex-col justify-between gap-4 p-5">
              <div className="grid grid-cols-4 gap-2">
                <ActionCircle icon="down" label="Deposit" onClick={() => open({ kind: "deposit" })} />
                <ActionCircle icon="up" label="Withdraw" onClick={() => open({ kind: "withdraw" })} />
                <ActionCircle icon="share" label="Transfer" onClick={() => open({ kind: "transfer" })} />
                <ActionCircle icon="plus" label="New" href="/create" />
              </div>
              <div className="flex items-center gap-3 rounded-[20px] bg-fill p-3">
                <span className="grid size-10 place-items-center rounded-full bg-surface">
                  <Sym name="clock" size={18} weight="bold" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] text-muted">Next keeper rebalance</span>
                  <span className="block text-[15px] font-semibold">Mon, Nov 9 · {owned.filter((e) => e.rebalance === "Weekly").length} weekly vaults</span>
                </span>
                <span className="text-right">
                  <span className="block text-[13px] text-muted">Asking</span>
                  <NearAmount amount={owned.filter((e) => e.listed).reduce((s, e) => s + e.priceNear, 0)} className="text-[15px] font-semibold" />
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <StatTile icon="vault" label="Vaults" value={owned.length}>
                  <span className="text-[12px] text-muted">{owned.filter((e) => e.change24h >= 0).length} up today</span>
                </StatTile>
                <StatTile icon="tag" label="Listed" value={owned.filter((e) => e.listed).length}>
                  <span className="text-[12px] text-muted">{owned.length - owned.filter((e) => e.listed).length} held back</span>
                </StatTile>
                <StatTile icon="layers" label="Tokens" value={exposure.length}>
                  <span className="text-[12px] text-muted">Top: {TOKENS[exposure[0].token].symbol}</span>
                </StatTile>
              </div>
            </div>
          </div>

          <Group
            title="Vaults"
            action={
              <Segmented options={VIEWS} value={view} onChange={setView} />
            }
          >
            {list.length ? (
              <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                {list.map((e, i) => (
                  <motion.div
                    key={view + e.id}
                    initial={{ y: 12 }}
                    animate={{ y: 0 }}
                    transition={{
                      type: "spring",
                      stiffness: 380,
                      damping: 30,
                      delay: i * 0.04,
                    }}
                  >
                    <VaultCard etf={e} />
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="card grid place-items-center gap-2 p-12 text-center">
                <SymTile name="tag" size={40} />
                <span className="text-[17px] font-semibold">
                  Nothing listed
                </span>
                <span className="text-[15px] text-muted">
                  List a vault from its page to sell the whole basket.
                </span>
              </div>
            )}
          </Group>
        </main>

        <aside className="flex flex-col gap-6">
          <Group title="Exposure">
            <div className="card flex flex-col gap-4 p-5">
              <div className="flex items-center gap-4">
                <Donut
                  allocation={donut}
                  size={110}
                  label={
                    <span className="text-[13px] font-semibold">
                      {exposure.length} tokens
                    </span>
                  }
                />
                <p className="text-[13px] text-muted">
                  What you actually hold once every vault is opened up, weighted
                  by value.
                </p>
              </div>
              <ul className="flex flex-col gap-3">
                {exposure.map((x) => (
                  <li
                    key={x.token}
                    className="flex items-center gap-3 text-[15px]"
                  >
                    <TokenIcon token={x.token} size={28} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="font-semibold">
                          {TOKENS[x.token].symbol}
                        </span>
                        <Money value={x.usd} className="text-[14px]" />
                      </span>
                      <span className="mt-1 flex items-center gap-2">
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-fill">
                          <span
                            className="block h-full rounded-full"
                            style={{
                              width: `${(x.weight / exposure[0].weight) * 100}%`,
                              background: "var(--text)",
                            }}
                          />
                        </span>
                        <span className="w-8 text-right text-[12px] text-muted">
                          {x.weight}%
                        </span>
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </Group>

          <Link
            href="/create"
            className="flex items-center gap-3 rounded-[26px] bg-lilac p-4"
          >
            <span className="grid size-10 place-items-center rounded-full bg-ink text-on-ink">
              <Sym name="plus" size={18} stroke={2.4} />
            </span>
            <span className="flex-1">
              <span className="block text-[15px] font-semibold">
                Create a new vault
              </span>
              <span className="text-[13px] text-lilac-ink">
                Pick tokens, set weights, mint.
              </span>
            </span>
            <Sym
              name="chevron"
              size={14}
              stroke={2.4}
              className="text-lilac-ink"
            />
          </Link>
        </aside>
      </div>
    </>
  );
}

/** Combined 30-day value line for the balance card. */
function Spark({ values }: { values: number[] }) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pts = values
    .map(
      (v, i) =>
        `${((i / (values.length - 1)) * 300).toFixed(1)},${(44 - ((v - min) / (max - min || 1)) * 40).toFixed(1)}`,
    )
    .join(" ");
  return (
    <svg
      viewBox="0 0 300 48"
      preserveAspectRatio="none"
      className="mt-3 h-12 w-full text-pink-ink"
      aria-hidden
    >
      <polyline
        points={pts}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function VaultCard({ etf }: { etf: Etf }) {
  return (
    <Link
      href={`/etf/${etf.id}`}
      className="card group flex flex-col gap-4 p-2.5 transition hover:-translate-y-0.5"
    >
      <GlareHover
        borderRadius="20px"
        glareOpacity={0.35}
        className="!grid w-full !place-items-stretch"
      >
        <div
          className="relative isolate flex h-[132px] items-start justify-between overflow-hidden rounded-[20px] p-4"
          style={{ background: tint(etf.bg, 35) }}
        >
          <span className="absolute inset-y-0 right-2 -z-10 w-[52%] transition duration-500 group-hover:scale-105">
            <BasketArt allocation={etf.allocation} />
          </span>
          <span
            className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${etf.listed ? "bg-surface text-text" : "bg-surface/60 text-muted"}`}
          >
            {etf.listed ? (
              <span className="flex items-center gap-1">
                Listed <NearAmount amount={etf.priceNear} />
              </span>
            ) : (
              "Not listed"
            )}
          </span>
        </div>
      </GlareHover>
      <div className="flex flex-col gap-3 px-2 pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-[17px] font-semibold">{etf.name}</div>
            <div className="font-mono text-[12px] text-muted">
              {etf.id}.torch.near
            </div>
          </div>
          <TokenStack allocation={etf.allocation} size={22} />
        </div>
        <div className="flex items-baseline justify-between">
          <Money value={etf.navUsd} className="title-chunky text-[26px]" />
          <span className="text-[14px] font-medium">
            <Change value={etf.change24h} />
          </span>
        </div>
        <AllocationBar etf={etf} className="h-2" />
        <div className="flex items-center justify-between text-[12px] text-muted">
          <span>{etf.rebalance} rebalance</span>
          <span>{etf.allocation.length} tokens</span>
        </div>
      </div>
    </Link>
  );
}
