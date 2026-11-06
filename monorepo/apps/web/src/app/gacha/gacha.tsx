"use client";

import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BasketArt } from "@/components/basket-art";
import { Artwork } from "@/components/etf-card";
import { GachaMachine, type GachaHandle } from "@/components/gacha-machine";
import { Sym } from "@/components/icons";
import { Topbar } from "@/components/navbar";
import { Avatar, Money, NearAmount } from "@/components/ui";
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
  // idle → rolling (machine shakes) → ready (capsule floating, tap to crack) → flash → result
  const [phase, setPhase] = useState<"idle" | "rolling" | "ready" | "flash">("idle");
  const pending = useRef<Pull[] | null>(null);

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
    setPhase("rolling");
    let p = pity;
    const pulls = Array.from({ length: n }, () => {
      p += 1;
      const hit = roll(p >= PITY);
      if (hit.rarity === "Legendary") p = 0;
      return hit;
    });
    pending.current = pulls;
    const best = [...pulls].sort((a, b) => TIERS.indexOf(b.rarity) - TIERS.indexOf(a.rarity))[0];
    if (sound) {
      startMusic();
      sfxShake(1.3);
    }
    await machine.current?.pull(RARITY[best.rarity].color);
    setPity(p);
    setPhase("ready");
  };

  const crack = async () => {
    if (phase !== "ready" || !pending.current) return;
    const pulls = pending.current;
    const best = [...pulls].sort((a, b) => TIERS.indexOf(b.rarity) - TIERS.indexOf(a.rarity))[0];
    if (sound) sfxPop();
    setPhase("flash");
    await machine.current?.crack();
    if (sound) sfxReveal(TIERS.indexOf(best.rarity) as 0 | 1 | 2 | 3);
    setResult(pulls);
    setPhase("idle");
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
        <section className="relative min-h-[560px] overflow-hidden rounded-[28px] bg-[#0d0a08] text-[#f5f5f7] xl:h-[calc(100dvh-116px)]">
          <Image src="/brand/gacha-banner.png" alt="" fill priority sizes="(min-width: 1280px) 70vw, 100vw" className="object-cover object-[50%_62%]" />
          <div className="absolute inset-0 bg-[radial-gradient(70%_60%_at_50%_45%,transparent,#0d0a08cc)]" />
          <GachaMachine ref={machine} className="absolute inset-0" />

          {/* slim glass chrome, nothing shouting */}
          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-5">
            <span className="flex items-center gap-2 rounded-full bg-black/45 py-1.5 pl-1.5 pr-3.5 text-[13px] font-semibold backdrop-blur-md">
              <span className="grid size-7 place-items-center rounded-full bg-[#ff8a00] text-white">
                <Sym name="gift" size={14} weight="bold" />
              </span>
              Mystery vault
              <span className="font-normal text-white/55">· {PITY} pulls to a Legendary</span>
            </span>
            <span className="flex w-[200px] flex-col gap-1.5 rounded-[16px] bg-black/45 px-3.5 py-2.5 backdrop-blur-md">
              <span className="flex justify-between text-[12px] text-white/60">
                Pity <b className="font-semibold text-white">{pity}/{PITY}</b>
              </span>
              <span className="h-1 overflow-hidden rounded-full bg-white/10">
                <motion.span className="block h-full rounded-full bg-[#ff8a00]" animate={{ width: `${(pity / PITY) * 100}%` }} />
              </span>
            </span>
          </div>

          <AnimatePresence>
            {phase === "rolling" && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute left-1/2 top-20 w-[300px] -translate-x-1/2 rounded-[14px] bg-black/55 px-4 py-3 backdrop-blur-md">
                <span className="flex items-center gap-2 text-[13px] font-semibold">
                  <Sym name="clock" size={14} weight="bold" className="text-[#ff8a00]" /> Rolling a fair seed…
                </span>
                <span className="mt-2 block h-1 overflow-hidden rounded-full bg-white/10">
                  <motion.span className="block h-full rounded-full bg-[#ff8a00]" initial={{ width: "0%" }} animate={{ width: "100%" }} transition={{ duration: 2.6, ease: "easeInOut" }} />
                </span>
              </motion.div>
            )}
            {phase === "ready" && (
              <motion.button
                key="crack"
                onClick={crack}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-[5] flex cursor-pointer items-start justify-center bg-black/35 pt-[16%]"
                aria-label="Crack the capsule"
              >
                <motion.span animate={{ opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 1.6 }} className="text-[13px] font-semibold uppercase tracking-[0.2em] text-white">
                  Tap to crack the capsule
                </motion.span>
              </motion.button>
            )}
            {phase === "flash" && (
              <motion.div key="flash" initial={{ opacity: 0 }} animate={{ opacity: [0, 0, 1, 0] }} transition={{ duration: 1.1, times: [0, 0.35, 0.6, 1] }} className="pointer-events-none absolute inset-0 z-[6] bg-white" />
            )}
          </AnimatePresence>

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
              {busy ? "Pulling…" : "Mock pulls · no NEAR is spent"}
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
  const best = pulls.map((p) => p.rarity).sort((a, b) => TIERS.indexOf(b) - TIERS.indexOf(a))[0];
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-10 grid place-items-center p-6 backdrop-blur-md"
      style={{ background: `radial-gradient(60% 55% at 50% 45%, ${RARITY[best].color}55, #0d0a08ee 70%)` }}
    >
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
