"use client";

import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BasketArt } from "@/components/basket-art";
import { Artwork } from "@/components/etf-card";
import { Embers } from "@/components/embers";
import { GachaMachine, type GachaHandle } from "@/components/gacha-machine";
import { Icon3D, Sym } from "@/components/icons";
import { Topbar } from "@/components/navbar";
import { TxLink } from "@/components/tx-sheet";
import { Avatar, Money, NearAmount } from "@/components/ui";
import { sfxPop, sfxReveal, sfxShake, startMusic, stopMusic } from "@/lib/gacha-audio";
import { COLLECTION, GACHA, ftById } from "@/lib/contracts";
import { RARITY, RECENT_PULLS, TOKENS, getEtf, type Allocation, type Rarity } from "@/lib/mock";
import * as near from "@/lib/near-tx";
import { useNear } from "@/providers/near-provider";

type Pull = { id: string; rarity: Rarity; name: string; bg: string; allocation: Allocation[]; valueUsd: number };
type Item = { token: string; amount: string };
type Basket = { name: string; category: string; bg: string; items: Item[] };
type Config = { price_per_pull: string; pity: number; tiers: { rarity: string; weight_bps: number; baskets: Basket[] }[] };

const TIERS = Object.keys(RARITY) as Rarity[];
const isRarity = (r: unknown): r is Rarity => typeof r === "string" && r in RARITY;
const best = (rs: Rarity[]) => [...rs].sort((a, b) => TIERS.indexOf(b) - TIERS.indexOf(a))[0];
// INTERFACES defaults until get_config loads: 0.1 NEAR per pull, pity 50.
const DEFAULT_PRICE = "100000000000000000000000";
const DEFAULT_PITY = 50;

/** Basket value at mock prices (testnet tokens have no market). */
const usdOf = (items: Item[]) =>
  items.reduce((s, it) => {
    const ft = ftById(it.token);
    return ft ? s + near.fromUnits(it.amount, ft.decimals) * TOKENS[ft.key].price : s;
  }, 0);
const equalWeights = (tokens: string[]): Allocation[] =>
  tokens.flatMap((t) => ftById(t)?.key ?? []).map((key, i, all) => ({ token: key, weight: Math.floor(100 / all.length) + (i === 0 ? 100 % all.length : 0) }));

/**
 * The minted vaults from the pull's `gacha_pull` events (logged by the gacha only). Wallets that return
 * before the detached mints resolve get one re-read of the tx with all receipts.
 */
async function readPulls(outs: near.Outcome[], account: string, config: Config | undefined): Promise<Pull[]> {
  let evs = near.events(outs, "gacha_pull", { from: GACHA });
  if (!evs.length) evs = near.events([await near.txWithReceipts(outs[0].transaction.hash, account)], "gacha_pull", { from: GACHA });
  return Promise.all(
    evs
      .filter((e) => e.player_id === account)
      .map(async (e): Promise<Pull> => {
        const id = String(e.token_id);
        const rarity = isRarity(e.rarity) ? e.rarity : "Common";
        const token = await near.view<{ metadata?: { title?: string; extra?: string } } | null>(COLLECTION, "nft_token", { token_id: id }).catch(() => null);
        let extra: { basket?: { token: string; weight: number }[]; bg?: string } = {};
        try {
          extra = JSON.parse(token?.metadata?.extra ?? "{}");
        } catch {}
        const name = token?.metadata?.title ?? `Vault #${id}`;
        const basket = config?.tiers.find((t) => t.rarity === rarity)?.baskets.find((b) => name.startsWith(`${b.name} ·`));
        const allocation = (extra.basket ?? []).flatMap((b) => {
          const ft = ftById(b.token);
          return ft ? [{ token: ft.key, weight: b.weight }] : [];
        });
        return { id, rarity, name, bg: extra.bg ?? basket?.bg ?? "#e5c8ff", allocation: allocation.length ? allocation : equalWeights(basket?.items.map((i) => i.token) ?? []), valueUsd: basket ? usdOf(basket.items) : 0 };
      }),
  );
}

