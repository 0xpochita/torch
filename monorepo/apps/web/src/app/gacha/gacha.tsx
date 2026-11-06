"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BasketArt } from "@/components/basket-art";
import { Artwork } from "@/components/etf-card";
import { GachaMachine, type GachaHandle } from "@/components/gacha-machine";
import { Sym } from "@/components/icons";
import { Topbar } from "@/components/navbar";
import { Avatar, Money, NearAmount, Title } from "@/components/ui";
import { sfxPop, sfxReveal, sfxShake, startMusic, stopMusic } from "@/lib/gacha-audio";
import { GACHA_POOL, GACHA_PRICE_NEAR, PITY, RARITY, RECENT_PULLS, getEtf, type Etf, type Rarity } from "@/lib/mock";

type Pull = { id: string; rarity: Rarity; etf: Etf; serial: number; valueUsd: number };
const TIERS = Object.keys(RARITY) as Rarity[];

// ponytail: client-side roll for the mock; the contract rolls with env::random_seed() at mint time
function roll(forceLegendary: boolean): Pull {
  let r = Math.random();
  const rarity = forceLegendary ? "Legendary" : TIERS.find((t) => (r -= RARITY[t].rate) < 0) ?? "Common";
  const pool = GACHA_POOL[rarity];
  const etf = getEtf(pool[Math.floor(Math.random() * pool.length)])!;
  const [lo, hi] = RARITY[rarity].vault;
  return { id: crypto.randomUUID(), rarity, etf, serial: 100 + Math.floor(Math.random() * 900), valueUsd: Math.round(lo + Math.random() * (hi - lo)) };
}

