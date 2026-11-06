"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Artwork, Change } from "@/components/etf-card";
import { Sym, type IconName } from "@/components/icons";
import { Topbar } from "@/components/navbar";
import { useTx } from "@/components/tx-sheet";
import { Avatar, Money, NearAmount, TokenIcon, Title } from "@/components/ui";
import { CREATOR_STATS, ETFS, MY_FAVORITES, TOKENS, type TokenKey } from "@/lib/mock";

const KINDS = [
  { key: "All", icon: null },
  { key: "Vaults", icon: "vault" },
  { key: "Creators", icon: "person" },
  { key: "Tokens", icon: "layers" },
] as const;
type Kind = (typeof KINDS)[number]["key"];

/** Wraps the matched part of `text` in a soft highlight, like a search result. */
function Hl({ text, q }: { text: string; q: string }) {
  const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-[4px] bg-line px-0.5 text-text">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

export function Favorites() {
  const open = useTx();
  // ponytail: in-memory favorites; persist per wallet once accounts exist
  const [ids, setIds] = useState<string[]>(MY_FAVORITES);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<Kind>("All");
  const [copied, setCopied] = useState<string | null>(null);

  const saved = ETFS.filter((e) => ids.includes(e.id));
  const match = (s: string) => s.toLowerCase().includes(q.toLowerCase());
  const vaults = saved.filter((e) => match(e.name) || match(e.category));
  const creators = CREATOR_STATS.filter((c) => saved.some((e) => e.creator === c.account) && match(c.account));
  const tokens = [...new Set(saved.flatMap((e) => e.allocation.map((a) => a.token)))].filter((t) => match(TOKENS[t].symbol) || match(TOKENS[t].name)) as TokenKey[];
  const suggestions = ETFS.filter((e) => !ids.includes(e.id));
  const counts: Record<Kind, number> = { All: vaults.length + creators.length + tokens.length, Vaults: vaults.length, Creators: creators.length, Tokens: tokens.length };
  const show = (k: Kind) => kind === "All" || kind === k;

  const copy = (key: string, text: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(key);
    setTimeout(() => setCopied(null), 1200);
  };

  return (
    <>
      <Topbar />

      <section className="card mt-5 flex flex-1 flex-col overflow-hidden p-0">
        <div className="flex flex-wrap items-end justify-between gap-4 px-6 pt-6">
          <div>
            <Title size="text-[40px]">Favorites</Title>
            <p className="mt-1 text-[14px] text-muted">
              {saved.length} saved {saved.length === 1 ? "vault" : "vaults"}, their creators and every token inside
            </p>
          </div>
        </div>

        {/* search bar */}
        <div className="px-6 pt-5">
          <label className="field flex h-14 items-center gap-3 rounded-[20px] bg-fill px-5 focus-within:ring-2 focus-within:ring-tint/45">
            <Sym name="search" size={20} className="text-muted" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Start searching..." className="flex-1 bg-transparent text-[16px] outline-none placeholder:text-muted" />
            <Sym name="funnel" size={18} className="text-muted" />
            {q && (
              <button onClick={() => setQ("")} aria-label="Clear search" className="text-muted hover:text-text">
                <Sym name="close" size={18} weight="bold" />
              </button>
            )}
          </label>
        </div>

        {/* kind chips */}
        <div className="flex flex-wrap gap-2 px-6 pt-4">
          {KINDS.map((k) => {
            const on = kind === k.key;
            const empty = !counts[k.key];
            return (
              <button
                key={k.key}
                onClick={() => setKind(k.key)}
                disabled={empty && k.key !== "All"}
                className={`flex h-10 items-center gap-2 rounded-[14px] border px-4 text-[14px] font-semibold transition disabled:opacity-40 ${on ? "border-text bg-text text-surface" : "border-line hover:bg-fill"}`}
              >
                {k.icon && <Sym name={k.icon as IconName} size={16} />}
                {k.key}
                {k.key !== "All" && <span className={`rounded-[6px] px-1.5 text-[12px] ${on ? "bg-surface/20" : "bg-fill text-muted"}`}>{counts[k.key]}</span>}
              </button>
            );
          })}
        </div>

        <div className="flex flex-1 flex-col gap-2 px-4 pb-6 pt-4">
          {show("Vaults") && vaults.length > 0 && (
            <Section title="Vaults">
              <AnimatePresence initial={false}>
                {vaults.map((e) => (
                  <ResultRow
                    key={e.id}
                    href={`/etf/${e.id}`}
                    art={<Artwork etf={e} size={48} />}
                    title={<Hl text={e.name} q={q} />}
                    badge={<Badge tone={e.change24h >= 0 ? "up" : "down"}>{e.change24h >= 0 ? "+" : "−"}{Math.abs(e.change24h).toFixed(1)}%</Badge>}
                    meta={
                      <>
                        <Money value={e.navUsd} /> · <Hl text={e.category} q={q} /> · <span className="text-text">{e.listed ? <NearAmount amount={e.priceNear} className="inline-flex" /> : "Not listed"}</span>
                      </>
                    }
                    actions={
                      <>
                        <HoverBtn icon="heart" label={`Remove ${e.name}`} onClick={() => setIds((x) => x.filter((i) => i !== e.id))} tone="text-[#ff2d55]" fill />
                        <HoverBtn icon={copied === e.id ? "check" : "link"} label="Copy vault account" onClick={() => copy(e.id, `${e.id}.torch.near`)} />
                        {e.listed && <HoverBtn icon="tag" label={`Buy ${e.name}`} onClick={() => open({ kind: "buy", etfId: e.id })} />}
                      </>
                    }
                  />
                ))}
              </AnimatePresence>
            </Section>
          )}

          {show("Creators") && creators.length > 0 && (
            <Section title="Creators">
              {creators.map((c) => (
                <ResultRow
                  key={c.account}
                  href="/leaderboard"
                  art={<Avatar account={c.account} size={48} />}
                  title={<Hl text={c.account} q={q} />}
                  badge={<Badge tone="neutral">{c.vaults} {c.vaults === 1 ? "vault" : "vaults"}</Badge>}
                  meta={
                    <>
                      <Money value={c.valueUsd} /> managed · <span className="text-text">{c.followers} followers</span>
                    </>
                  }
                  actions={<HoverBtn icon={copied === c.account ? "check" : "link"} label="Copy account" onClick={() => copy(c.account, c.account)} />}
                />
              ))}
            </Section>
          )}

          {show("Tokens") && tokens.length > 0 && (
            <Section title="Tokens">
              {tokens.map((t) => {
                const tok = TOKENS[t];
                const inVaults = saved.filter((e) => e.allocation.some((a) => a.token === t));
                return (
                  <ResultRow
                    key={t}
                    art={
                      <span className="grid size-12 place-items-center rounded-[14px] bg-fill">
                        <TokenIcon token={t} size={30} />
                      </span>
                    }
                    title={<Hl text={tok.symbol} q={q} />}
                    badge={<Badge tone="neutral">in {inVaults.length}</Badge>}
                    meta={
                      <>
                        <Hl text={tok.name} q={q} /> · <span className="text-text">${tok.price < 1 ? tok.price.toPrecision(2) : tok.price.toLocaleString("en-US")}</span>
                      </>
                    }
                  />
                );
              })}
            </Section>
          )}

          {!counts.All && (
            <div className="grid place-items-center gap-2 py-16 text-center">
              <span className="title-chunky text-[28px]">{saved.length ? "No matches" : "No favorites yet"}</span>
              <span className="text-[15px] text-muted">{saved.length ? "Try another name, category or token." : "Tap the heart on any ETF to keep it here."}</span>
            </div>
          )}

          {suggestions.length > 0 && !q && (
            <Section title="You might like">
              {suggestions.map((e) => (
                <ResultRow
                  key={e.id}
                  href={`/etf/${e.id}`}
                  art={<Artwork etf={e} size={48} />}
                  title={e.name}
                  badge={
                    <span className="text-[13px]">
                      <Change value={e.change24h} />
                    </span>
                  }
                  meta={
                    <>
                      <Money value={e.navUsd} /> · {e.category}
                    </>
                  }
                  actions={<HoverBtn icon="heart" label={`Save ${e.name}`} onClick={() => setIds((x) => [...x, e.id])} />}
                  always
                />
              ))}
            </Section>
          )}
        </div>
      </section>
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col border-t border-line-soft pt-3 first:border-0 first:pt-0">
      <span className="px-2 pb-1 text-[13px] font-medium text-muted">{title}</span>
      {children}
    </div>
  );
}

function Badge({ tone, children }: { tone: "up" | "down" | "neutral"; children: ReactNode }) {
  const c = tone === "up" ? "bg-up/15 text-up-text" : tone === "down" ? "bg-down/12 text-down" : "bg-fill text-muted";
  return <span className={`rounded-[6px] px-1.5 py-0.5 text-[12px] font-semibold ${c}`}>{children}</span>;
}

function ResultRow({ href, art, title, badge, meta, actions, always }: { href?: string; art: ReactNode; title: ReactNode; badge: ReactNode; meta: ReactNode; actions?: ReactNode; always?: boolean }) {
  return (
    <motion.div layout exit={{ opacity: 0, height: 0 }} className="group flex items-center gap-3 rounded-[16px] px-2 py-2 transition-colors hover:bg-fill">
      {art}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[15px] font-semibold">{title}</span>
          {badge}
        </div>
        <div className="truncate text-[13px] text-muted">{meta}</div>
      </div>
      <div className={`flex items-center gap-1.5 transition ${always ? "" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"}`}>
        {actions}
        {href && (
          <Link href={href} aria-label="Open" className="grid size-9 place-items-center rounded-[12px] bg-ink text-on-ink transition active:scale-95">
            <Sym name="chevron" size={15} weight="bold" />
          </Link>
        )}
      </div>
    </motion.div>
  );
}

function HoverBtn({ icon, label, onClick, tone = "", fill = false }: { icon: IconName; label: string; onClick: () => void; tone?: string; fill?: boolean }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} className={`grid size-9 place-items-center rounded-[12px] bg-surface shadow-[0_0_0_1px_var(--line)] transition hover:bg-fill active:scale-95 ${tone}`}>
      <Sym name={icon} size={16} weight={fill ? "fill" : "regular"} />
    </button>
  );
}
