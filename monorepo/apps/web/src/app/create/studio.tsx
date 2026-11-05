"use client";

import Image from "next/image";
import { useState } from "react";
import { CoinStack } from "@/components/coin-stack";
import { Topbar } from "@/components/navbar";
import { ETFS, TOKENS, fmtUsd, type Allocation, type TokenKey } from "@/lib/mock";

const STEPS = ["Theme", "Basket", "Weights", "Strategy", "Review", "Mint"] as const;
const SUGGESTIONS = [
  { label: "Blue chip", etf: ETFS[0] },
  { label: "Stable yield", etf: ETFS[1] },
  { label: "DeFi engine", etf: ETFS[2] },
  { label: "Meme degen", etf: ETFS[3] },
  { label: "Chain abstraction", etf: ETFS[4] },
];
const BACKGROUNDS = ["#9fd3ff", "#b8f0d8", "#ffd8a8", "#e5c8ff", "#ffc2a8", "#c5f5b0", "#1c1c1f"];
const TABS = ["Basket", "Strategy", "Style"] as const;
const MAX_TOKENS = 6;
const NEXT_ID = ETFS.length;

export function Studio() {
  const [step, setStep] = useState(1);
  const [tab, setTab] = useState<(typeof TABS)[number]>("Basket");
  const [prompt, setPrompt] = useState("");
  const [name, setName] = useState("My NEAR Index");
  const [allocation, setAllocation] = useState<Allocation[]>(ETFS[0].allocation);
  const [bg, setBg] = useState(BACKGROUNDS[0]);
  const [rebalance, setRebalance] = useState("Weekly");
  const [slippage, setSlippage] = useState(50);
  const [keeper, setKeeper] = useState(true);
  const [deposit, setDeposit] = useState(250);
  const [minted, setMinted] = useState(false);

  const total = allocation.reduce((s, a) => s + a.weight, 0);
  // Same token set as a template → show its generated 3D art; custom baskets get the live coin preview.
  const key = (a: Allocation[]) => a.map((x) => x.token).sort().join();
  const art = ETFS.find((e) => key(e.allocation) === key(allocation));
  const valid = total === 100 && allocation.length > 0;

  const applyTemplate = (etf: (typeof ETFS)[number]) => {
    setAllocation(etf.allocation);
    setBg(etf.bg);
    setName(etf.name);
    setRebalance(etf.rebalance);
    setSlippage(etf.slippageBps);
    setStep(2);
  };

  // ponytail: keyword match stands in for an AI basket generator
  const generate = () => {
    const q = prompt.toLowerCase();
    const hit =
      SUGGESTIONS.find((s) => q.includes(s.label.split(" ")[0].toLowerCase())) ??
      SUGGESTIONS.find((s) => s.etf.allocation.some((a) => q.includes(TOKENS[a.token].symbol.toLowerCase()))) ??
      SUGGESTIONS[0];
    applyTemplate(hit.etf);
  };

  const toggleToken = (t: TokenKey) => {
    if (allocation.some((a) => a.token === t)) setAllocation(allocation.filter((a) => a.token !== t));
    else if (allocation.length < MAX_TOKENS) setAllocation([...allocation, { token: t, weight: 0 }]);
  };

  const setWeight = (t: TokenKey, w: number) => setAllocation(allocation.map((a) => (a.token === t ? { ...a, weight: w } : a)));

  const normalize = () => {
    if (!total) return setAllocation(allocation.map((a, i, arr) => ({ ...a, weight: Math.floor(100 / arr.length) + (i === 0 ? 100 % arr.length : 0) })));
    const scaled = allocation.map((a) => ({ ...a, weight: Math.floor((a.weight / total) * 100) }));
    scaled[0].weight += 100 - scaled.reduce((s, a) => s + a.weight, 0);
    setAllocation(scaled);
  };

  return (
    <>
    <Topbar>
      <span className="text-sm font-semibold">Create ETF</span>
    </Topbar>
    <div className="grid flex-1 gap-5 py-6 lg:grid-cols-[200px_minmax(0,1fr)_340px]">
      {/* Left: navigation */}
      <aside className="hidden flex-col gap-1 rounded-2xl bg-panel p-3 lg:flex">
        {["Dashboard", "My ETFs", "Templates", "Create New"].map((l) => (
          <span key={l} className={`rounded-xl px-3 py-2.5 text-sm ${l === "Create New" ? "bg-white font-medium shadow-sm" : "text-muted"}`}>
            {l}
          </span>
        ))}
        <div className="mt-3 border-t border-line px-3 pt-4 text-[10px] uppercase tracking-widest text-muted">Tools</div>
        {["Backtest", "Rebalance rules"].map((l) => (
          <span key={l} className="rounded-xl px-3 py-2.5 text-sm text-muted">
            {l}
          </span>
        ))}
        <div className="mt-auto rounded-xl bg-ink p-3 text-white">
          <div className="text-xs text-white/60">Wallet balance (mock)</div>
          <div className="mt-1 font-semibold">1,250.00 USDC</div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/15">
            <div className="h-full bg-white" style={{ width: `${Math.min(100, (deposit / 1250) * 100)}%` }} />
          </div>
          <div className="mt-1 text-[11px] text-white/60">{fmtUsd(deposit)} going into the vault</div>
        </div>
      </aside>

      {/* Center: stepper, prompt, preview, templates */}
      <main className="flex min-w-0 flex-col gap-4">
        <ol className="flex items-center gap-1 overflow-x-auto rounded-full border border-line bg-panel p-1.5 text-sm">
          {STEPS.map((s, i) => (
            <li key={s} className="flex items-center gap-1">
              <button
                onClick={() => setStep(i)}
                className={`flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-1.5 ${i === step ? "bg-white shadow-sm" : "text-muted"}`}
              >
                <span className={`grid size-5 place-items-center rounded-full text-[11px] ${i < step ? "bg-ink text-white" : i === step ? "bg-ink/70 text-white" : "border border-line"}`}>
                  {i < step ? "✓" : i + 1}
                </span>
                {s}
              </button>
              {i < STEPS.length - 1 && <span className="text-muted">→</span>}
            </li>
          ))}
        </ol>

        <div className="flex flex-col gap-2">
          <div className="flex overflow-hidden rounded-xl border border-line bg-panel">
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && generate()}
              placeholder="Describe your ETF… e.g. “safe stablecoin yield with some staked NEAR”"
              className="flex-1 bg-transparent px-4 py-3 text-sm outline-none placeholder:text-muted"
            />
            <button onClick={generate} className="btn-ink rounded-none! px-6 text-sm">
              Generate ✦
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-medium">Suggestions:</span>
            {SUGGESTIONS.map((s) => (
              <button key={s.label} onClick={() => applyTemplate(s.etf)} className="rounded-full border border-line bg-panel px-3 py-1 text-muted hover:text-text">
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-line" style={{ background: `radial-gradient(circle at 50% 35%, color-mix(in oklab, ${bg} 85%, white), ${bg})` }}>
          <div className="absolute left-3 top-3 z-10 flex flex-col gap-2">
            {["⟳ Rotate", "⌕ Zoom", "☀ Light", "▣ Background"].map((t) => (
              <span key={t} className="rounded-lg bg-black/45 px-2.5 py-1.5 text-[11px] text-white backdrop-blur">
                {t}
              </span>
            ))}
          </div>
          <div className="absolute right-3 top-3 z-10 rounded-lg bg-black/45 px-3 py-1.5 font-mono text-[11px] text-white backdrop-blur">
            {NEXT_ID}.torch.near
          </div>
          <div className="relative mx-auto aspect-square w-full max-w-[520px] [container-type:inline-size]">
            {art ? (
              <Image src={art.image} alt={art.name} fill sizes="520px" className="animate-[float_6s_ease-in-out_infinite] object-cover [mask-image:radial-gradient(circle,black_55%,transparent_72%)]" />
            ) : (
              <CoinStack allocation={allocation.filter((a) => a.weight > 0)} spin />
            )}
          </div>
          <div className="absolute inset-x-3 bottom-3 flex h-2 overflow-hidden rounded-full bg-black/20">
            {allocation.map((a) => (
              <span key={a.token} style={{ width: `${a.weight}%`, background: TOKENS[a.token].color }} />
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-line p-3">
          <div className="mb-3 flex gap-4 border-b border-line pb-2 text-sm">
            <span className="border-b-2 border-ink pb-2 font-medium">Templates</span>
            <span className="pb-2 text-muted">Trending baskets</span>
          </div>
          <div className="flex gap-3 overflow-x-auto">
            {ETFS.map((e) => (
              <button key={e.id} onClick={() => applyTemplate(e)} className="group shrink-0 text-left">
                <div className="relative size-24 overflow-hidden rounded-xl border border-line group-hover:border-ink" style={{ background: e.bg }}>
                  <Image src={e.image} alt={e.name} fill sizes="96px" className="object-cover" />
                </div>
                <div className="mt-1 w-24 truncate text-xs text-muted">{e.name}</div>
              </button>
            ))}
          </div>
        </div>
      </main>

      {/* Right: settings + overview */}
      <aside className="flex flex-col gap-4">
        <div className="rounded-2xl border border-line p-4">
          <div className="mb-4 flex gap-1 border-b border-line text-sm">
            {TABS.map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`flex-1 pb-2 ${tab === t ? "border-b-2 border-ink font-medium" : "text-muted"}`}>
                {t}
              </button>
            ))}
          </div>

          {tab === "Basket" && (
            <div className="flex flex-col gap-4">
              <div>
                <div className="mb-2 flex justify-between text-sm">
                  <span className="font-medium">Tokens</span>
                  <span className="text-muted">
                    {allocation.length}/{MAX_TOKENS}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {(Object.keys(TOKENS) as TokenKey[]).map((t) => {
                    const on = allocation.some((a) => a.token === t);
                    return (
                      <button
                        key={t}
                        onClick={() => toggleToken(t)}
                        title={TOKENS[t].name}
                        className={`flex flex-col items-center gap-1 rounded-xl border p-2 text-[10px] ${on ? "border-ink bg-ink text-white" : "border-line bg-white text-muted hover:border-faint"}`}
                      >
                        <span className="size-5 rounded-full" style={{ background: TOKENS[t].color }} />
                        <span className="w-full truncate text-center">{TOKENS[t].symbol}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">Weights</span>
                  <span className={total === 100 ? "text-up" : "text-down"}>{total}% / 100%</span>
                </div>
                {allocation.map((a) => (
                  <label key={a.token} className="flex items-center gap-3 text-xs">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: TOKENS[a.token].color }} />
                    <span className="w-16 truncate">{TOKENS[a.token].symbol}</span>
                    <input type="range" min={0} max={100} value={a.weight} onChange={(e) => setWeight(a.token, Number(e.target.value))} className="flex-1" />
                    <span className="w-9 text-right tabular-nums">{a.weight}%</span>
                  </label>
                ))}
                {total !== 100 && (
                  <button onClick={normalize} className="self-start rounded-lg border border-line px-3 py-1.5 text-xs hover:border-ink">
                    Normalize to 100%
                  </button>
                )}
              </div>
            </div>
          )}

          {tab === "Strategy" && (
            <div className="flex flex-col gap-4 text-sm">
              <label className="flex flex-col gap-2">
                <span className="font-medium">Rebalance schedule</span>
                <select value={rebalance} onChange={(e) => setRebalance(e.target.value)} className="rounded-lg border border-line bg-white px-3 py-2 outline-none">
                  {["Daily", "Weekly", "Monthly"].map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-2">
                <span className="flex justify-between font-medium">
                  Max slippage <span className="text-muted">{(slippage / 100).toFixed(2)}%</span>
                </span>
                <input type="range" min={10} max={300} step={10} value={slippage} onChange={(e) => setSlippage(Number(e.target.value))} />
              </label>
              <label className="flex flex-col gap-2">
                <span className="flex justify-between font-medium">
                  Initial deposit <span className="text-muted">{fmtUsd(deposit)}</span>
                </span>
                <input type="range" min={10} max={1250} step={10} value={deposit} onChange={(e) => setDeposit(Number(e.target.value))} />
              </label>
              <label className="flex items-center justify-between rounded-xl border border-line bg-white px-3 py-2.5">
                <span>
                  Auto-rebalance keeper
                  <span className="block text-xs text-muted">Can only swap inside the basket, never withdraw</span>
                </span>
                <input type="checkbox" checked={keeper} onChange={() => setKeeper(!keeper)} className="size-4" />
              </label>
            </div>
          )}

          {tab === "Style" && (
            <div className="flex flex-col gap-4 text-sm">
              <label className="flex flex-col gap-2">
                <span className="font-medium">Name</span>
                <input value={name} onChange={(e) => setName(e.target.value)} className="rounded-lg border border-line bg-white px-3 py-2 outline-none" />
              </label>
              <div className="flex flex-col gap-2">
                <span className="font-medium">Background</span>
                <div className="flex flex-wrap gap-2">
                  {BACKGROUNDS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setBg(c)}
                      aria-label={`Background ${c}`}
                      className={`size-9 rounded-lg border-2 ${bg === c ? "border-ink" : "border-transparent"}`}
                      style={{ background: c }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 rounded-2xl bg-panel p-4">
          <h3 className="font-medium">ETF overview</h3>
          <div className="flex gap-3">
            <div className="relative size-20 shrink-0 overflow-hidden rounded-xl [container-type:inline-size]" style={{ background: bg }}>
              {art ? <Image src={art.image} alt="" fill sizes="80px" className="object-cover" /> : <CoinStack allocation={allocation.filter((a) => a.weight > 0)} />}
            </div>
            <dl className="grid flex-1 grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              <dt className="text-muted">Name</dt>
              <dd className="truncate">{name}</dd>
              <dt className="text-muted">Vault</dt>
              <dd className="truncate font-mono">{NEXT_ID}.torch.near</dd>
              <dt className="text-muted">Tokens</dt>
              <dd className="truncate">{allocation.map((a) => TOKENS[a.token].symbol).join(", ") || "—"}</dd>
              <dt className="text-muted">Rebalance</dt>
              <dd>
                {rebalance} · {(slippage / 100).toFixed(2)}%
              </dd>
              <dt className="text-muted">Deposit</dt>
              <dd>{fmtUsd(deposit)}</dd>
            </dl>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            {["Save draft", "Backtest", "Share"].map((l) => (
              <button key={l} className="btn-line bg-white py-2 text-muted hover:text-text">
                {l}
              </button>
            ))}
          </div>
          <button
            disabled={!valid}
            onClick={() => {
              setMinted(true);
              setStep(5);
            }}
            className="btn-ink py-3"
          >
            {valid ? "Mint ETF NFT" : "Weights must total 100%"}
          </button>
          {minted && (
            <p className="rounded-lg border border-up/40 bg-up/10 px-3 py-2 text-xs text-up">
              Mock mint: {NEXT_ID}.torch.near would be created and funded with {fmtUsd(deposit)}. Contracts are not deployed yet.
            </p>
          )}
        </div>
      </aside>
    </div>
    </>
  );
}