export function Gacha() {
  const machine = useRef<GachaHandle>(null);
  const [busy, setBusy] = useState(false);
  const [pity, setPity] = useState(13);
  const [result, setResult] = useState<Pull[] | null>(null);
  const [collected, setCollected] = useState<Pull[]>([]);
  const [sound, setSound] = useState(true);

  // per-viewer preference; storage can throw in private mode
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        if (localStorage.getItem("gacha-sound") === "off") setSound(false);
      } catch {}
    });
    return () => (clearTimeout(t), stopMusic());
  }, []);

  const toggleSound = () => {
    const on = !sound;
    setSound(on);
    if (on) startMusic();
    else stopMusic();
    try {
      localStorage.setItem("gacha-sound", on ? "on" : "off");
    } catch {}
  };

  const pull = async (n: 1 | 10) => {
    if (busy) return;
    setResult(null);
    setBusy(true);
    let p = pity;
    const pulls = Array.from({ length: n }, () => {
      p += 1;
      const hit = roll(p >= PITY);
      if (hit.rarity === "Legendary") p = 0;
      return hit;
    });
    const best = [...pulls].sort((a, b) => TIERS.indexOf(b.rarity) - TIERS.indexOf(a.rarity))[0];
    if (sound) {
      startMusic();
      sfxShake();
      setTimeout(sfxPop, 2600); // capsule opens ~1.5s after it leaves the dome
    }
    await machine.current?.pull(RARITY[best.rarity].color);
    if (sound) sfxReveal(TIERS.indexOf(best.rarity) as 0 | 1 | 2 | 3);
    setPity(p);
    setResult(pulls);
    setBusy(false);
  };

  const claim = () => {
    if (result) setCollected((c) => [...result, ...c]);
    setResult(null);
  };

  return (
    <>
      <Topbar />

      <div className="grid gap-4 pt-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        {/* stage */}
        <section className="grain relative min-h-[560px] overflow-hidden rounded-[28px] bg-[radial-gradient(120%_80%_at_50%_0%,#3a2412,#141210_60%)] text-[#f5f5f7] xl:h-[calc(100dvh-116px)]">
          <GachaMachine ref={machine} className="absolute inset-0" />

          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-4 p-6">
            <div>
              <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#ffb766]">Mystery vault</span>
              <Title size="text-[40px]">Gacha</Title>
              <p className="max-w-[340px] text-[14px] text-white/60">Every capsule mints a real vault NFT with a random basket inside. Rarer capsules hold bigger baskets.</p>
            </div>
            <div className="w-[220px] rounded-[18px] bg-white/8 p-3 backdrop-blur-md">
              <div className="flex justify-between text-[12px] text-white/60">
                <span>Legendary pity</span>
                <span className="font-semibold text-white">
                  {pity}/{PITY}
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                <motion.div className="h-full rounded-full bg-[#ff8a00]" animate={{ width: `${(pity / PITY) * 100}%` }} />
              </div>
              <p className="mt-1.5 text-[11px] text-white/50">Guaranteed in {PITY - pity} pulls</p>
            </div>
          </div>

          <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 p-6">
            <div className="flex gap-2">
              <button
                onClick={() => pull(1)}
                disabled={busy}
                className="flex h-14 items-center gap-2 rounded-full bg-white px-7 text-[16px] font-semibold text-[#121212] transition active:scale-95 disabled:opacity-60"
              >
                <Sym name="gift" size={18} weight="bold" /> Pull ×1 · <NearAmount amount={GACHA_PRICE_NEAR} />
              </button>
              <button
                onClick={() => pull(10)}
                disabled={busy}
                className="flex h-14 items-center gap-2 rounded-full bg-[#ff8a00] px-7 text-[16px] font-semibold text-white shadow-[0_10px_30px_-10px_#ff8a00] transition active:scale-95 disabled:opacity-60"
              >
                Pull ×10 · <NearAmount amount={GACHA_PRICE_NEAR * 9} />
                <span className="rounded-full bg-white/25 px-2 py-0.5 text-[11px]">−10%</span>
              </button>
            </div>
            <span className="flex items-center gap-3 text-[12px] text-white/50">
              {busy ? "Shaking the machine…" : "Mock pulls · no NEAR is spent"}
              <button onClick={toggleSound} aria-label={sound ? "Mute sound" : "Turn sound on"} className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-white/80 hover:bg-white/20">
                <Sym name={sound ? "sound" : "mute"} size={13} weight="bold" /> {sound ? "Sound on" : "Muted"}
              </button>
            </span>
          </div>

          <AnimatePresence>{result && <Reveal pulls={result} onClaim={claim} onAgain={() => pull(result.length === 10 ? 10 : 1)} />}</AnimatePresence>
        </section>

        {/* side */}
        <aside className="flex flex-col gap-4">
          <section className="card flex flex-col gap-3 p-5">
            <h2 className="text-[18px] font-bold">Drop rates</h2>
            {TIERS.slice()
              .reverse()
              .map((t) => (
                <div key={t} className="flex items-center gap-3">
                  <span className="flex -space-x-3">
                    {GACHA_POOL[t].map((id) => (
                      <Artwork key={id} etf={getEtf(id)!} size={36} className="ring-2 ring-surface" />
                    ))}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold" style={{ color: RARITY[t].color }}>
                      {t}
                    </span>
                    <span className="text-[12px] text-muted">
                      ${RARITY[t].vault[0]}–${RARITY[t].vault[1]} inside
                    </span>
                  </span>
                  <span className="text-[15px] font-bold tabular-nums">{(RARITY[t].rate * 100).toFixed(0)}%</span>
                </div>
              ))}
          </section>

          <section className="card flex flex-col gap-3 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-[18px] font-bold">Your capsules</h2>
              <span className="text-[13px] text-muted">{collected.length}</span>
            </div>
            {collected.length ? (
              <div className="grid grid-cols-5 gap-2">
                {collected.slice(0, 15).map((p) => (
                  <Link key={p.id} href={`/etf/${p.etf.id}`} title={`${p.etf.name} #${p.serial} · ${p.rarity}`} className="relative aspect-square overflow-hidden rounded-[12px]" style={{ background: p.etf.bg, boxShadow: `inset 0 0 0 2px ${RARITY[p.rarity].color}` }}>
                    <BasketArt allocation={p.etf.allocation} />
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-muted">Claimed capsules land here and in My Vaults.</p>
            )}
          </section>

          <section className="card flex flex-1 flex-col gap-1 p-5">
            <h2 className="pb-2 text-[18px] font-bold">Recent pulls</h2>
            {RECENT_PULLS.map((r, i) => (
              <div key={i} className="flex items-center gap-3 rounded-[12px] px-1 py-1.5">
                <Avatar account={r.account} size={28} />
                <span className="min-w-0 flex-1 truncate text-[13px]">
                  <span className="font-semibold">{r.account}</span> <span className="text-muted">pulled</span>{" "}
                  <span className="font-semibold" style={{ color: RARITY[r.rarity].color }}>
                    {r.rarity}
                  </span>
                </span>
                <Artwork etf={getEtf(r.etfId)!} size={28} />
                <span className="w-8 text-right text-[12px] text-muted">{r.ago}</span>
              </div>
            ))}
          </section>
        </aside>
      </div>
    </>
  );
}

function Reveal({ pulls, onClaim, onAgain }: { pulls: Pull[]; onClaim: () => void; onAgain: () => void }) {
  const single = pulls.length === 1;
  const total = pulls.reduce((s, p) => s + p.valueUsd, 0);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-10 grid place-items-center bg-black/55 p-6 backdrop-blur-sm">
      <div className="flex w-full max-w-[720px] flex-col items-center gap-5">
        {single ? (
          <Card p={pulls[0]} big />
        ) : (
          <div className="grid w-full grid-cols-5 gap-3">
            {pulls.map((p, i) => (
              <Card key={p.id} p={p} delay={i * 0.08} />
            ))}
          </div>
        )}
        <p className="text-[14px] text-white/70">
          {single ? "Vault inside" : `${pulls.length} vaults, total inside`} <Money value={total} className="font-semibold text-white" />
        </p>
        <div className="flex gap-2">
          <button onClick={onAgain} className="h-12 rounded-full bg-white/12 px-6 text-[15px] font-semibold text-white transition hover:bg-white/20 active:scale-95">
            Pull again
          </button>
          <button onClick={onClaim} className="h-12 rounded-full bg-white px-6 text-[15px] font-semibold text-[#121212] transition active:scale-95">
            Claim to My Vaults
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function Card({ p, big = false, delay = 0 }: { p: Pull; big?: boolean; delay?: number }) {
  const c = RARITY[p.rarity].color;
  return (
    <motion.div
      initial={{ rotateY: 180, scale: 0.8, opacity: 0 }}
      animate={{ rotateY: 0, scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 200, damping: 18, delay }}
      className={`flex flex-col gap-2 rounded-[22px] bg-[#1c1c1e] p-2 [transform-style:preserve-3d] ${big ? "w-[280px]" : "w-full"}`}
      style={{ boxShadow: `0 0 0 2px ${c}, 0 0 ${big ? 60 : 24}px -6px ${c}` }}
    >
      <div className="grain relative aspect-square overflow-hidden rounded-[16px]" style={{ background: p.etf.bg }}>
        <BasketArt allocation={p.etf.allocation} />
      </div>
      <div className={big ? "px-2 pb-2" : "px-1 pb-1"}>
        <span className={`block font-bold uppercase tracking-[0.1em] ${big ? "text-[12px]" : "text-[9px]"}`} style={{ color: c }}>
          {p.rarity}
        </span>
        <span className={`block truncate font-semibold text-white ${big ? "text-[18px]" : "text-[11px]"}`}>
          {p.etf.name} #{p.serial}
        </span>
        {big && <Money value={p.valueUsd} className="text-[13px] text-white/60" />}
      </div>
    </motion.div>
  );
}
