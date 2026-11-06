"use client";

import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { BasketArt } from "@/components/basket-art";
import { Embers } from "@/components/embers";
import { Icon3D, Sym } from "@/components/icons";
import { Topbar } from "@/components/navbar";
import { Donut, Money, Title, TokenIcon } from "@/components/ui";
import { TxLink } from "@/components/tx-sheet";
import { COLLECTION, FTS, ftByKey, vaultOf } from "@/lib/contracts";
import { toVault, useApi, type VaultSummary } from "@/lib/api";
import { TOKENS, type Allocation, type Category, type TokenKey } from "@/lib/tokens";
import * as near from "@/lib/near-tx";
import { useNear } from "@/providers/near-provider";

const STEPS = ["Theme", "Basket", "Weights", "Deposit", "Review"] as const;
type Template = { id: string; name: string; bg: string; category: Category; allocation: Allocation[] };

// Fallback presets until the API has vaults to learn from (fresh testnet, API down).
const STATIC_TEMPLATES: Template[] = [
  { id: "s0", name: "NEAR Blue Chip", bg: "#9fd3ff", category: "Blue Chip", allocation: [{ token: "NEAR", weight: 40 }, { token: "BTC", weight: 30 }, { token: "ETH", weight: 20 }, { token: "USDC", weight: 10 }] },
  { id: "s1", name: "Stable Harbor", bg: "#b8f0d8", category: "Stable", allocation: [{ token: "USDC", weight: 50 }, { token: "USDT", weight: 30 }, { token: "STNEAR", weight: 20 }] },
  { id: "s2", name: "DeFi Engine", bg: "#ffd8a8", category: "DeFi", allocation: [{ token: "RHEA", weight: 35 }, { token: "LINEAR", weight: 25 }, { token: "AURORA", weight: 20 }, { token: "NEAR", weight: 20 }] },
  { id: "s3", name: "Meme Lab", bg: "#e5c8ff", category: "Meme", allocation: [{ token: "DRAGON", weight: 40 }, { token: "SHITZU", weight: 35 }, { token: "SWEAT", weight: 25 }] },
  { id: "s4", name: "Omni Hot", bg: "#ffc2a8", category: "Chain Abstraction", allocation: [{ token: "HOT", weight: 35 }, { token: "NEAR", weight: 25 }, { token: "ZEC", weight: 20 }, { token: "BTC", weight: 20 }] },
  { id: "s5", name: "Staked Garden", bg: "#c5f5b0", category: "Liquid Staking", allocation: [{ token: "LINEAR", weight: 40 }, { token: "STNEAR", weight: 40 }, { token: "NPRO", weight: 20 }] },
];
const basketKey = (a: Allocation[]) => a.map((x) => x.token).sort().join();

/** Top vaults by NAV with a distinct basket of 2+ tokens become templates; static presets fill the rest. */
function toTemplates(vaults: VaultSummary[] | undefined): Template[] {
  const seen = new Set<string>();
  const live = (vaults ?? [])
    .map((v) => toVault(v))
    .filter((v) => v.allocation.length >= 2 && !seen.has(basketKey(v.allocation)) && seen.add(basketKey(v.allocation)))
    .slice(0, 6)
    .map((v): Template => ({ id: `v${v.id}`, name: v.name, bg: v.bg, category: v.category, allocation: v.allocation }));
  const names = new Set(live.map((t) => t.name));
  return [...live, ...STATIC_TEMPLATES.filter((t) => !seen.has(basketKey(t.allocation)) && !names.has(t.name))].slice(0, 6);
}
const BACKGROUNDS = ["#9fd3ff", "#b8f0d8", "#ffd8a8", "#e5c8ff", "#ffc2a8", "#c5f5b0", "#d7d7e0"];
const MAX_TOKENS = 6;
const NEXT_VAULT = `#.${COLLECTION}`; // the id is assigned on-chain at mint
const STORAGE_NEAR = 0.11; // collection keeps 0.02 for token storage, vault gets the rest
const FT_IDS = FTS.map((f) => f.id);

/** Token amounts for a USD deposit at target weights (fallback prices: testnet tokens have no market). */
const basketAmounts = (allocation: Allocation[], usd: number) =>
  allocation
    .filter((a) => a.weight > 0)
    .map((a) => {
      const ft = ftByKey(a.token);
      return { ft, units: near.toUnits((usd * a.weight) / 100 / TOKENS[a.token].price, ft.decimals) };
    })
    .filter((x) => x.units !== "0");

