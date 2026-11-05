"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { CoinStack } from "@/components/coin-stack";
import { tint } from "@/components/etf-card";
import { Topbar } from "@/components/navbar";
import { Donut, Money, Switch, TokenIcon } from "@/components/ui";
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
  const [step, setStep] = useState(0);
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

  if (minted) return <Minted name={name} deposit={deposit} bg={bg} art={art?.image} allocation={live} onReset={() => (setMinted(false), setStep(0))} />;

  return (
    <>
      <Topbar title="Create ETF">
        <ol className="no-scrollbar flex items-center gap-1 overflow-x-auto text-sm">
          {STEPS.map((s, i) => (
            <li key={s} className="flex items-center gap-1">
              <button
                onClick={() => i <= step && setStep(i)}
                disabled={i > step}
                className={`flex items-center gap-2 whitespace-nowrap rounded-full px-2.5 py-1.5 ${i === step ? "bg-white font-medium shadow-sm" : i < step ? "text-text" : "text-faint"}`}
              >
                <span className={`grid size-5 place-items-center rounded-full text-[11px] ${i < step ? "bg-up text-white" : i === step ? "bg-ink text-white" : "border border-faint"}`}>
                  {i < step ? "✓" : i + 1}
                </span>
                {s}
              </button>
              {i < STEPS.length - 1 && <span className="h-px w-4 bg-line" />}
            </li>
          ))}
        </ol>
      </Topbar>

      <div className="grid flex-1 gap-6 py-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        {/* Preview */}
        <main className="flex min-w-0 flex-col gap-4 lg:self-start">
          <div className="relative overflow-hidden rounded-3xl" style={{ background: `radial-gradient(circle at 50% 35%, ${tint(bg, 40)}, ${bg})` }}>
            <div className="absolute left-4 top-4 z-10 flex items-center gap-2">
              <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-medium backdrop-blur">Live preview</span>
              <span className="rounded-full bg-white/60 px-3 py-1 font-mono text-[11px] backdrop-blur">{NEXT_ID}.torch.near</span>
            </div>
            <div className="relative mx-auto aspect-square w-full max-w-[540px] [container-type:inline-size]">
              {art ? (
                <Image src={art.image} alt={art.name} fill sizes="540px" className="animate-[float_6s_ease-in-out_infinite] object-cover [mask-image:radial-gradient(circle,black_55%,transparent_72%)]" />
              ) : (
                <CoinStack allocation={live} spin />
              )}
            </div>
            <div className="absolute inset-x-4 bottom-4 flex flex-col gap-2">
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-xs text-black/50">ETF name</div>
                  <div className="text-xl font-semibold">{name || "Untitled ETF"}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-black/50">Initial NAV</div>
                  <Money value={deposit} className="text-xl font-semibold" />
                </div>
              </div>
              <div className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-black/10">
                {allocation.map((a) => (
                  <span key={a.token} style={{ width: `${a.weight}%`, background: TOKENS[a.token].color }} />
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {allocation.map((a) => (
              <span key={a.token} className="card flex items-center gap-2 rounded-full! py-1 pl-1 pr-3 text-sm">
                <TokenIcon token={a.token} size={24} />
                {TOKENS[a.token].symbol}
                <span className="font-medium tabular-nums">{a.weight}%</span>
              </span>
            ))}
          </div>
        </main>

        {/* Step panel */}
        <aside className="flex flex-col card rounded-[26px] lg:sticky lg:top-[96px] lg:h-[calc(100vh-120px)]">
          <div className="border-b border-line-soft p-5">
            <div className="text-xs text-muted">
              Step {step + 1} of {STEPS.length}
            </div>
            <h2 className="text-lg font-semibold">
              {["Pick a theme", "Choose tokens", "Set weights", "Strategy & deposit", "Review & mint"][step]}
            </h2>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-5">
            {step === 0 && (
              <>
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium" htmlFor="prompt">
                    Describe it
                  </label>
                  <div className="flex overflow-hidden rounded-[12px] bg-fill focus-within:ring-2 focus-within:ring-tint/40">
                    <input
                      id="prompt"
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && generate()}
                      placeholder="e.g. stablecoin yield with staked NEAR"
                      className="min-w-0 flex-1 px-3 py-2.5 text-sm outline-none placeholder:text-faint"
                    />
                    <button onClick={generate} className="btn-ink rounded-none! px-4 text-sm">
                      Generate ✦
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {SUGGESTIONS.map((s) => (
                      <button key={s.label} onClick={() => applyTemplate(s.etf)} className="rounded-full bg-fill px-3 py-1 text-xs font-medium hover:bg-black/10">
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <span className="text-sm font-medium">Or start from a template</span>
                  <div className="grid grid-cols-3 gap-2">
                    {ETFS.map((e) => (
                      <button key={e.id} onClick={() => applyTemplate(e)} className={`overflow-hidden rounded-xl border-2 text-left ${art?.id === e.id ? "border-ink" : "border-transparent"}`}>
                        <span className="relative block aspect-square" style={{ background: e.bg }}>
                          <Image src={e.image} alt="" fill sizes="110px" className="object-cover" />
                        </span>
                        <span className="block truncate px-1 py-1 text-[11px]">{e.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

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
                          <span className={`grid size-5 place-items-center rounded-full border-[1.5px] text-[11px] ${on ? "border-tint bg-tint text-white" : "border-faint"}`}>{on ? "✓" : ""}</span>
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
                <div className="flex flex-col gap-2">
                  <span className="font-medium">Rebalance schedule</span>
                  <div className="grid grid-cols-3 gap-2">
                    {["Daily", "Weekly", "Monthly"].map((r) => (
                      <button key={r} onClick={() => setRebalance(r)} className={`rounded-full border py-2.5 font-medium ${rebalance === r ? "border-transparent bg-ink text-white" : "border-transparent bg-fill"}`}>
                        {r}
                      </button>
                    ))}
                  </div>
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
                      <button key={v} onClick={() => setDeposit(v)} className={`rounded-full py-1.5 text-xs font-medium ${deposit === v ? "bg-ink text-white" : "bg-fill"}`}>
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
                      <span className="grid size-4 place-items-center rounded-full bg-up/15 text-[9px] text-up">✓</span>
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 border-t border-line-soft p-5">
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

function Minted({ name, deposit, bg, art, allocation, onReset }: { name: string; deposit: number; bg: string; art?: string; allocation: Allocation[]; onReset: () => void }) {
  return (
    <>
      <Topbar title="Create ETF" />
      <div className="grid flex-1 place-items-center py-16">
        <div className="flex w-full max-w-md flex-col items-center gap-5 text-center">
          <div className="relative size-48 overflow-hidden rounded-3xl [container-type:inline-size]" style={{ background: bg }}>
            {art ? <Image src={art} alt="" fill sizes="192px" className="object-cover" /> : <CoinStack allocation={allocation} />}
          </div>
          <span className="rounded-full bg-up/10 px-3 py-1 text-xs font-medium text-up">● Mock mint complete</span>
          <h1 className="text-2xl font-semibold">{name} is live</h1>
          <p className="text-sm text-muted">
            Vault <span className="font-mono text-text">{NEXT_ID}.torch.near</span> would be created and funded with <Money value={deposit} />. Contracts aren&apos;t deployed
            yet, so nothing was sent on-chain.
          </p>
          <div className="grid w-full grid-cols-2 gap-2">
            <button onClick={onReset} className="btn-line h-11 text-sm">
              Create another
            </button>
            <Link href="/etf/0" className="btn-ink grid h-11 place-items-center text-sm">
              View example vault
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