export function Gacha() {
  const machine = useRef<GachaHandle>(null);
  const { accountId, wallet, signIn } = useNear();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const config = near.useView<Config>(GACHA, "get_config").data;
  const pity = near.useView<number>(accountId ? GACHA : null, "get_pity", { account_id: accountId }, nonce).data ?? 0;
  const PITY = config?.pity ?? DEFAULT_PITY;
  const priceYocto = config?.price_per_pull ?? DEFAULT_PRICE;
  const price = near.fromUnits(priceYocto, 24);
  // Drop rates and baskets per tier from get_config; mock rates until it loads.
  const tierOf = (t: Rarity) => config?.tiers.find((x) => x.rarity === t);
  const rate = (t: Rarity) => (config ? (tierOf(t)?.weight_bps ?? 0) / 10_000 : RARITY[t].rate);
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

  // The machine shakes for as long as the wallet takes; the capsule color comes from the real result.
  const pull = async (n: 1 | 10) => {
    if (busy) return;
    if (!wallet || !accountId) return signIn();
    setResult(null);
    setError(null);
    setBusy(true);
    setPhase("rolling");
    if (sound) {
      startMusic();
      sfxShake(1.3);
    }
    const results = near.send(wallet, [near.pullTx(n, priceYocto)], { partial: true }).then((outs) => {
      setHash(outs[0].transaction.hash);
      return readPulls(outs, accountId, config);
    });
    try {
      await machine.current?.pull(
        results.then((pulls) => {
          if (!pulls.length) throw new Error("No vault was minted: the treasury could not cover this pull, so your NEAR was refunded.");
          return RARITY[best(pulls.map((p) => p.rarity))].color;
        }),
      );
      pending.current = await results;
      setPhase("ready");
    } catch (e) {
      setError(near.walletError(e));
      setPhase("idle");
      setBusy(false);
      if (sound) stopMusic();
    } finally {
      setNonce((x) => x + 1); // re-read pity
    }
  };

  const crack = async () => {
    if (phase !== "ready" || !pending.current) return;
    const pulls = pending.current;
    if (sound) sfxPop();
    setPhase("flash");
    await machine.current?.crack();
    if (sound) sfxReveal(TIERS.indexOf(best(pulls.map((p) => p.rarity))) as 0 | 1 | 2 | 3);
    setResult(pulls);
    setPhase("idle");
    setBusy(false);
  };

  // nothing behind the reveal needs to render; pausing the 3D scene keeps the reveal smooth
  useEffect(() => {
    machine.current?.pause(!!result);
  }, [result]);

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

          {/* HUD: mono type, hairlines, no pills */}
          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-6 px-6 pt-5 font-mono text-[11px] uppercase tracking-[0.14em] text-white/70">
            <span className="flex flex-col gap-1">
              <span className="flex items-center gap-2 text-white">
                <span className="relative flex size-1.5">
                  <span className="absolute inset-0 animate-ping rounded-full bg-[#ff8a00]" />
                  <span className="relative size-1.5 rounded-full bg-[#ff8a00]" />
                </span>
                Live · 1,284 pulls today
              </span>
              <span className="text-white/40">Vault machine Nº 01 · {price} NEAR / pull</span>
            </span>
            <span className="flex flex-col items-end gap-1.5">
              <span>
                Pity <span className="text-white">{String(pity).padStart(2, "0")}</span>/{PITY}
              </span>
              <span className="flex gap-[2px]" aria-label={`${pity} of ${PITY} pulls to a guaranteed Legendary`}>
                {Array.from({ length: PITY }, (_, i) => (
                  <span key={i} className={`h-2.5 w-[3px] rounded-[1px] transition-colors ${i < pity ? "bg-[#ff8a00]" : "bg-white/15"}`} />
                ))}
              </span>
              <span className="text-white/40">Legendary in {PITY - pity}</span>
            </span>
          </div>

          <AnimatePresence>
            {phase === "rolling" && <Seed key="seed" />}
            {phase === "ready" && (
              <motion.button
                key="crack"
                onClick={crack}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-[5] flex cursor-pointer items-start justify-center bg-black/35 pt-[16%]"
                aria-label="Release the flame"
              >
                <motion.span animate={{ opacity: [0.45, 1, 0.45] }} transition={{ repeat: Infinity, duration: 1.6 }} className="font-mono text-[12px] uppercase tracking-[0.3em] text-white">
                  Tap to release the flame
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
                <Icon3D name="gift" size={22} /> Pull ×1 · <NearAmount amount={price} />
              </button>
              <button
                onClick={() => pull(10)}
                disabled={busy}
                className="flex h-14 items-center gap-2 rounded-full bg-[#ff8a00] px-7 text-[16px] font-semibold text-white shadow-[0_10px_30px_-10px_#ff8a00] transition active:scale-95 disabled:opacity-60"
              >
                Pull ×10 · <NearAmount amount={Math.round(price * 9 * 1e4) / 1e4} />
                <span className="rounded-full bg-white/25 px-2 py-0.5 text-[11px]">−10%</span>
              </button>
            </div>
            <span className="flex items-center gap-3 text-[12px] text-white/50">
              {error ? (
                <span role="alert" className="max-w-[420px] text-[#ff9b8a]">
                  {error}
                </span>
              ) : busy ? (
                phase === "rolling" ? "Confirm in your wallet…" : "Pulling…"
              ) : accountId ? (
                "Each capsule mints a real vault NFT on testnet"
              ) : (
                "Connect a wallet to pull"
              )}
              <button onClick={toggleSound} aria-label={sound ? "Mute sound" : "Turn sound on"} className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-white/80 hover:bg-white/20">
                <Sym name={sound ? "sound" : "mute"} size={13} weight="bold" /> {sound ? "Sound on" : "Muted"}
              </button>
            </span>
          </div>

          <AnimatePresence>{result && <Reveal pulls={result} hash={hash} onClaim={claim} onAgain={() => pull(result.length === 10 ? 10 : 1)} />}</AnimatePresence>
        </section>

        {/* side */}
        <aside className="flex flex-col gap-4">
          <section className="card flex flex-col gap-4 p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="text-[18px] font-bold">Drop rates</h2>
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Odds per capsule</span>
            </div>

            {/* the whole distribution at a glance */}
            <div className="flex h-2.5 gap-[3px] overflow-hidden rounded-full">
              {TIERS.map((t) => (
                <span key={t} title={`${t} ${(rate(t) * 100).toFixed(0)}%`} style={{ flexGrow: rate(t), background: RARITY[t].color }} className="min-w-[6px] first:rounded-l-full last:rounded-r-full" />
              ))}
            </div>

            <ul className="flex flex-col gap-1.5">
              {TIERS.slice()
                .reverse()
                .map((t) => {
                  const r = RARITY[t];
                  const legendary = t === "Legendary";
                  const baskets = tierOf(t)?.baskets ?? [];
                  const values = baskets.map((b) => usdOf(b.items));
                  const [lo, hi] = values.length ? [Math.min(...values), Math.max(...values)] : r.vault;
                  return (
                    <li
                      key={t}
                      className="relative flex items-center gap-3 overflow-hidden rounded-[16px] px-2.5 py-2.5"
                      style={legendary ? { background: `${r.color}14`, boxShadow: `inset 0 0 0 1px ${r.color}55` } : undefined}
                    >
                      <span className="grid size-10 shrink-0 place-items-center rounded-[12px]" style={{ background: `${r.color}1a` }}>
                        <Icon3D name={t.toLowerCase() as "common" | "rare" | "epic" | "legendary"} size={28} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="text-[15px] font-semibold" style={{ color: r.color }}>
                            {t}
                          </span>
                          <span className="font-mono text-[14px] font-semibold tabular-nums">{(rate(t) * 100).toFixed(rate(t) < 0.1 ? 1 : 0)}%</span>
                        </span>
                        <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-fill">
                          <span className="block h-full rounded-full" style={{ width: `${(rate(t) / Math.max(...TIERS.map(rate), 0.0001)) * 100}%`, background: r.color }} />
                        </span>
                        <span className="mt-1.5 flex items-center justify-between gap-2 text-[12px] text-muted">
                          <span>
                            <Money value={lo} />–<Money value={hi} /> inside
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="flex -space-x-1.5">
                              {baskets.map((b) => (
                                <span key={b.name} title={b.name} className="relative block size-[18px] overflow-hidden rounded-full ring-2 ring-surface" style={{ background: b.bg }}>
                                  <BasketArt allocation={equalWeights(b.items.map((i) => i.token))} />
                                </span>
                              ))}
                            </span>
                            <span className="font-mono">{rate(t) ? `1 in ${Math.round(1 / rate(t))}` : "—"}</span>
                          </span>
                        </span>
                      </span>
                    </li>
                  );
                })}
            </ul>
          </section>

          <section className="card flex flex-col gap-3 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-[18px] font-bold">Your capsules</h2>
              <span className="text-[13px] text-muted">{collected.length}</span>
            </div>
            {collected.length ? (
              <div className="grid grid-cols-5 gap-2">
                {collected.slice(0, 15).map((p) => (
                  <Link key={p.id} href={`/etf/${p.id}`} title={`${p.name} #${p.id}`} className="relative aspect-square overflow-hidden rounded-[12px]" style={{ background: p.bg, boxShadow: `inset 0 0 0 2px ${RARITY[p.rarity].color}` }}>
                    <BasketArt allocation={p.allocation} />
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

/** Scrambling hex seed with a hairline progress, like a block hash resolving. */
function Seed() {
  const [hex, setHex] = useState("0x0000000000000000");
  useEffect(() => {
    const id = setInterval(() => setHex("0x" + Array.from({ length: 16 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("")), 60);
    return () => clearInterval(id);
  }, []);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="pointer-events-none absolute left-1/2 top-[18%] flex w-[280px] -translate-x-1/2 flex-col items-center gap-2 font-mono uppercase">
      <span className="text-[10px] tracking-[0.3em] text-white/50">Rolling seed</span>
      <span className="text-[15px] tracking-[0.08em] text-white tabular-nums">{hex}</span>
      <span className="relative h-px w-full bg-white/15">
        <motion.span className="absolute inset-y-0 left-0 bg-[#ff8a00] shadow-[0_0_8px_#ff8a00]" initial={{ width: "0%" }} animate={{ width: "100%" }} transition={{ duration: 2.6, ease: "easeInOut" }} />
      </span>
    </motion.div>
  );
}

function Reveal({ pulls, hash, onClaim, onAgain }: { pulls: Pull[]; hash: string | null; onClaim: () => void; onAgain: () => void }) {
  const single = pulls.length === 1;
  const total = pulls.reduce((s, p) => s + p.valueUsd, 0);
  const top = best(pulls.map((p) => p.rarity));
  const c = RARITY[top].color;
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-10 grid place-items-center overflow-hidden bg-[#0b0806]/95 p-6">
      {/* god rays, fire glow from below, embers */}
      <div aria-hidden className="absolute inset-0 overflow-hidden opacity-40 [mask-image:radial-gradient(circle_at_50%_50%,#000_10%,transparent_60%)]">
        <div
          className="absolute left-1/2 top-1/2 size-[120vmax] -translate-x-1/2 -translate-y-1/2 will-change-transform [animation:rays_40s_linear_infinite]"
          style={{ background: `repeating-conic-gradient(from 0deg, ${c}55 0deg 4deg, transparent 4deg 14deg)` }}
        />
      </div>
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-1/2 bg-[radial-gradient(60%_80%_at_50%_100%,#ff5a0088,#ff8a0022_45%,transparent_70%)]" />
      <Embers color={top === "Legendary" ? "#ffb347" : "#ff7a1a"} count={top === "Legendary" ? 80 : 45} className="absolute inset-0 size-full" />

      <div className="relative flex w-full max-w-[760px] flex-col items-center gap-5">
        <motion.div initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.15 }} className="flex flex-col items-center gap-1">
          <span className="font-mono text-[11px] uppercase tracking-[0.3em] text-white/50">{single ? "You pulled" : `${pulls.length} flames released`}</span>
          <span className="title-chunky flex items-center gap-2 text-[34px] leading-none" style={{ color: c, textShadow: `0 0 24px ${c}88` }}>
            <Icon3D name={top.toLowerCase() as "common" | "rare" | "epic" | "legendary"} size={34} /> {top}
          </span>
        </motion.div>

        {single ? (
          <Card p={pulls[0]} big />
        ) : (
          <div className={`grid w-full gap-4 ${pulls.length > 4 ? "grid-cols-5" : "grid-cols-4"}`}>
            {pulls.map((p, i) => (
              <Card key={p.id} p={p} delay={0.2 + i * 0.09} />
            ))}
          </div>
        )}

        <div className="flex items-center gap-4 font-mono text-[12px] uppercase tracking-[0.12em] text-white/55">
          <span>
            Vault value <Money value={total} className="text-[14px] text-white" />
          </span>
          <span className="h-3 w-px bg-white/20" />
          <span>{single ? `${pulls[0].allocation.length} tokens inside` : `${pulls.filter((p) => p.rarity !== "Common").length} rare+`}</span>
          {hash && (
            <>
              <span className="h-3 w-px bg-white/20" />
              <TxLink hash={hash} className="text-white/70" />
            </>
          )}
        </div>

        <div className="flex gap-2">
          <button onClick={onAgain} className="h-12 rounded-full border border-white/15 bg-white/5 px-6 text-[15px] font-semibold text-white transition hover:bg-white/10 active:scale-95">
            Pull again
          </button>
          <button onClick={onClaim} className="h-12 rounded-full bg-[#ff8a00] px-7 text-[15px] font-semibold text-white shadow-[0_0_0_1px_#ffb766,0_10px_40px_-8px_#ff6a00] transition hover:brightness-110 active:scale-95">
            Claim to My Vaults
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function Card({ p, big = false, delay = 0.1 }: { p: Pull; big?: boolean; delay?: number }) {
  const c = RARITY[p.rarity].color;
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  return (
    <motion.div
      initial={{ rotateY: 180, scale: 0.7, y: 30 }}
      animate={{ rotateY: 0, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 160, damping: 16, delay }}
      onPointerMove={(e) => {
        if (!big) return;
        const r = e.currentTarget.getBoundingClientRect();
        setTilt({ x: ((e.clientY - r.top) / r.height - 0.5) * -14, y: ((e.clientX - r.left) / r.width - 0.5) * 14 });
      }}
      onPointerLeave={() => setTilt({ x: 0, y: 0 })}
      className={`relative [perspective:900px] ${big ? "w-[300px]" : "w-full"}`}
    >
      <motion.div animate={{ rotateX: tilt.x, rotateY: tilt.y }} transition={{ type: "spring", stiffness: 200, damping: 20 }} className="relative [transform-style:preserve-3d]">
        {/* back: torch sigil, visible during the flip */}
        <div className="absolute inset-0 grid place-items-center rounded-[22px] bg-[radial-gradient(circle_at_50%_40%,#ff8a00,#7a1d00_60%,#1a0a04)] [backface-visibility:hidden] [transform:rotateY(180deg)]">
          <Icon3D name="fire" size={big ? 84 : 32} className="drop-shadow-[0_0_20px_#ff8a00]" />
        </div>
        {/* front */}
        <div className={`burn-frame flex flex-col gap-2 rounded-[22px] bg-[#140d09] p-2 [backface-visibility:hidden] ${big ? "" : "burn-still"}`} style={{ "--rarity": c } as React.CSSProperties}>
          <div className="grain relative aspect-square overflow-hidden rounded-[16px]" style={{ background: p.bg }}>
            <BasketArt allocation={p.allocation} />
            <span className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[#ff5a0055] to-transparent" />
            <span
              className={`absolute left-2 top-2 flex items-center gap-1 rounded-full bg-black/60 font-bold uppercase tracking-[0.12em] backdrop-blur-sm ${big ? "px-2.5 py-1 text-[11px]" : "px-1.5 py-0.5 text-[8px]"}`}
              style={{ color: c }}
            >
              <Icon3D name={p.rarity.toLowerCase() as "common" | "rare" | "epic" | "legendary"} size={big ? 14 : 10} /> {p.rarity}
            </span>
          </div>
          <div className={big ? "px-2 pb-2" : "px-1 pb-1"}>
            <span className={`block truncate font-semibold text-white ${big ? "text-[18px]" : "text-[11px]"}`}>{p.name}</span>
            {big ? (
              <div className="mt-2 grid grid-cols-3 border-t border-white/10 pt-2 font-mono text-[10px] uppercase tracking-[0.08em] text-white/45">
                <span>
                  Value
                  <Money value={p.valueUsd} className="block text-[14px] normal-case tracking-normal text-white" />
                </span>
                <span>
                  Tokens<b className="block text-[14px] font-semibold text-white">{p.allocation.length}</b>
                </span>
                <span className="text-right">
                  Token<b className="block text-[14px] font-semibold text-white">#{p.id}</b>
                </span>
              </div>
            ) : (
              <span className="font-mono text-[9px] text-white/45">#{p.id}</span>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