type Mint = { tokenId: string; hash: string; fundHash?: string; fundError?: string; funded: number };

export function Studio() {
  const [step, setStepRaw] = useState(0);
  const [dir, setDir] = useState(1);
  const setStep = (n: number) => {
    setDir(n >= step ? 1 : -1);
    setStepRaw(n);
  };
  const { accountId, wallet } = useNear();
  const [minted, setMinted] = useState<Mint | null>(null);
  const [busy, setBusy] = useState<"mint" | "fund" | null>(null);
  const [fundStep, setFundStep] = useState<string | null>(null); // wallets without batch signing: one prompt per token
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<Category>(STATIC_TEMPLATES[0].category);
  const [prompt, setPrompt] = useState("");
  const [query, setQuery] = useState("");
  const [name, setName] = useState("My NEAR Index");
  const [allocation, setAllocation] = useState<Allocation[]>(STATIC_TEMPLATES[0].allocation);
  const [bg, setBg] = useState(BACKGROUNDS[0]);
  const [deposit, setDeposit] = useState(0);
  const balances = near.useFtBalances(accountId, FT_IDS, minted ? 1 : 0);

  const total = allocation.reduce((s, a) => s + a.weight, 0);
  // Same token set as a template → show its generated 3D art; custom baskets get the live coin preview.

  const templates = toTemplates(useApi<VaultSummary[]>("/vaults?sort=nav").data);
  const suggestions = templates.slice(0, 5).map((t) => ({ label: t.name, t }));
  const art = templates.find((e) => basketKey(e.allocation) === basketKey(allocation));
  const live = allocation.filter((a) => a.weight > 0);

  // Most you can fund at these weights from your wallet: the scarcest token caps the basket.
  const maxDeposit = balances
    ? Math.floor(Math.min(...live.map((a) => (near.fromUnits(balances[ftByKey(a.token).id] ?? "0", ftByKey(a.token).decimals) * TOKENS[a.token].price) / (a.weight / 100))) * 100) / 100
    : 0;
  const short = deposit > 0 && deposit > maxDeposit;
  const blocker = [
    null,
    allocation.length < 2 ? "Pick at least 2 tokens" : null,
    total !== 100 ? `Weights total ${total}%, need 100%` : null,
    short ? (balances ? "Not enough test tokens in your wallet for this deposit" : "Loading your balances…") : null,
    null,
  ][step];

  const applyTemplate = (etf: Template) => {
    setAllocation(etf.allocation);
    setBg(etf.bg);
    setName(etf.name);
    setCategory(etf.category);
  };

  const fund = async (m: Mint) => {
    if (!wallet) return;
    const parts = basketAmounts(live, deposit);
    if (!parts.length) return;
    setBusy("fund");
    try {
      // one approval: register the vault on each token, then ft_transfer_call into it
      setFundStep(null);
      const outs = await near.send(
        wallet,
        parts.map((p) => near.depositTx(m.tokenId, p.ft.id, p.units)),
        { onStep: (i, n) => setFundStep(`${TOKENS[parts[i].ft.key].symbol} · ${i + 1} of ${n}`) },
      );
      setMinted({ ...m, fundHash: outs[outs.length - 1].transaction.hash, fundError: undefined, funded: deposit });
    } catch (e) {
      setMinted({ ...m, fundError: near.walletError(e) });
    } finally {
      setBusy(null);
    }
  };

  // Step 1 mints (the vault id only exists after it resolves), step 2 funds that exact vault.
  const mint = async () => {
    if (!wallet) return;
    setError(null);
    setBusy("mint");
    let m: Mint;
    try {
      const extra = { basket: live.map((a) => ({ token: ftByKey(a.token).id, weight: a.weight })), bg, category, creator: accountId, rarity: null };
      const outs = await near.send(wallet, [near.mintTx({ title: name.trim() || "Untitled ETF", description: `${category} basket vault`, extra: JSON.stringify(extra) })]);
      const ret = near.lastResult(outs[0]);
      const tokenId = typeof ret === "string" ? ret : (near.events(outs, "vault_created", { from: COLLECTION })[0]?.token_id as string | undefined);
      if (!tokenId) throw new Error("Minted, but the token id was not in the result. Check My Vaults.");
      m = { tokenId, hash: outs[0].transaction.hash, funded: 0 };
      setMinted(m);
    } catch (e) {
      setError(near.walletError(e));
      setBusy(null);
      return;
    }
    if (deposit > 0) await fund(m);
    else setBusy(null);
  };

  // ponytail: keyword match stands in for an AI basket generator
  const generate = () => {
    const q = prompt.toLowerCase();
    const hit =
      suggestions.find((s) => q.split(/\s+/).some((w) => w.length > 2 && (s.label.toLowerCase().includes(w) || s.t.category.toLowerCase().includes(w)))) ??
      suggestions.find((s) => s.t.allocation.some((a) => q.includes(TOKENS[a.token].symbol.toLowerCase()))) ??
      suggestions[0];
    applyTemplate(hit.t);
    setStep(1);
  };

  const toggleToken = (t: TokenKey) => {
    if (allocation.some((a) => a.token === t)) setAllocation(allocation.filter((a) => a.token !== t));
    else if (allocation.length < MAX_TOKENS) setAllocation([...allocation, { token: t, weight: 0 }]);
  };
  const setWeight = (t: TokenKey, w: number) => setAllocation(allocation.map((a) => (a.token === t ? { ...a, weight: w } : a)));
  const equalWeights = () =>
    setAllocation(allocation.map((a, i, arr) => ({ ...a, weight: Math.floor(100 / arr.length) + (i === 0 ? 100 % arr.length : 0) })));
  const normalize = () => {
    if (!total) return equalWeights();
    const scaled = allocation.map((a) => ({ ...a, weight: Math.floor((a.weight / total) * 100) }));
    scaled[0].weight += 100 - scaled.reduce((s, a) => s + a.weight, 0);
    setAllocation(scaled);
  };

  const tokens = (Object.keys(TOKENS) as TokenKey[]).filter((t) => {
    const q = query.trim().toLowerCase();
    return !q || TOKENS[t].symbol.toLowerCase().includes(q) || TOKENS[t].name.toLowerCase().includes(q);
  });

  if (minted && !busy)
    return <Minted m={minted} name={name} deposit={deposit} bg={bg} allocation={live} onFund={deposit > 0 && !minted.fundHash ? () => fund(minted) : undefined} onReset={() => (setMinted(null), setStep(0))} />;

  return (
    <>
      <Topbar>
        <ol className="no-scrollbar flex items-center gap-1 overflow-x-auto text-sm">
          {STEPS.map((s, i) => (
            <li key={s} className="flex items-center gap-1">
              <button
                onClick={() => i <= step && setStep(i)}
                disabled={i > step}
                className={`flex items-center gap-2 whitespace-nowrap rounded-full px-2.5 py-1.5 ${i === step ? "bg-raised font-medium shadow-sm" : i < step ? "text-text" : "text-faint"}`}
              >
                <span className={`grid size-5 place-items-center rounded-full text-[11px] ${i < step ? "bg-up text-white" : i === step ? "bg-ink text-on-ink" : "border border-faint"}`}>
                  {i < step ? <Sym name="check" size={12} stroke={3} /> : i + 1}
                </span>
                {s}
              </button>
              {i < STEPS.length - 1 && <span className="h-px w-4 bg-line" />}
            </li>
          ))}
        </ol>
      </Topbar>

      <div className="grid flex-1 gap-4 pt-4 lg:h-[calc(100dvh-108px)] lg:min-h-0 lg:flex-none lg:grid-cols-[minmax(0,1fr)_360px] lg:grid-rows-[minmax(0,1fr)]">
        {/* Workspace: prompt, canvas, templates */}
        <main className="flex min-h-0 min-w-0 flex-col gap-3">
          <div className="flex flex-col gap-2">
            <div className="flex overflow-hidden rounded-full bg-surface p-1 shadow-[0_1px_2px_var(--shadow)] focus-within:ring-2 focus-within:ring-tint/40">
              <input
                id="prompt"
                aria-label="Describe your ETF"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && generate()}
                placeholder="Describe your ETF… e.g. stablecoin yield with staked NEAR"
                className="min-w-0 flex-1 bg-transparent px-4 text-[15px] outline-none placeholder:text-faint"
              />
              <button onClick={generate} className="flex h-10 items-center gap-1.5 rounded-full bg-tint px-5 text-[15px] font-bold text-white active:scale-95">
                <Icon3D name="sparkle" size={18} /> Generate
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 px-1 text-[13px]">
              <span className="font-semibold">Suggestions:</span>
              {suggestions.map((s) => (
                <button key={s.t.id} onClick={() => applyTemplate(s.t)} className="rounded-full bg-surface px-3 py-1 font-medium shadow-[0_1px_2px_var(--shadow)] hover:bg-fill">
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grain relative min-h-[340px] flex-1 overflow-hidden rounded-[26px]" style={{ background: `color-mix(in oklab, ${bg}, #000 12%)` }}>
            <div className="absolute inset-0 grid place-items-center p-6 pb-40 pt-16">
              <div className="relative aspect-square h-full max-w-full [container-type:inline-size]">
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.div
                    key={live.map((a) => a.token).join("-") || "empty"}
                    initial={{ opacity: 0, scale: 0.92, rotate: -4 }}
                    animate={{ opacity: 1, scale: 1, rotate: 0 }}
                    exit={{ opacity: 0, scale: 1.04, rotate: 3 }}
                    transition={{ type: "spring", stiffness: 260, damping: 24 }}
                    className="absolute inset-0"
                  >
                    <div className="absolute inset-0 overflow-hidden rounded-[26px] shadow-[0_24px_60px_-24px_#00000059]" style={{ background: bg }}>
                      <BasketArt allocation={live} />
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
            <div className="absolute left-4 top-4 flex items-center gap-2">
              <span className="rounded-full bg-chip px-3 py-1 text-xs font-semibold backdrop-blur">Live preview</span>
              <span className="rounded-full bg-chip px-3 py-1 font-mono text-[11px] backdrop-blur">{NEXT_VAULT}</span>
            </div>
            <div className="absolute inset-x-4 bottom-4 flex flex-col gap-3 rounded-[22px] bg-chip p-4 shadow-[0_10px_30px_-12px_#00000040] backdrop-blur-xl">
              <div className="flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-ink text-on-ink">
                  <Icon3D name="layers" size={22} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="title-chunky truncate text-[22px]">{name || "Untitled ETF"}</div>
                  <div className="truncate font-mono text-[11px] text-muted">
                    {NEXT_VAULT} · {allocation.length} tokens
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] font-medium text-muted">Starting value</div>
                  <Money value={deposit} className="title-chunky text-[24px]" />
                </div>
              </div>

              <div className="flex h-9 gap-1">
                {live.map((a) => (
                  <motion.div
                    key={a.token}
                    layout
                    initial={{ opacity: 0, scaleX: 0.6 }}
                    animate={{ opacity: 1, scaleX: 1 }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    className="flex min-w-[44px] items-center gap-1.5 overflow-hidden rounded-full bg-text/10 pl-1 pr-2.5 text-[12px] font-bold text-text"
                    style={{ flexGrow: a.weight, flexBasis: 0 }}
                    title={`${TOKENS[a.token].symbol} ${a.weight}%`}
                  >
                    <TokenIcon token={a.token} size={26} />
                    <span className="truncate">
                      {a.weight >= 12 && <span className="mr-1 font-semibold opacity-90">{TOKENS[a.token].symbol}</span>}
                      {a.weight}%
                    </span>
                  </motion.div>
                ))}
                {!live.length && <div className="flex flex-1 items-center justify-center rounded-full border-2 border-dashed border-line text-[12px] text-muted">Pick tokens to build the basket</div>}
              </div>
            </div>
          </div>

          <div className="card flex items-center gap-4 p-3">
            <div className="no-scrollbar -m-1 flex min-w-0 flex-1 gap-2.5 overflow-x-auto p-1">
              {templates.map((e) => (
                <button key={e.id} onClick={() => applyTemplate(e)} title={e.name} className={`relative size-16 shrink-0 overflow-hidden rounded-[16px] ring-2 ring-offset-2 ring-offset-surface transition ${art?.id === e.id ? "ring-tint" : "ring-transparent hover:ring-line"}`} style={{ background: e.bg }}>
                  <BasketArt allocation={e.allocation} />
                </button>
              ))}
            </div>
            <div className="hidden flex-wrap justify-end gap-1.5 xl:flex">
              {allocation.map((a) => (
                <span key={a.token} className="flex items-center gap-1.5 rounded-full bg-fill py-1 pl-1 pr-2.5 text-[13px] font-medium">
                  <TokenIcon token={a.token} size={20} />
                  {TOKENS[a.token].symbol} <span className="text-muted">{a.weight}%</span>
                </span>
              ))}
            </div>
          </div>
        </main>

        {/* Step panel */}
        <aside className="card flex min-h-0 flex-col">
          <div className="border-b border-line-soft px-5 py-4">
            <div className="text-xs text-muted">
              Step {step + 1} of {STEPS.length}
            </div>
            <h2 className="text-lg font-semibold">
              {["Pick a theme", "Choose tokens", "Set weights", "Fund the vault", "Review & mint"][step]}
            </h2>
          </div>

          <div className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          <AnimatePresence mode="wait" initial={false} custom={dir}>
          <motion.div
            key={step}
            custom={dir}
            variants={{
              enter: (d: number) => ({ opacity: 0, x: d * 28 }),
              center: { opacity: 1, x: 0 },
              exit: (d: number) => ({ opacity: 0, x: d * -28 }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
            className="flex flex-col gap-5 px-5 py-4"
          >
            {step === 0 && (
              <>
                <p className="text-[13px] text-muted">Describe a basket or pick a template on the left, then name it.</p>
                <label className="flex flex-col gap-2 text-sm">
                  <span className="font-medium">Name</span>
                  <input value={name} onChange={(e) => setName(e.target.value)} maxLength={32} className="rounded-[12px] bg-fill px-3 py-2.5 outline-none focus:ring-2 focus:ring-tint/40" />
                </label>
                <div className="flex flex-col gap-2 text-sm">
                  <span className="font-medium">Background</span>
                  <div className="flex flex-wrap gap-2">
                    {BACKGROUNDS.map((c) => (
                      <button
                        key={c}
                        onClick={() => setBg(c)}
                        aria-label={`Background ${c}`}
                        className={`size-9 rounded-xl ring-2 ring-offset-2 ${bg === c ? "ring-ink" : "ring-transparent"}`}
                        style={{ background: c }}
                      />
                    ))}
                  </div>
                </div>
              </>
            )}

            {step === 1 && (
              <>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted">Up to {MAX_TOKENS} NEAR-native or omni tokens</span>
                  <span className="font-medium">
                    {allocation.length}/{MAX_TOKENS}
                  </span>
                </div>
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tokens" className="rounded-[12px] bg-fill px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-tint/40" />
                <ul className="flex flex-col gap-1">
                  {tokens.map((t) => {
                    const on = allocation.some((a) => a.token === t);
                    const full = !on && allocation.length >= MAX_TOKENS;
                    return (
                      <li key={t}>
                        <button
                          onClick={() => toggleToken(t)}
                          disabled={full}
                          className={`flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition ${on ? "bg-tint/10" : "hover:bg-fill"} disabled:opacity-40`}
                        >
                          <TokenIcon token={t} size={32} />
                          <span className="flex-1">
                            <span className="block text-sm font-medium">{TOKENS[t].symbol}</span>
                            <span className="text-xs text-muted">{TOKENS[t].name}</span>
                          </span>
                          <span className="text-xs tabular-nums text-muted">${TOKENS[t].price < 1 ? TOKENS[t].price.toPrecision(2) : TOKENS[t].price.toLocaleString("en-US")}</span>
                          <span className={`grid size-5 place-items-center rounded-full border-[1.5px] text-[11px] ${on ? "border-tint bg-tint text-white" : "border-faint"}`}>{on && <Sym name="check" size={12} stroke={3} />}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}

            {step === 2 && (
              <>
                <div className="flex items-center gap-4">
                  <Donut
                    allocation={live}
                    size={112}
                    label={
                      <span>
                        <span className={`block text-lg font-semibold ${total === 100 ? "" : "text-down"}`}>{total}%</span>
                        <span className="text-[10px] text-muted">allocated</span>
                      </span>
                    }
                  />
                  <div className="flex flex-col gap-2 text-sm">
                    <button onClick={equalWeights} className="btn-line px-3 py-1.5 text-xs">
                      Equal weight
                    </button>
                    <button onClick={normalize} disabled={total === 100} className="btn-line px-3 py-1.5 text-xs disabled:opacity-40">
                      Normalize to 100%
                    </button>
                  </div>
                </div>
                <div className="flex flex-col gap-4">
                  {allocation.map((a) => (
                    <label key={a.token} className="flex flex-col gap-1.5">
                      <span className="flex items-center gap-2 text-sm">
                        <TokenIcon token={a.token} size={22} />
                        <span className="flex-1 font-medium">{TOKENS[a.token].symbol}</span>
                        <span className="text-xs text-muted">
                          <Money value={(deposit * a.weight) / 100} />
                        </span>
                        <span className="w-10 text-right font-medium tabular-nums">{a.weight}%</span>
                      </span>
                      <input type="range" min={0} max={100} value={a.weight} onChange={(e) => setWeight(a.token, Number(e.target.value))} />
                    </label>
                  ))}
                </div>
              </>
            )}

            {step === 3 && (
              <div className="flex flex-col gap-5 text-sm">
                <label className="flex flex-col gap-2">
                  <span className="flex justify-between font-medium">
                    Initial deposit <span className="text-xs font-normal text-muted">{accountId ? <>max <Money value={maxDeposit} /></> : "connect to fund"}</span>
                  </span>
                  <div className="flex items-center rounded-[12px] bg-fill px-3 focus-within:ring-2 focus-within:ring-tint/40">
                    <span className="text-muted">$</span>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={deposit}
                      onChange={(e) => setDeposit(Math.max(0, Number(e.target.value)))}
                      className="w-full px-2 py-2.5 tabular-nums outline-none"
                    />
                    <span className="text-xs text-muted">0 = mint empty</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {[0.25, 0.5, 0.75, 1].map((f) => {
                      const v = Math.floor(maxDeposit * f * 100) / 100;
                      return (
                        <button key={f} onClick={() => setDeposit(v)} disabled={!maxDeposit} className={`rounded-full py-1.5 text-xs font-medium disabled:opacity-40 ${deposit === v && v > 0 ? "bg-ink text-on-ink" : "bg-fill"}`}>
                          {f === 1 ? "Max" : `${f * 100}%`}
                        </button>
                      );
                    })}
                  </div>
                </label>
                <ul className="flex flex-col gap-1.5">
                  {live.map((a) => {
                    const ft = ftByKey(a.token);
                    const need = (deposit * a.weight) / 100 / TOKENS[a.token].price;
                    const have = balances ? near.fromUnits(balances[ft.id] ?? "0", ft.decimals) : null;
                    return (
                      <li key={a.token} className="flex items-center gap-2.5">
                        <TokenIcon token={a.token} size={22} />
                        <span className="flex-1 font-medium">{TOKENS[a.token].symbol}</span>
                        <span className={`tabular-nums ${have !== null && need > have ? "text-down" : ""}`}>{need.toLocaleString("en-US", { maximumSignificantDigits: 4 })}</span>
                        <span className="w-24 text-right text-xs tabular-nums text-muted">of {have === null ? "…" : have.toLocaleString("en-US", { maximumSignificantDigits: 4 })}</span>
                      </li>
                    );
                  })}
                </ul>
                <p className="text-xs text-muted">
                  Tokens move straight from your wallet into the vault at target weights.{" "}
                  <Link href="/faucet" className="font-semibold text-text underline">
                    Get test tokens
                  </Link>
                </p>
              </div>
            )}

            {step === 4 && (
              <div className="flex flex-col gap-5 text-sm">
                <div className="flex items-center gap-4 rounded-[18px] bg-fill p-4">
                  <Donut allocation={live} size={84} />
                  <dl className="grid flex-1 grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                    <dt className="text-muted">Name</dt>
                    <dd className="truncate font-medium">{name}</dd>
                    <dt className="text-muted">Vault</dt>
                    <dd className="truncate font-mono">{NEXT_VAULT}</dd>
                    <dt className="text-muted">Category</dt>
                    <dd>{category}</dd>
                  </dl>
                </div>
                <dl className="flex flex-col gap-2">
                  {[
                    ["Deposit into basket", deposit > 0 ? <Money key="d" value={deposit} /> : "none, fund later"],
                    ["Vault account storage", `${STORAGE_NEAR} NEAR`],
                    ...(deposit > 0 ? [["Token registration", `≤ ${live.length} × 0.00125 NEAR`]] : []),
                    ["Network fee", "≈ 0.003 NEAR"],
                    ["Protocol fee", "0%"],
                  ].map(([k, v]) => (
                    <div key={String(k)} className="flex justify-between">
                      <dt className="text-muted">{k}</dt>
                      <dd className="font-medium">{v}</dd>
                    </div>
                  ))}
                </dl>
                <ul className="flex flex-col gap-1.5 card p-4 text-xs text-muted">
                  {["Vault is created with no access keys", "Only the NFT owner can withdraw", "Selling the NFT moves the whole basket"].map((c) => (
                    <li key={c} className="flex items-center gap-2">
                      <Sym name="check" size={15} stroke={2.6} className="text-up" />
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </motion.div>
          </AnimatePresence>
          </div>

          <div className="flex flex-col gap-3 border-t border-line-soft px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="relative size-12 shrink-0 overflow-hidden rounded-[14px] [container-type:inline-size]" style={{ background: bg }}>
                <BasketArt allocation={live} />
              </div>
              <dl className="grid min-w-0 flex-1 grid-cols-[auto_1fr] gap-x-3 text-[12px]">
                <dt className="text-muted">Tokens</dt>
                <dd className="truncate font-medium">{allocation.map((a) => TOKENS[a.token].symbol).join(", ") || "—"}</dd>
                <dt className="text-muted">Category</dt>
                <dd className="truncate font-medium">{category}</dd>
                <dt className="text-muted">Deposit</dt>
                <dd className="font-medium">
                  <Money value={deposit} />
                </dd>
              </dl>
            </div>
            {busy && (
              <ol className="flex items-center gap-2 text-xs">
                {(["mint", "fund"] as const).map((k, i) => (
                  <li key={k} className={`flex items-center gap-1.5 ${busy === k ? "font-semibold" : k === "mint" ? "text-up" : "text-faint"}`}>
                    <span className={`grid size-5 place-items-center rounded-full text-[11px] ${busy === k ? "bg-ink text-on-ink" : k === "mint" ? "bg-up text-white" : "border border-faint"}`}>
                      {busy !== k && k === "mint" ? <Sym name="check" size={12} stroke={3} /> : i + 1}
                    </span>
                    {k === "mint" ? "Mint vault" : fundStep && busy === "fund" ? `Fund basket (${fundStep})` : "Fund basket"}
                    {i === 0 && deposit > 0 && <span className="h-px w-4 bg-line" />}
                  </li>
                )).slice(0, deposit > 0 ? 2 : 1)}
              </ol>
            )}
            {(error ?? blocker) && <p role="alert" className="text-xs text-down">{error ?? blocker}</p>}
            <div className="grid grid-cols-[auto_1fr] gap-2">
              <button onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0} className="btn-line h-11 px-5 text-sm disabled:opacity-40">
                Back
              </button>
              {step < STEPS.length - 1 ? (
                <button onClick={() => setStep(step + 1)} disabled={!!blocker} className="btn-ink h-11 text-sm">
                  Continue
                </button>
              ) : (
                <button onClick={mint} disabled={total !== 100 || !wallet || !!busy || short} className="btn-ink h-11 text-sm">
                  {busy ? "Confirm in your wallet…" : !wallet ? "Connect a wallet to mint" : error ? "Try again" : <>Mint ETF NFT{deposit > 0 && <> · <Money value={deposit} /></>}</>}
                </button>
              )}
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}

// Gold shards flung out of the card when it lands.
const BURST = Array.from({ length: 22 }, (_, i) => {
  const a = (i / 22) * Math.PI * 2 + (i % 2) * 0.2;
  const d = 150 + (i % 5) * 34;
  return { x: Math.cos(a) * d, y: Math.sin(a) * d * 0.8, r: (i * 47) % 360, s: 6 + (i % 4) * 3, delay: 0.55 + (i % 6) * 0.03 };
});

function Minted({ m, name, deposit, bg, allocation, onFund, onReset }: { m: Mint; name: string; deposit: number; bg: string; allocation: Allocation[]; onFund?: () => void; onReset: () => void }) {
  const account = useNear().accountId;
  const rise = (delay: number) => ({ initial: { y: 16, opacity: 0 }, animate: { y: 0, opacity: 1 }, transition: { delay, type: "spring" as const, stiffness: 260, damping: 24 } });
  return (
    <section className="relative -mx-3 mt-3 flex min-h-[calc(100dvh-24px)] flex-1 flex-col overflow-hidden rounded-[28px] bg-[#0b0806] md:-mx-0">
      <Image src="/brand/mint-banner.png" alt="" fill priority sizes="100vw" className="object-cover" />
      <div className="absolute inset-0 bg-[radial-gradient(60%_55%_at_50%_45%,transparent,#0b0806d9_80%)]" />
      <Embers color="#ffb347" count={50} className="absolute inset-0 size-full" />

      <div className="relative grid flex-1 place-items-center px-6 py-12">
        <div className="flex w-full max-w-md flex-col items-center gap-5 text-center text-[#f5f5f7]">
          <div className="relative">
            {/* shockwave rings */}
            {[0, 0.18].map((d) => (
              <motion.span
                key={d}
                aria-hidden
                initial={{ scale: 0.6, opacity: 0.9 }}
                animate={{ scale: 2.6, opacity: 0 }}
                transition={{ delay: 0.5 + d, duration: 1.1, ease: "easeOut" }}
                className="absolute inset-0 rounded-[26px] border-2 border-[#ffb347]"
              />
            ))}
            {/* burst */}
            {BURST.map((p, i) => (
              <motion.span
                key={i}
                aria-hidden
                initial={{ x: 0, y: 0, opacity: 0, rotate: 0 }}
                animate={{ x: p.x, y: [0, p.y, p.y + 60], opacity: [0, 1, 0], rotate: p.r }}
                transition={{ delay: p.delay, duration: 1.4, ease: "easeOut" }}
                className="absolute left-1/2 top-1/2 rounded-[2px] bg-[#ffc56b]"
                style={{ width: p.s, height: p.s * 0.6, marginLeft: -p.s / 2, boxShadow: "0 0 8px #ff8a00" }}
              />
            ))}
            {/* card drops in, flips, settles with a glow */}
            <motion.div
              initial={{ y: -140, rotateY: 180, scale: 0.6, opacity: 0 }}
              animate={{ y: 0, rotateY: 0, scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 140, damping: 14, delay: 0.1 }}
              className="relative w-[260px] overflow-hidden rounded-[26px] bg-[#16110d]/90 p-2 text-left backdrop-blur-md"
              style={{ boxShadow: "0 0 0 1.5px #ffb34799, 0 30px 80px -20px #ff8a00aa" }}
            >
              <div className="relative aspect-square overflow-hidden rounded-[20px] [container-type:inline-size]" style={{ background: bg }}>
                <BasketArt allocation={allocation} />
                <span className="absolute left-2.5 top-2.5 rounded-full bg-black/55 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-white backdrop-blur-sm">
                  Nº {m.tokenId}
                </span>
                <motion.span aria-hidden initial={{ x: "-120%" }} animate={{ x: "220%" }} transition={{ delay: 0.9, duration: 1, ease: "easeInOut" }} className="absolute inset-y-0 w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-white/45 to-transparent" />
              </div>
              <div className="px-2 pb-1.5 pt-3">
                <div className="truncate text-[17px] font-semibold text-white">{name}</div>
                <div className="font-mono text-[11px] text-white/45">by {account ?? "you"}</div>
                <div className="mt-3 grid grid-cols-3 gap-1.5">
                  {[
                    ["Value", <Money key="v" value={m.funded} />],
                    ["Tokens", allocation.length],
                    ["Owner", "you"],
                  ].map(([k, v]) => (
                    <div key={k as string} className="rounded-[12px] bg-white/[0.06] px-2.5 py-2">
                      <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-white/40">{k}</div>
                      <div className="text-[13px] font-semibold text-white">{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>

          <motion.span {...rise(0.8)} className="flex items-center gap-1.5 rounded-full bg-[#34c759]/20 px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7ee8a0]">
            <Sym name="check" size={13} stroke={2.8} /> Vault minted
          </motion.span>
          <motion.div {...rise(0.9)} className="-mt-1">
            <Title size="text-[44px]">It&apos;s yours.</Title>
            <p className="mt-1 text-[15px] text-white/60">Your basket now lives inside its own vault NFT.</p>
          </motion.div>
          <motion.dl {...rise(1.05)} className="grid w-full grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-[18px] border border-white/10 bg-black/35 px-4 py-3 text-left font-mono text-[12px] backdrop-blur-md">
            <dt className="text-white/40">Vault</dt>
            <dd className="truncate text-right text-white">{vaultOf(m.tokenId)}</dd>
            <dt className="text-white/40">Mint</dt>
            <dd className="flex justify-end">
              <TxLink hash={m.hash} className="text-white" />
            </dd>
            <dt className="text-white/40">Funded</dt>
            <dd className="flex justify-end text-right text-white">
              {m.fundHash ? <TxLink hash={m.fundHash} className="text-white" /> : onFund ? <span className="text-[#ffb766]">not yet</span> : "empty vault"}
            </dd>
          </motion.dl>
          {onFund && (
            <motion.div {...rise(1.1)} className="flex w-full flex-col gap-2">
              {m.fundError && <p role="alert" className="text-[13px] text-[#ff9b8a]">Funding not sent: {m.fundError}</p>}
              <button onClick={onFund} className="h-12 rounded-full bg-white text-[15px] font-semibold text-[#121212] transition active:scale-95">
                Fund basket · <Money value={deposit} />
              </button>
            </motion.div>
          )}
          <motion.div {...rise(1.2)} className="grid w-full grid-cols-2 gap-2">
            <button onClick={onReset} className="h-12 rounded-full border border-white/15 bg-white/5 text-[15px] font-semibold text-white transition hover:bg-white/10 active:scale-95">
              Create another
            </button>
            <Link href={`/etf/${m.tokenId}`} className="grid h-12 place-items-center rounded-full bg-[#ff8a00] text-[15px] font-bold text-white shadow-[0_10px_40px_-8px_#ff6a00] active:scale-95">
              View vault
            </Link>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
