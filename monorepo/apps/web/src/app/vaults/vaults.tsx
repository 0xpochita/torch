"use client";

import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { BasketArt } from "@/components/basket-art";
import { ActivityRow, AllocationBar, Artwork, Change, tint } from "@/components/etf-card";
import { Sym, type IconName } from "@/components/icons";
import { ConnectPrompt, Topbar } from "@/components/navbar";
import GlareHover from "@/components/react-bits/GlareHover";
import GlideSelect from "@/components/react-bits/GlideSelect";
import { useTx } from "@/components/tx-sheet";
import { useAccount } from "@/providers/near-provider";
import { Avatar, Money, NearAmount, TokenIcon, TokenStack } from "@/components/ui";
import { EmptyState, ErrorState, Skeleton } from "@/components/load-state";
import { toEvents, toNear, toVault, useApi, type ActivityItem, type OffersResponse, type Stats, type VaultSummary } from "@/lib/api";
import { TOKENS, type Etf, type TokenKey } from "@/lib/mock";

const TABS = ["Holdings", "Created", "Listed", "Offers", "Activity"] as const;
type Tab = (typeof TABS)[number];
const KINDS = ["All", "Vaults", "Tokens"] as const;
const SORTS = { recent: "Recently received", value: "Value: high to low", pl: "Best P/L" } as const;
type Sort = keyof typeof SORTS;

