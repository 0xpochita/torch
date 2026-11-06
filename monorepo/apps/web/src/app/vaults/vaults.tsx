"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { BasketArt } from "@/components/basket-art";
import { ActivityRow, AllocationBar, Artwork, Change, tint } from "@/components/etf-card";
import { Sym, type IconName } from "@/components/icons";
import { Topbar } from "@/components/navbar";
import GlareHover from "@/components/react-bits/GlareHover";
import GlideSelect from "@/components/react-bits/GlideSelect";
import { useTx } from "@/components/tx-sheet";
import { Avatar, Money, NearAmount, TokenIcon, TokenStack } from "@/components/ui";
import { ALL_ACTIVITY, ETFS, ME, MY_VAULTS, NEAR_USD, TOKENS, offersFor, type Etf, type TokenKey } from "@/lib/mock";

const TABS = ["Holdings", "Created", "Listed", "Offers", "Activity"] as const;
type Tab = (typeof TABS)[number];
const KINDS = ["All", "Vaults", "Tokens"] as const;
const SORTS = { recent: "Recently received", value: "Value: high to low", pl: "Best P/L" } as const;
type Sort = keyof typeof SORTS;

const owned = ETFS.filter((e) => (MY_VAULTS.owned as readonly string[]).includes(e.id));
const created = ETFS.filter((e) => (MY_VAULTS.created as readonly string[]).includes(e.id));
const total = owned.reduce((s, e) => s + e.navUsd, 0);
// ponytail: cost basis = value 30 days ago; replace with the mint/purchase price from the indexer
const cost = (e: Etf) => e.nav30d[0];

// Look-through exposure: every token across every owned vault, weighted by value.
const exposure = Object.entries(
  owned.reduce<Record<string, number>>((acc, e) => {
    e.allocation.forEach((a) => (acc[a.token] = (acc[a.token] ?? 0) + (e.navUsd * a.weight) / 100));
    return acc;
  }, {}),
)
  .map(([token, usd]) => ({ token: token as TokenKey, usd }))
  .sort((a, b) => b.usd - a.usd);

const offers = owned.flatMap((e) => offersFor(e).map((o) => ({ ...o, etf: e }))).sort((a, b) => b.priceNear - a.priceNear);
const activity = ALL_ACTIVITY.filter((a) => (MY_VAULTS.owned as readonly string[]).includes(a.etf.id));

export function Vaults() {
  const open = useTx();
  const [tab, setTab] = useState<Tab>("Holdings");
  const [kind, setKind] = useState<(typeof KINDS)[number]>("All");
  const [sort, setSort] = useState<Sort>("recent");
  const [q, setQ] = useState("");
  const [grid, setGrid] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [copied, setCopied] = useState(false);

  const source = tab === "Created" ? created : tab === "Listed" ? owned.filter((e) => e.listed) : owned;
  const vaults = source
    .filter((e) => e.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (sort === "value" ? b.navUsd - a.navUsd : sort === "pl" ? b.navUsd / cost(b) - a.navUsd / cost(a) : Number(b.id) - Number(a.id)));
  const tokens = exposure.filter((x) => TOKENS[x.token].symbol.toLowerCase().includes(q.toLowerCase()));
  const showVaults = tab !== "Holdings" || kind !== "Tokens";
  const showTokens = tab === "Holdings" && kind !== "Vaults";

  const copy = () => {
    navigator.clipboard?.writeText(ME).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <>
      <Topbar />

      {/* banner: the wallet's own identicon, blown up and blurred */}
      <div className="grain relative mt-4 h-[180px] overflow-hidden rounded-[28px] bg-fill md:h-[220px]">
        <div aria-hidden className="absolute inset-[-20%] scale-125 opacity-80 blur-[70px] [&_svg]:!size-full">
          <Avatar account={ME} size={400} />
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-bg/70" />
      </div>

      <div className="grid gap-8 lg:grid-cols-[300px_minmax(0,1fr)]">
        {/* profile column */}
        <aside className="relative flex flex-col gap-5 lg:sticky lg:top-20 lg:self-start">
          <div className="-mt-16 w-fit rounded-full ring-[6px] ring-bg">
            <Avatar account={ME} size={112} />
          </div>
          <div>
            <h1 className="title-chunky text-[30px]">{ME.replace(".near", "")}</h1>
            <button onClick={copy} className="mt-0.5 flex items-center gap-1.5 font-mono text-[13px] text-muted hover:text-text">
              {ME}
              <Sym name={copied ? "check" : "copy"} size={13} weight="bold" />
            </button>
            <p className="mt-2 text-[14px] text-muted">
              <b className="text-text">12</b> Following · <b className="text-text">48</b> Followers · Joined Oct 2026
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
            <div className="text-[13px]">
              <Change value={(owned.reduce((s, e) => s + (e.navUsd * e.change24h) / 100, 0) / total) * 100} /> <span className="text-muted">today</span>
            </div>
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

          {(tab === "Holdings" || tab === "Created" || tab === "Listed") && (
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
                <Empty title={tab === "Listed" ? "Nothing listed" : "No matches"} body={tab === "Listed" ? "List a vault from its page to sell the whole basket." : "Try another search."} />
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
                          const pl = e.navUsd - cost(e);
                          return (
                            <tr key={e.id} className="group border-t border-line-soft transition hover:bg-fill/50">
                              <td className="px-2 py-3">
                                <Link href={`/etf/${e.id}`} className="flex items-center gap-3">
                                  <Artwork etf={e} size={44} />
                                  <span className="min-w-0">
                                    <span className="block truncate font-semibold">{e.name}</span>
                                    <span className="block font-mono text-[12px] text-muted">{e.id}.torch.near</span>
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
                              <td className="px-2 py-3 text-right text-muted">
                                <Money value={cost(e)} />
                              </td>
                              <td className={`px-2 py-3 text-right font-medium ${pl >= 0 ? "text-up" : "text-down"}`}>
                                {pl >= 0 ? "+" : "−"}
                                <Money value={Math.abs(pl)} />
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

          {tab === "Offers" && (
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
                          <Money value={o.priceNear * NEAR_USD} />
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

          {tab === "Activity" && (
            <div className="card py-1">
              {activity.map((a, i) => (
                <ActivityRow key={i} h={a} etf={a.etf} />
              ))}
            </div>
          )}
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
          <span>{etf.category}</span>
          <span>{etf.allocation.length} tokens</span>
        </div>
      </div>
    </Link>
  );
}
