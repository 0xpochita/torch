"use client";

import { useEffect, useState } from "react";
import { Sym } from "@/components/icons";
import { ConnectPrompt, Topbar } from "@/components/navbar";
import { TxLink } from "@/components/tx-sheet";
import { TokenIcon } from "@/components/ui";
import { FTS, MOCK_FTS, WNEAR } from "@/lib/contracts";
import { TOKENS } from "@/lib/mock";
import * as near from "@/lib/near-tx";
import { useNear } from "@/providers/near-provider";

/* Test tokens: each mock NEP-141 pays 0.1 once an hour (faucet), wNEAR comes from wrapping NEAR. */

const FT_IDS = FTS.map((f) => f.id);
const MOCK_IDS = MOCK_FTS.map((f) => f.id);
const MIN = 60_000;

const wait = (at: number, now: number) => {
  const m = Math.ceil((at - now) / MIN);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
};

export function Faucet() {
  const { accountId, wallet, balance } = useNear();
  const [nonce, setNonce] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [step, setStep] = useState<string | null>(null); // wallets without batch signing: one prompt per claim
  const [error, setError] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const [wrap, setWrap] = useState("1");
  const [now, setNow] = useState(0); // 0 until mounted: the clock is not read during prerender

  const balances = near.useFtBalances(accountId, FT_IDS, nonce);
  const nextAt = near.useEach<number>(accountId ? MOCK_IDS : null, "faucet_next_at", { account_id: accountId }, nonce);

  // cooldowns tick down without re-reading the chain
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick);
    const id = setInterval(tick, 30_000);
    return () => (clearTimeout(first), clearInterval(id));
  }, []);

  const cooldowns = now ? nextAt : null;
  const ready = MOCK_FTS.filter((f) => cooldowns && (cooldowns[f.id] ?? 0) <= now);

  const run = async (label: string, txs: near.Tx[]) => {
    if (!wallet || !txs.length) return;
    setBusy(label);
    setStep(null);
    setError(null);
    try {
      const outs = await near.send(wallet, txs, { onStep: (i, n) => setStep(`${i + 1} of ${n}`) });
      setHash(outs[outs.length - 1].transaction.hash);
    } catch (e) {
      setError(near.walletError(e));
    } finally {
      setBusy(null);
      setNow(Date.now());
      setNonce((n) => n + 1);
    }
  };

  const wrapRaw = (() => {
    try {
      return near.toUnits(wrap, 24);
    } catch {
      return "0";
    }
  })();

  return (
    <>
      <Topbar title="Faucet" subtitle="Free testnet tokens to build and fund vaults. Each token pays 0.1 once an hour." />

      {!accountId ? (
        <ConnectPrompt sub="Connect a testnet wallet to claim test tokens. Every claim is a real testnet transaction you approve." />
      ) : (
        <div className="grid gap-4 pt-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section className="card flex flex-col gap-3 p-5">
            <div className="flex items-center gap-3">
              <h2 className="flex-1 text-[18px] font-bold">Mock tokens</h2>
              <button onClick={() => run("all", ready.map((f) => near.faucetTx(f.id)))} disabled={!!busy || !ready.length} className="btn-ink h-10 px-4 text-[14px]">
                {busy === "all" ? (step ? `Confirm ${step} in your wallet…` : "Confirm in your wallet…") : `Claim all ready · ${ready.length}`}
              </button>
            </div>
            <ul className="grid gap-1 sm:grid-cols-2">
              {MOCK_FTS.map((f) => {
                const t = TOKENS[f.key];
                const at = cooldowns?.[f.id] ?? 0;
                const cooling = at > now;
                return (
                  <li key={f.id} className="flex items-center gap-3 rounded-[16px] px-2 py-2 hover:bg-fill">
                    <TokenIcon token={f.key} size={36} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-semibold">{t.symbol}</span>
                      <span className="block truncate font-mono text-[11px] text-muted">{f.id}</span>
                    </span>
                    <span className="text-right text-[13px] tabular-nums">
                      <span className="block font-semibold">{balances ? near.formatUnits(balances[f.id] ?? "0", f.decimals) : "…"}</span>
                      <span className={`block text-[11px] ${cooling ? "text-muted" : "text-up-text"}`}>{!cooldowns ? "…" : cooling ? `in ${wait(at, now)}` : "ready"}</span>
                    </span>
                    <button
                      onClick={() => run(f.id, [near.faucetTx(f.id)])}
                      disabled={!!busy || !cooldowns || cooling}
                      aria-label={`Claim 0.1 ${t.symbol}`}
                      className="grid size-9 shrink-0 place-items-center rounded-full bg-fill transition hover:bg-line disabled:opacity-40"
                    >
                      {busy === f.id ? <span className="size-3.5 animate-spin rounded-full border-2 border-text border-t-transparent" /> : <Sym name="down" size={16} weight="bold" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          <aside className="flex flex-col gap-4">
            <section className="card flex flex-col gap-3 p-5">
              <div className="flex items-center gap-3">
                <TokenIcon token="NEAR" size={36} />
                <div className="flex-1">
                  <h2 className="text-[18px] font-bold">Wrap NEAR</h2>
                  <p className="text-[13px] text-muted">Baskets hold NEAR as wNEAR ({WNEAR}).</p>
                </div>
              </div>
              <label className="flex items-center rounded-[14px] bg-fill px-3 focus-within:ring-2 focus-within:ring-tint/40">
                <input inputMode="decimal" value={wrap} onChange={(e) => /^\d*\.?\d*$/.test(e.target.value) && setWrap(e.target.value)} className="w-full bg-transparent py-3 text-[18px] font-semibold tabular-nums outline-none" aria-label="NEAR to wrap" />
                <span className="text-[13px] text-muted">NEAR</span>
              </label>
              <div className="flex justify-between text-[13px] text-muted">
                <span>Wallet {balance === null ? "…" : balance.toFixed(2)} NEAR</span>
                <span>wNEAR {balances ? near.formatUnits(balances[WNEAR] ?? "0", 24) : "…"}</span>
              </div>
              <button onClick={() => run("wrap", [near.wrapTx(wrapRaw)])} disabled={!!busy || wrapRaw === "0" || (balance !== null && Number(wrap) > balance)} className="btn-ink h-12 text-[15px]">
                {busy === "wrap" ? "Confirm in your wallet…" : "Wrap"}
              </button>
            </section>

            {(error || hash) && (
              <section className={`flex items-start gap-3 rounded-[20px] p-4 text-[13px] ${error ? "bg-down/10 text-down" : "bg-up/12 text-up-text"}`} role={error ? "alert" : "status"}>
                <Sym name={error ? "close" : "check"} size={16} weight="bold" className="mt-0.5 shrink-0" />
                <span className="min-w-0 flex-1 break-words">{error ? <>Not sent. {error}</> : "Done. Balances refresh from the chain."}</span>
                {!error && hash && <TxLink hash={hash} className="text-up-text" />}
              </section>
            )}

            <p className="px-1 text-[13px] text-muted">Testnet NEAR itself comes from your wallet or the NEAR testnet faucet. Claims register your account on the token first (0.00125 NEAR, refunded if already registered).</p>
          </aside>
        </div>
      )}
    </>
  );
}