export function Vaults() {
  const open = useTx();
  const [tab, setTab] = useState<Tab>("Holdings");
  const [kind, setKind] = useState<(typeof KINDS)[number]>("All");
  const [sort, setSort] = useState<Sort>("recent");
  const [q, setQ] = useState("");
  const [grid, setGrid] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [copied, setCopied] = useState(false);
  const account = useAccount();

  // ponytail: all vaults in one read (owned, created and the activity join); filter server-side with ?owner= once there are thousands
  const vaultsQ = useApi<VaultSummary[]>(account && "/vaults");
  const offersQ = useApi<OffersResponse>(account && `/offers?owner=${encodeURIComponent(account)}`);
  const activityQ = useApi<ActivityItem[]>(account && `/activity?account=${encodeURIComponent(account)}&limit=500`);
  const statsQ = useApi<Stats>("/stats");
  const nearUsd = statsQ.data?.nearUsd ?? 0;

  const all = (vaultsQ.data ?? []).map((v) => toVault(v));
  const byId = new Map(all.map((e) => [e.id, e]));
  const owned = all.filter((e) => e.owner === account);
  const created = all.filter((e) => e.creator === account);
  const total = owned.reduce((s, e) => s + e.navUsd, 0);
  const events = toEvents(activityQ.data ?? []);
  // Cost basis = what this account last paid for the vault; null when it minted it (or got it as a gift).
  const paid = new Map<string, number>();
  for (const e of [...events].reverse()) if (e.type === "transfer" && e.account === account && e.near !== undefined) paid.set(e.tokenId, e.near * nearUsd);
  const cost = (e: Etf) => paid.get(e.id) ?? null;

  // Look-through exposure: every token across every owned vault, weighted by value.
  const exposure = Object.entries(
    owned.reduce<Record<string, number>>((acc, e) => {
      e.allocation.forEach((a) => (acc[a.token] = (acc[a.token] ?? 0) + (e.navUsd * a.weight) / 100));
      return acc;
    }, {}),
  )
    .map(([token, usd]) => ({ token: token as TokenKey, usd }))
    .sort((a, b) => b.usd - a.usd);

  const offers = (offersQ.data?.received ?? []).flatMap((o) => {
    const etf = byId.get(o.tokenId);
    const hours = Math.max(0, Math.round((o.expiresAt - offersQ.at) / 3_600_000));
    return etf ? [{ id: `${o.tokenId}-${o.buyerId}`, from: o.buyerId, priceNear: toNear(o.amount), expiresHours: hours, etf }] : [];
  });
  const activity = events.flatMap((e) => {
    const etf = byId.get(e.tokenId);
    return etf ? [{ ...e, etf }] : [];
  });
  const error = vaultsQ.error ?? offersQ.error ?? activityQ.error ?? statsQ.error;
  const loading = vaultsQ.loading || offersQ.loading || activityQ.loading || statsQ.loading;

  const source = tab === "Created" ? created : tab === "Listed" ? owned.filter((e) => e.listed) : owned;
  const vaults = source
    .filter((e) => e.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (sort === "value" ? b.navUsd - a.navUsd : sort === "pl" ? b.navUsd / (cost(b) || b.navUsd || 1) - a.navUsd / (cost(a) || a.navUsd || 1) : b.mintedAt - a.mintedAt));
  const tokens = exposure.filter((x) => TOKENS[x.token].symbol.toLowerCase().includes(q.toLowerCase()));
  const showVaults = tab !== "Holdings" || kind !== "Tokens";
  const showTokens = tab === "Holdings" && kind !== "Vaults";

  if (!account)
    return (
      <>
        <Topbar />
        <ConnectPrompt className="card mt-4" sub="Your vaults, the tokens inside them, listings and offers show up here once you connect." />
      </>
    );

  const copy = () => {
    navigator.clipboard?.writeText(account).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <>
      <Topbar />

      {/* banner */}
      <div className="relative mt-4 h-[180px] overflow-hidden rounded-[28px] bg-fill md:h-[220px]">
        <Image src="/brand/myvault-banner.png" alt="" fill priority sizes="100vw" className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-bg/70" />
      </div>

      <div className="grid gap-8 lg:grid-cols-[300px_minmax(0,1fr)]">
        {/* profile column */}
        <aside className="relative flex flex-col gap-5 lg:sticky lg:top-20 lg:self-start">
          <div className="-mt-16 w-fit rounded-full ring-[6px] ring-bg">
            <Avatar account={account} size={112} />
          </div>
          <div>
            <h1 className="title-chunky text-[30px]">{account.replace(/\.(near|testnet)$/, "")}</h1>
            <button onClick={copy} className="mt-0.5 flex items-center gap-1.5 font-mono text-[13px] text-muted hover:text-text">
              {account}
              <Sym name={copied ? "check" : "copy"} size={13} weight="bold" />
            </button>
            <p className="mt-2 text-[14px] text-muted">
              <b className="text-text">{owned.length}</b> Owned · <b className="text-text">{created.length}</b> Created
            </p>
          </div>
          <div className="flex gap-2">
            <button className="btn-line h-10 flex-1 text-[14px]">Edit profile</button>
            <IconBtn icon="down" label="Deposit" onClick={() => open({ kind: "deposit" })} />
            <IconBtn icon="up" label="Withdraw" onClick={() => open({ kind: "withdraw" })} />
            <IconBtn icon="share" label="Transfer" onClick={() => open({ kind: "transfer" })} />
          </div>

          <div className="border-t border-line-soft pt-5">
            <div className="flex items-center gap-1.5 text-[13px] text-muted">
              Portfolio value
              <button onClick={() => setHidden((h) => !h)} aria-label={hidden ? "Show value" : "Hide value"} className="hover:text-text">
                <Sym name={hidden ? "eyeOff" : "eye"} size={15} />
              </button>
            </div>
            <div className="mt-1 font-mono text-[32px] font-semibold tracking-tight">{hidden ? "$••••••" : <Money value={total} count />}</div>
            <div className="text-[13px] text-muted">across {owned.length} {owned.length === 1 ? "vault" : "vaults"}</div>
          </div>

          <ul className="flex flex-col gap-3 text-[15px]">
            <Stat icon="vault">{owned.length} vaults</Stat>
            <Stat icon="layers">{exposure.length} tokens inside</Stat>
            <Stat icon="tag">{owned.filter((e) => e.listed).length} listed for sale</Stat>
            <Stat icon="swap">{offers.length} open offers</Stat>
            <li>
              <Link href="/create" className="flex items-center gap-3 font-medium text-tint">
                <Sym name="plus" size={18} weight="bold" /> Create a vault
              </Link>
            </li>
          </ul>
        </aside>

        {/* content */}
        <main className="flex min-w-0 flex-col gap-4 pt-4">
          <nav className="no-scrollbar flex gap-6 overflow-x-auto border-b border-line-soft">
            {TABS.map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`relative shrink-0 pb-3 text-[15px] font-semibold transition-colors ${tab === t ? "text-text" : "text-muted hover:text-text"}`}>
                {t}
                {tab === t && <motion.span layoutId="profile-tab" className="absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-text" />}
              </button>
            ))}
          </nav>

          {error && <ErrorState error={error} />}
          {!error && loading && (
            <div className="flex flex-col gap-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-[68px]" />
              ))}
            </div>
          )}

          {!error && !loading && (tab === "Holdings" || tab === "Created" || tab === "Listed") && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                {tab === "Holdings" &&
                  KINDS.map((k) => (
                    <button key={k} onClick={() => setKind(k)} className={`h-9 rounded-full px-4 text-[14px] font-semibold transition ${kind === k ? "bg-text text-surface" : "bg-fill hover:bg-line"}`}>
                      {k}
                    </button>
                  ))}
                <div className="ml-auto flex items-center gap-2">
                  <GlideSelect
                    options={(Object.keys(SORTS) as Sort[]).map((k) => ({ value: k, label: SORTS[k] }))}
                    value={sort}
                    onChange={(v) => setSort(v as Sort)}
                    size="sm"
                    radius={18}
                    menuWidth={200}
                    align="right"
                    accentColor="var(--text)"
                    surfaceColor="var(--fill)"
                    highlightColor="var(--line)"
                    textColor="var(--text)"
                    ariaLabel="Sort holdings"
                    className="text-[13px] font-semibold"
                  />
                  <label className="flex h-9 w-44 items-center gap-2 rounded-full bg-fill px-3 text-muted">
                    <Sym name="search" size={15} />
                    <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="w-full bg-transparent text-[14px] text-text outline-none placeholder:text-muted" />
                  </label>
                  <div className="flex rounded-full bg-fill p-0.5">
                    {([false, true] as const).map((g) => (
                      <button key={String(g)} onClick={() => setGrid(g)} aria-label={g ? "Grid view" : "List view"} className={`grid size-8 place-items-center rounded-full transition ${grid === g ? "bg-surface text-text" : "text-muted"}`}>
                        <Sym name={g ? "grid" : "rows"} size={16} />
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {!vaults.length && !(showTokens && tokens.length) ? (
                q ? (
                  <Empty title="No matches" body="Try another search." />
                ) : tab === "Listed" ? (
                  <Empty title="Nothing listed" body="List a vault from its page to sell the whole basket." />
                ) : (
                  <EmptyState title={tab === "Created" ? "Nothing created yet" : "No vaults yet"} body={tab === "Created" ? "Baskets you mint show up here." : "Create a basket or buy one on the market."}>
                    <Link href={tab === "Created" ? "/create" : "/market"} className="btn-ink mt-2 h-10 px-5 text-[14px] leading-10">
                      {tab === "Created" ? "Create ETF" : "Browse market"}
                    </Link>
                  </EmptyState>
                )
              ) : grid ? (
                <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                  <AnimatePresence mode="popLayout">
                    {showVaults &&
                      vaults.map((e) => (
                        <motion.div key={e.id} layout initial={{ scale: 0.97 }} animate={{ scale: 1 }} exit={{ opacity: 0 }}>
                          <VaultCard etf={e} />
                        </motion.div>
                      ))}
                  </AnimatePresence>
                </div>
              ) : (
                <div className="-mx-2 overflow-x-auto">
                  <table className="w-full min-w-[720px] text-[14px]">
                    <thead>
                      <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                        <th className="px-2 py-2.5 font-semibold">Asset</th>
                        <th className="px-2 py-2.5 font-semibold">Holdings</th>
                        <th className="px-2 py-2.5 text-right font-semibold">Value</th>
                        <th className="px-2 py-2.5 text-right font-semibold">Cost</th>
                        <th className="px-2 py-2.5 text-right font-semibold">P/L</th>
                        <th className="px-2 py-2.5 text-right font-semibold">Price</th>
                        <th className="px-2 py-2.5" />
                      </tr>
                    </thead>
                    <tbody>
                      {showVaults &&
                        vaults.map((e) => {
                          const c = cost(e);
                          const pl = c === null ? null : e.navUsd - c;
                          return (
                            <tr key={e.id} className="group border-t border-line-soft transition hover:bg-fill/50">
                              <td className="px-2 py-3">
                                <Link href={`/etf/${e.id}`} className="flex items-center gap-3">
                                  <Artwork etf={e} size={44} />
                                  <span className="min-w-0">
                                    <span className="block truncate font-semibold">{e.name}</span>
                                    <span className="block font-mono text-[12px] text-muted">#{e.id}</span>
                                  </span>
                                </Link>
                              </td>
                              <td className="px-2 py-3">
                                <span className="flex items-center gap-2">
                                  <TokenStack allocation={e.allocation} size={20} />
                                  <span className="text-muted">{e.allocation.length} tokens</span>
                                </span>
                              </td>
                              <td className="px-2 py-3 text-right font-semibold">
                                <Money value={e.navUsd} />
                              </td>
                              <td className="px-2 py-3 text-right text-muted">{c === null ? "minted" : <Money value={c} />}</td>
                              <td className={`px-2 py-3 text-right font-medium ${pl === null ? "text-muted" : pl >= 0 ? "text-up" : "text-down"}`}>
                                {pl === null ? (
                                  "—"
                                ) : (
                                  <>
                                    {pl >= 0 ? "+" : "−"}
                                    <Money value={Math.abs(pl)} />
                                  </>
                                )}
                              </td>
                              <td className="px-2 py-3 text-right">{e.listed ? <NearAmount amount={e.priceNear} className="justify-end font-semibold" /> : <span className="text-muted">—</span>}</td>
                              <td className="px-2 py-3 text-right">
                                <button onClick={() => open({ kind: "deposit", etfId: e.id })} className="btn-line h-8 px-3 text-[13px] opacity-0 transition group-hover:opacity-100 focus:opacity-100">
                                  Deposit
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      {showTokens &&
                        tokens.map((x) => {
                          const t = TOKENS[x.token];
                          return (
                            <tr key={x.token} className="border-t border-line-soft transition hover:bg-fill/50">
                              <td className="px-2 py-3">
                                <span className="flex items-center gap-3">
                                  <span className="grid size-11 place-items-center rounded-[24%] bg-fill">
                                    <TokenIcon token={x.token} size={28} />
                                  </span>
                                  <span>
                                    <span className="block font-semibold">{t.symbol}</span>
                                    <span className="block text-[12px] text-muted">{t.name}</span>
                                  </span>
                                </span>
                              </td>
                              <td className="px-2 py-3 text-muted">
                                {(x.usd / t.price).toLocaleString("en-US", { maximumFractionDigits: x.usd / t.price < 1 ? 4 : 0 })} {t.symbol}
                              </td>
                              <td className="px-2 py-3 text-right font-semibold">
                                <Money value={x.usd} />
                              </td>
                              <td className="px-2 py-3 text-right text-muted">—</td>
                              <td className="px-2 py-3 text-right text-muted">—</td>
                              <td className="px-2 py-3 text-right">
                                <Money value={t.price} />
                              </td>
                              <td className="px-2 py-3 text-right text-[12px] text-muted">in vaults</td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {!error && !loading && tab === "Offers" && !offers.length && <Empty title="No offers" body="Offers on your vaults show up here." />}
          {!error && !loading && tab === "Offers" && !!offers.length && (
            <div className="-mx-2 overflow-x-auto">
              <table className="w-full min-w-[640px] text-[14px]">
                <thead>
                  <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                    <th className="px-2 py-2.5 font-semibold">Vault</th>
                    <th className="px-2 py-2.5 font-semibold">Offer</th>
                    <th className="px-2 py-2.5 font-semibold">From</th>
                    <th className="px-2 py-2.5 font-semibold">Expires</th>
                    <th className="px-2 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {offers.map((o) => (
                    <tr key={o.id} className="border-t border-line-soft transition hover:bg-fill/50">
                      <td className="px-2 py-3">
                        <Link href={`/etf/${o.etf.id}`} className="flex items-center gap-3">
                          <Artwork etf={o.etf} size={40} />
                          <span className="font-semibold">{o.etf.name}</span>
                        </Link>
                      </td>
                      <td className="px-2 py-3">
                        <NearAmount amount={o.priceNear} className="font-semibold" />
                        <span className="ml-2 text-[12px] text-muted">
                          <Money value={o.priceNear * nearUsd} />
                        </span>
                      </td>
                      <td className="px-2 py-3">
                        <span className="flex items-center gap-1.5">
                          <Avatar account={o.from} size={20} /> {o.from}
                        </span>
                      </td>
                      <td className="px-2 py-3 text-muted">{o.expiresHours < 24 ? `${o.expiresHours}h` : `${Math.round(o.expiresHours / 24)}d`}</td>
                      <td className="px-2 py-3 text-right">
                        <button onClick={() => open({ kind: "accept", etfId: o.etf.id, offer: { from: o.from, priceNear: o.priceNear } })} className="btn-tint h-8 px-3 text-[13px]">
                          Accept
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!error && !loading && tab === "Activity" &&
            (activity.length ? (
              <div className="card py-1">
                {activity.map((a) => (
                  <ActivityRow key={a.key} h={a} etf={a.etf} />
                ))}
              </div>
            ) : (
              <Empty title="All quiet" body="Mints, deposits, withdrawals and sales on your vaults show up here." />
            ))}
        </main>
      </div>
    </>
  );
}

function IconBtn({ icon, label, onClick }: { icon: IconName; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} title={label} aria-label={label} className="btn-line grid size-10 place-items-center">
      <Sym name={icon} size={17} weight="bold" />
    </button>
  );
}

function Stat({ icon, children }: { icon: IconName; children: ReactNode }) {
  return (
    <li className="flex items-center gap-3">
      <Sym name={icon} size={18} className="text-muted" />
      {children}
    </li>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="grid place-items-center gap-2 py-20 text-center">
      <span className="title-chunky text-[28px]">{title}</span>
      <span className="text-[15px] text-muted">{body}</span>
    </div>
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
          className="grain relative isolate flex h-[132px] items-start justify-between overflow-hidden rounded-[20px] p-4"
          style={{ background: tint(etf.bg, 35) }}
        >
          <span className="absolute inset-y-0 right-2 -z-10 w-[52%] transition duration-500 group-hover:scale-105">
            <BasketArt allocation={etf.allocation} className="!bg-none" />
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
            <div className="font-mono text-[12px] text-muted">#{etf.id}</div>
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
          <span>{etf.category}</span>
          <span>{etf.allocation.length} tokens</span>
        </div>
      </div>
    </Link>
  );
}
