"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { BasketArt } from "@/components/basket-art";
import Grainient from "@/components/react-bits/Grainient";
import { mixHex } from "@/components/etf-card";
import { Sym } from "@/components/icons";
import { Topbar } from "@/components/navbar";
import { Donut, Money, RadioRow, Switch, Title, TokenIcon } from "@/components/ui";
import { ETFS, TOKENS, type Allocation, type TokenKey } from "@/lib/mock";

const STEPS = ["Theme", "Basket", "Weights", "Strategy", "Review"] as const;
const SUGGESTIONS = [
  { label: "Blue chip", etf: ETFS[0] },
  { label: "Stable yield", etf: ETFS[1] },
  { label: "DeFi engine", etf: ETFS[2] },
  { label: "Meme degen", etf: ETFS[3] },
  { label: "Chain abstraction", etf: ETFS[4] },
];
const BACKGROUNDS = ["#9fd3ff", "#b8f0d8", "#ffd8a8", "#e5c8ff", "#ffc2a8", "#c5f5b0", "#d7d7e0"];
const MAX_TOKENS = 6;
const NEXT_ID = ETFS.length;
const STORAGE_NEAR = 0.11; // collection keeps 0.01 for token storage, vault gets the rest

export function Studio() {
  const [step, setStepRaw] = useState(0);
  const [dir, setDir] = useState(1);
  const setStep = (n: number) => {
    setDir(n >= step ? 1 : -1);
    setStepRaw(n);
  };
  const [minted, setMinted] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [query, setQuery] = useState("");
  const [name, setName] = useState("My NEAR Index");
  const [allocation, setAllocation] = useState<Allocation[]>(ETFS[0].allocation);
  const [bg, setBg] = useState(BACKGROUNDS[0]);
  const [rebalance, setRebalance] = useState("Weekly");
  const [slippage, setSlippage] = useState(50);
  const [keeper, setKeeper] = useState(true);
  const [deposit, setDeposit] = useState(250);

  const total = allocation.reduce((s, a) => s + a.weight, 0);
  // Same token set as a template → show its generated 3D art; custom baskets get the live coin preview.
  const key = (a: Allocation[]) => a.map((x) => x.token).sort().join();
  const art = ETFS.find((e) => key(e.allocation) === key(allocation));
  const live = allocation.filter((a) => a.weight > 0);

  const blocker = [null, allocation.length < 2 ? "Pick at least 2 tokens" : null, total !== 100 ? `Weights total ${total}%, need 100%` : null, deposit < 10 ? "Deposit at least $10" : null, null][step];

  const applyTemplate = (etf: (typeof ETFS)[number]) => {
    setAllocation(etf.allocation);
    setBg(etf.bg);
    setName(etf.name);
    setRebalance(etf.rebalance);
    setSlippage(etf.slippageBps);
  };

  // ponytail: keyword match stands in for an AI basket generator
  const generate = () => {
    const q = prompt.toLowerCase();
    const hit =
      SUGGESTIONS.find((s) => q.includes(s.label.split(" ")[0].toLowerCase())) ??
      SUGGESTIONS.find((s) => s.etf.allocation.some((a) => q.includes(TOKENS[a.token].symbol.toLowerCase()))) ??
      SUGGESTIONS[0];
    applyTemplate(hit.etf);
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

  if (minted) return <Minted name={name} deposit={deposit} bg={bg} allocation={live} onReset={() => (setMinted(false), setStep(0))} />;

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

      <div className="grid flex-1 gap-4 py-4 lg:h-[calc(100dvh-76px)] lg:grid-cols-[minmax(0,1fr)_360px]">
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
                <Sym name="sparkle" size={15} /> Generate
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 px-1 text-[13px]">
              <span className="font-semibold">Suggestions:</span>
              {SUGGESTIONS.map((s) => (
                <button key={s.label} onClick={() => applyTemplate(s.etf)} className="rounded-full bg-surface px-3 py-1 font-medium shadow-[0_1px_2px_var(--shadow)] hover:bg-fill">
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="relative min-h-[340px] flex-1 overflow-hidden rounded-[26px]" style={{ background: bg }}>
            <div className="absolute inset-0">
              <Grainient colors={[mixHex(bg, -0.35), bg, mixHex(bg, 0.55), mixHex(bg, -0.15)]} speed={0.35} grainAmount={0.06} softness={0.8} intro={false} />
            </div>
            <div className="absolute inset-0 grid place-items-center p-6 pb-24 pt-14">
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
              <span className="rounded-full bg-chip px-3 py-1 font-mono text-[11px] backdrop-blur">{NEXT_ID}.torch.near</span>
            </div>
            <div className="absolute inset-x-4 bottom-4 flex flex-col gap-3 rounded-[22px] bg-chip p-4 shadow-[0_10px_30px_-12px_#00000040] backdrop-blur-xl">
              <div className="flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-ink text-on-ink">
                  <Sym name="layers" size={18} stroke={2.2} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="title-chunky truncate text-[22px]">{name || "Untitled ETF"}</div>
                  <div className="truncate font-mono text-[11px] text-muted">
                    {NEXT_ID}.torch.near · {allocation.length} tokens
                  </div>
                </div>
                <span className="hidden items-center gap-1.5 rounded-full bg-fill px-3 py-1.5 text-[12px] font-semibold sm:flex">
                  <Sym name="clock" size={13} stroke={2.4} /> {rebalance}
                </span>
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
              {ETFS.map((e) => (
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
              {["Pick a theme", "Choose tokens", "Set weights", "Strategy & deposit", "Review & mint"][step]}
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
                <div role="radiogroup" aria-label="Rebalance schedule" className="flex flex-col gap-2">
                  <span className="font-medium">Rebalance schedule</span>
                  {[
                    ["Daily", "Tightest tracking", "most swaps"],
                    ["Weekly", "Balanced", "recommended"],
                    ["Monthly", "Lowest cost", "fewest swaps"],
                  ].map(([r, t, d]) => (
                    <RadioRow key={r} selected={rebalance === r} onSelect={() => setRebalance(r)} title={`${r} · ${t}`} detail={d} />
                  ))}
                </div>
                <label className="flex flex-col gap-2">
                  <span className="flex justify-between font-medium">
                    Max slippage per swap <span className="tabular-nums text-muted">{(slippage / 100).toFixed(2)}%</span>
                  </span>
                  <input type="range" min={10} max={300} step={10} value={slippage} onChange={(e) => setSlippage(Number(e.target.value))} />
                </label>
                <label className="flex flex-col gap-2">
                  <span className="font-medium">Initial deposit (USDC)</span>
                  <div className="flex items-center rounded-[12px] bg-fill px-3 focus-within:ring-2 focus-within:ring-tint/40">
                    <span className="text-muted">$</span>
                    <input
                      type="number"
                      min={10}
                      max={1250}
                      value={deposit}
                      onChange={(e) => setDeposit(Math.min(1250, Math.max(0, Number(e.target.value))))}
                      className="w-full px-2 py-2.5 tabular-nums outline-none"
                    />
                    <span className="text-xs text-muted">max 1,250</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {[100, 250, 500, 1250].map((v) => (
                      <button key={v} onClick={() => setDeposit(v)} className={`rounded-full py-1.5 text-xs font-medium ${deposit === v ? "bg-ink text-on-ink" : "bg-fill"}`}>
                        {v === 1250 ? "Max" : `$${v}`}
                      </button>
                    ))}
                  </div>
                </label>
                <div className="flex items-center justify-between gap-3 rounded-[14px] bg-fill px-3.5 py-3">
                  <span>
                    <span className="font-medium">Auto-rebalance keeper</span>
                    <span className="block text-xs text-muted">Swaps only between basket tokens. It can never withdraw.</span>
                  </span>
                  <Switch checked={keeper} onChange={setKeeper} label="Auto-rebalance keeper" />
                </div>
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
                    <dd className="truncate font-mono">{NEXT_ID}.torch.near</dd>
                    <dt className="text-muted">Strategy</dt>
                    <dd>
                      {rebalance} · ≤{(slippage / 100).toFixed(2)}% slip
                    </dd>
                    <dt className="text-muted">Keeper</dt>
                    <dd>{keeper ? "On" : "Off"}</dd>
                  </dl>
                </div>
                <dl className="flex flex-col gap-2">
                  {[
                    ["Deposit into basket", <Money key="d" value={deposit} />],
                    ["Vault account storage", `${STORAGE_NEAR} NEAR`],
                    ["Est. swap cost", <Money key="s" value={(deposit * slippage) / 20000} />],
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
                <dt className="text-muted">Strategy</dt>
                <dd className="truncate font-medium">
                  {rebalance} · ≤{(slippage / 100).toFixed(2)}%
                </dd>
                <dt className="text-muted">Deposit</dt>
                <dd className="font-medium">
                  <Money value={deposit} />
                </dd>
              </dl>
            </div>
            {blocker && <p className="text-xs text-down">{blocker}</p>}
            <div className="grid grid-cols-[auto_1fr] gap-2">
              <button onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0} className="btn-line h-11 px-5 text-sm disabled:opacity-40">
                Back
              </button>
              {step < STEPS.length - 1 ? (
                <button onClick={() => setStep(step + 1)} disabled={!!blocker} className="btn-ink h-11 text-sm">
                  Continue
                </button>
              ) : (
                <button onClick={() => setMinted(true)} disabled={total !== 100} className="btn-ink h-11 text-sm">
                  Mint ETF NFT · <Money value={deposit} />
                </button>
              )}
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}

function Minted({ name, deposit, bg, allocation, onReset }: { name: string; deposit: number; bg: string; allocation: Allocation[]; onReset: () => void }) {
  return (
    <>
      <Topbar title="Create ETF" />
      <div className="grid flex-1 place-items-center py-16">
        <div className="flex w-full max-w-md flex-col items-center gap-5 text-center">
          <div className="relative size-48 overflow-hidden rounded-[24%] [container-type:inline-size]" style={{ background: bg }}>
            <BasketArt allocation={allocation} />
          </div>
          <span className="flex items-center gap-1.5 rounded-full bg-up/15 px-3 py-1 text-[13px] font-semibold text-up-text"><Sym name="check" size={14} stroke={2.8} /> Mock mint complete</span>
          <Title size="text-[44px]">Congratulations</Title>
          <p className="-mt-2 text-[17px] font-semibold">{name} is live</p>
          <p className="text-sm text-muted">
            Vault <span className="font-mono text-text">{NEXT_ID}.torch.near</span> would be created and funded with <Money value={deposit} />. Contracts aren&apos;t deployed
            yet, so nothing was sent on-chain.
          </p>
          <div className="grid w-full grid-cols-2 gap-2">
            <button onClick={onReset} className="btn-line h-11 text-sm">
              Create another
            </button>
            <Link href="/etf/0" className="grid h-12 place-items-center rounded-full bg-tint text-[15px] font-bold text-white active:scale-95">
              View example vault
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
