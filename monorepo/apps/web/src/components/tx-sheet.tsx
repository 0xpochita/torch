"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Artwork } from "@/components/etf-card";
import { Sym, type IconName } from "@/components/icons";
import { ConnectPrompt } from "@/components/navbar";
import HoldButton from "@/components/react-bits/HoldButton";
import { ActionCircle, Avatar, Money, NearAmount, Segmented, TokenIcon } from "@/components/ui";
import { useAccount } from "@/providers/near-provider";
import { ETFS, LISTINGS, MY_VAULTS, NEAR_USD, TOKENS, getEtf, type Etf } from "@/lib/mock";

/* One sheet for every vault transaction: review → wallet signature → done. */

export type TxKind = "buy" | "offer" | "accept" | "deposit" | "withdraw" | "transfer";
export type Tx = { kind: TxKind; etfId?: string; listingId?: string; offer?: { from: string; priceNear: number } };

// ponytail: mock fees; the real numbers come from the collection contract (marketplace fee) and NEP-199 payout (royalty)
const MARKET_FEE = 0.02;
const ROYALTY = 0.025;

const META: Record<TxKind, { title: string; icon: IconName; cta: string; done: string }> = {
  buy: { title: "Buy vault", icon: "tag", cta: "Hold to buy", done: "The vault is yours" },
  offer: { title: "Make an offer", icon: "swap", cta: "Place offer", done: "Offer placed" },
  deposit: { title: "Deposit", icon: "down", cta: "Deposit", done: "Deposited" },
  withdraw: { title: "Withdraw", icon: "up", cta: "Withdraw", done: "Withdrawn" },
  transfer: { title: "Transfer vault", icon: "share", cta: "Hold to transfer", done: "Vault sent" },
  accept: { title: "Accept offer", icon: "check", cta: "Hold to accept", done: "Offer accepted" },
};

const Ctx = createContext<(tx: Tx) => void>(() => {});
export const useTx = () => useContext(Ctx);

export function TxProvider({ children }: { children: ReactNode }) {
  const [tx, setTx] = useState<Tx | null>(null);
  return (
    <Ctx.Provider value={setTx}>
      {children}
      <AnimatePresence>{tx && <Sheet key={tx.kind + (tx.listingId ?? tx.etfId ?? "")} tx={tx} onClose={() => setTx(null)} />}</AnimatePresence>
    </Ctx.Provider>
  );
}

/** Opens the sheet from server-rendered pages. */
export function TxButton({ tx, className = "", children }: { tx: Tx; className?: string; children: ReactNode }) {
  const open = useTx();
  return (
    <button onClick={() => open(tx)} className={className}>
      {children}
    </button>
  );
}

export function TxAction({ tx, icon, label }: { tx: Tx; icon: IconName; label: string }) {
  const open = useTx();
  return <ActionCircle icon={icon} label={label} onClick={() => open(tx)} />;
}

type Phase = "review" | "pending" | "done";

function Sheet({ tx, onClose }: { tx: Tx; onClose: () => void }) {
  const listing = tx.listingId ? LISTINGS.find((l) => l.id === tx.listingId) : undefined;
  const owned = ETFS.filter((e) => (MY_VAULTS.owned as readonly string[]).includes(e.id));
  const [vaultId, setVaultId] = useState(listing?.etf.id ?? tx.etfId ?? owned[0].id);
  const etf = getEtf(vaultId)!;
  const name = listing?.name ?? etf.name;
  const price = listing?.priceNear ?? etf.priceNear;
  const value = listing?.navUsd ?? etf.navUsd;
  const seller = listing?.seller ?? etf.owner;
  const m = META[tx.kind];

  const [phase, setPhase] = useState<Phase>("review");
  const [offer, setOffer] = useState(Math.round(price * 0.9));
  const [expiry, setExpiry] = useState<"1 day" | "3 days" | "7 days">("3 days");
  const [amount, setAmount] = useState(tx.kind === "withdraw" ? Math.round(value * 0.25) : 100);
  const [to, setTo] = useState("");
  const account = useAccount();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && phase !== "pending" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, onClose]);

  // ponytail: simulated wallet round trip; replace with the HOT wallet signAndSendTransaction call
  const submit = () => {
    setPhase("pending");
    setTimeout(() => setPhase("done"), 1600);
  };

  const validTo = /^[a-z0-9_-]+(\.[a-z0-9_-]+)*\.(near|tg|testnet)$/.test(to) && to !== account;
  const canSubmit =
    tx.kind === "offer" ? offer > 0 : tx.kind === "deposit" ? amount > 0 : tx.kind === "withdraw" ? amount > 0 && amount <= value : tx.kind === "transfer" ? validTo : true;

  return (
    <motion.div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <button aria-label="Close" onClick={() => phase !== "pending" && onClose()} className="absolute inset-0 cursor-default bg-black/45 backdrop-blur-sm" />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={m.title}
        initial={{ y: 40, scale: 0.97 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: 30, scale: 0.97, opacity: 0 }}
        transition={{ type: "spring", stiffness: 420, damping: 34 }}
        className="relative flex max-h-[92dvh] w-full max-w-[440px] flex-col overflow-y-auto rounded-[30px] bg-surface p-5 shadow-[0_30px_80px_-20px_#00000080]"
      >
        <AnimatePresence mode="wait" initial={false}>
          {!account ? (
            <motion.div key="connect" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <ConnectPrompt className="" sub={`Connect a NEAR wallet to ${m.title.toLowerCase()}. Nothing is signed until you confirm.`} />
            </motion.div>
          ) : phase === "done" ? (
            <Done key="done" kind={tx.kind} etf={etf} name={name} onClose={onClose} detail={doneDetail()} />
          ) : (
            <motion.div key="review" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-4">
              <header className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-full bg-fill">
                  <Sym name={m.icon} size={18} weight="bold" />
                </span>
                <h2 className="title-chunky flex-1 text-[24px]">{m.title}</h2>
                <button onClick={onClose} disabled={phase === "pending"} aria-label="Close" className="grid size-9 place-items-center rounded-full bg-fill text-muted hover:text-text disabled:opacity-40">
                  <Sym name="plus" size={16} weight="bold" className="rotate-45" />
                </button>
              </header>

              {/* the vault this is about */}
              <div className="flex items-center gap-3 rounded-[20px] bg-fill p-3">
                <Artwork etf={etf} size={52} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-semibold">{name}</div>
                  <div className="flex items-center gap-1.5 text-[13px] text-muted">
                    <Avatar account={seller} size={16} /> {tx.kind === "buy" || tx.kind === "offer" ? seller : `${etf.id}.torch.near`}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] text-muted">Basket inside</div>
                  <Money value={value} className="text-[14px] font-semibold" />
                </div>
              </div>

              {!listing && !tx.etfId && (
                <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
                  {owned.map((e) => (
                    <button key={e.id} onClick={() => setVaultId(e.id)} className={`flex h-9 shrink-0 items-center gap-2 rounded-full pl-1 pr-3 text-[13px] font-semibold transition ${vaultId === e.id ? "bg-text text-surface" : "bg-fill"}`}>
                      <Artwork etf={e} size={28} className="rounded-full" />
                      {e.name}
                    </button>
                  ))}
                </div>
              )}

              {tx.kind === "buy" && (
                <>
                  <BigAmount near={price} />
                  <Rows
                    rows={[
                      ["Price", <NearAmount key="p" amount={price} />],
                      [`Marketplace fee · ${MARKET_FEE * 100}%`, <NearAmount key="f" amount={(price * MARKET_FEE).toFixed(1)} />],
                      [`Creator royalty · ${ROYALTY * 100}%`, <span key="r" className="text-muted">paid by seller</span>],
                    ]}
                    total={["You pay", <NearAmount key="t" amount={(price * (1 + MARKET_FEE)).toFixed(1)} />]}
                  />
                  <Note>The vault account and all {etf.allocation.length} tokens inside move to you in the same transaction.</Note>
                </>
              )}

              {tx.kind === "offer" && (
                <>
                  <label className="flex flex-col items-center gap-1 rounded-[20px] bg-fill px-4 py-5">
                    <span className="text-[12px] font-semibold text-muted">Your offer</span>
                    <span className="flex items-center gap-2">
                      <TokenIcon token="NEAR" size={30} />
                      <input
                        type="number"
                        inputMode="decimal"
                        min={1}
                        value={offer}
                        onChange={(e) => setOffer(Math.max(0, Number(e.target.value)))}
                        className="title-chunky w-[5ch] bg-transparent text-center text-[44px] outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                        aria-label="Offer in NEAR"
                      />
                    </span>
                    <span className="text-[13px] text-muted">
                      ≈ <Money value={offer * NEAR_USD} /> · listed at <NearAmount amount={price} />
                    </span>
                  </label>
                  <div className="flex gap-1.5">
                    {[5, 10, 15].map((p) => (
                      <Chip key={p} on={offer === Math.round(price * (1 - p / 100))} onClick={() => setOffer(Math.round(price * (1 - p / 100)))}>
                        −{p}%
                      </Chip>
                    ))}
                    <Chip on={offer === Math.round(value / NEAR_USD)} onClick={() => setOffer(Math.round(value / NEAR_USD))}>
                      Basket value
                    </Chip>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[14px] font-semibold">Expires in</span>
                    <Segmented options={["1 day", "3 days", "7 days"] as const} value={expiry} onChange={setExpiry} />
                  </div>
                  <Note tone={offer >= price * 0.95 ? "up" : "muted"}>
                    {offer >= price * 0.95 ? "Within 5% of the asking price — offers like this usually get accepted." : "Well below asking. The seller may wait for a better offer."} Your NEAR is held in escrow until it is accepted or expires.
                  </Note>
                </>
              )}

              {(tx.kind === "deposit" || tx.kind === "withdraw") && (
                <>
                  <label className="flex flex-col items-center gap-1 rounded-[20px] bg-fill px-4 py-5">
                    <span className="text-[12px] font-semibold text-muted">{tx.kind === "deposit" ? "You deposit" : "You withdraw"}</span>
                    <span className="flex items-center gap-2">
                      <TokenIcon token="USDC" size={30} />
                      <input
                        type="number"
                        inputMode="decimal"
                        min={1}
                        value={amount}
                        onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
                        className="title-chunky w-[5ch] bg-transparent text-center text-[44px] outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                        aria-label="Amount in USDC"
                      />
                    </span>
                    <span className={`text-[13px] ${tx.kind === "withdraw" && amount > value ? "text-down" : "text-muted"}`}>
                      {tx.kind === "withdraw" ? (
                        <>
                          of <Money value={value} /> in the vault
                        </>
                      ) : (
                        "USDC, swapped into the basket at target weights"
                      )}
                    </span>
                  </label>
                  <div className="flex gap-1.5">
                    {(tx.kind === "deposit" ? [50, 100, 250, 500] : [0.25, 0.5, 0.75, 1].map((f) => Math.floor(value * f))).map((v, i) => (
                      <Chip key={v} on={amount === v} onClick={() => setAmount(v)}>
                        {tx.kind === "deposit" ? `$${v}` : ["25%", "50%", "75%", "Max"][i]}
                      </Chip>
                    ))}
                  </div>
                  <div className="flex flex-col gap-2 rounded-[20px] border border-line-soft p-3">
                    <span className="text-[12px] font-semibold text-muted">{tx.kind === "deposit" ? "Buys into" : "Sells from"}</span>
                    {etf.allocation.map((a) => (
                      <div key={a.token} className="flex items-center gap-2.5 text-[14px]">
                        <TokenIcon token={a.token} size={22} />
                        <span className="flex-1 font-medium">{TOKENS[a.token].symbol}</span>
                        <span className="text-muted">{a.weight}%</span>
                        <Money value={(amount * a.weight) / 100} className="w-20 text-right font-semibold" />
                      </div>
                    ))}
                  </div>
                  <Rows rows={[["Max slippage", `${(etf.slippageBps / 100).toFixed(2)}%`], ["Network fee", "≈ 0.003 NEAR"]]} />
                </>
              )}

              {tx.kind === "transfer" && (
                <>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[13px] font-semibold">Send to</span>
                    <span className={`flex h-12 items-center gap-2 rounded-[16px] bg-fill px-3 ring-2 transition ${to && !validTo ? "ring-down/60" : "ring-transparent focus-within:ring-text/20"}`}>
                      {validTo ? <Avatar account={to} size={24} /> : <Sym name="person" size={18} className="text-muted" />}
                      <input value={to} onChange={(e) => setTo(e.target.value.trim().toLowerCase())} placeholder="account.near" className="flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted" autoFocus />
                    </span>
                    {to && !validTo && <span className="text-[12px] text-down">{to === account ? "That is your own account." : "Enter a NEAR account like alice.near"}</span>}
                  </label>
                  <Note tone="warn">The vault and every token inside go with the NFT. You lose all access the moment it lands.</Note>
                </>
              )}

              {tx.kind === "accept" && tx.offer && (
                <>
                  <div className="flex flex-col items-center gap-1 py-2">
                    <NearAmount amount={tx.offer.priceNear} className="title-chunky text-[44px]" />
                    <span className="flex items-center gap-1.5 text-[13px] text-muted">
                      from <Avatar account={tx.offer.from} size={16} /> {tx.offer.from}
                    </span>
                  </div>
                  <Rows
                    rows={[
                      ["Offer", <NearAmount key="o" amount={tx.offer.priceNear} />],
                      [`Marketplace fee · ${MARKET_FEE * 100}%`, <NearAmount key="f" amount={`−${(tx.offer.priceNear * MARKET_FEE).toFixed(1)}`} />],
                      [`Creator royalty · ${ROYALTY * 100}%`, <NearAmount key="r" amount={`−${(tx.offer.priceNear * ROYALTY).toFixed(1)}`} />],
                    ]}
                    total={["You receive", <NearAmount key="t" amount={(tx.offer.priceNear * (1 - MARKET_FEE - ROYALTY)).toFixed(1)} />]}
                  />
                  <Note tone="warn">The vault and all {etf.allocation.length} tokens inside move to {tx.offer.from}. Other open offers are cancelled.</Note>
                </>
              )}

              <div className="flex gap-2 pt-1">
                <button onClick={onClose} disabled={phase === "pending"} className="btn-line h-12 px-5 text-[15px] disabled:opacity-40">
                  Cancel
                </button>
                {phase === "pending" ? (
                  <div className="flex h-12 flex-1 items-center justify-center gap-2.5 rounded-full bg-fill text-[15px] font-semibold">
                    <motion.span className="size-4 rounded-full border-2 border-text border-t-transparent" animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }} />
                    Confirm in your wallet…
                  </div>
                ) : tx.kind === "buy" || tx.kind === "transfer" || tx.kind === "accept" ? (
                  <HoldButton
                    disabled={!canSubmit}
                    onHold={submit}
                    holdTime={900}
                    radius={24}
                    backgroundColor="var(--text)"
                    fillColor="var(--tint)"
                    textColor="var(--surface)"
                    fillTextColor="#ffffff"
                    className="h-12 flex-1 text-[15px] font-semibold"
                  >
                    {m.cta}
                  </HoldButton>
                ) : (
                  <button onClick={submit} disabled={!canSubmit} className="btn-ink h-12 flex-1 text-[15px]">
                    {m.cta}
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );

  function doneDetail(): ReactNode {
    if (tx.kind === "buy") return <>Paid <NearAmount amount={(price * (1 + MARKET_FEE)).toFixed(1)} /> · {name} is in My Vaults.</>;
    if (tx.kind === "offer") return <>Offered <NearAmount amount={offer} /> · expires in {expiry}.</>;
    if (tx.kind === "deposit") return <>${amount} USDC swapped into {etf.allocation.length} tokens.</>;
    if (tx.kind === "withdraw") return <>${amount} USDC sent to {account}.</>;
    if (tx.kind === "transfer") return <>{name} now belongs to {to}.</>;
    return <>Sold to {tx.offer?.from} for <NearAmount amount={tx.offer?.priceNear ?? 0} />.</>;
  }
}

function Done({ kind, etf, name, detail, onClose }: { kind: TxKind; etf: Etf; name: string; detail: ReactNode; onClose: () => void }) {
  return (
    <motion.div key="done" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-4 py-4 text-center">
      <motion.span initial={{ scale: 0.4 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 18 }} className="grid size-20 place-items-center rounded-full bg-up text-white shadow-[0_12px_30px_-10px_var(--up)]">
        <Sym name="check" size={38} weight="bold" />
      </motion.span>
      <div>
        <h2 className="title-chunky text-[28px]">{META[kind].done}</h2>
        <p className="mt-1 text-[14px] text-muted">{detail}</p>
      </div>
      <div className="flex w-full items-center gap-3 rounded-[20px] bg-fill p-3 text-left">
        <Artwork etf={etf} size={44} />
        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{name}</span>
        <span className="font-mono text-[11px] text-muted">tx 8fK2…q9Za</span>
      </div>
      <div className="flex w-full gap-2">
        <Link href={kind === "offer" ? "/market" : "/vaults"} onClick={onClose} className="btn-line grid h-12 flex-1 place-items-center text-[15px]">
          {kind === "offer" ? "Back to market" : "My Vaults"}
        </Link>
        <button onClick={onClose} className="btn-ink h-12 flex-1 text-[15px]" autoFocus>
          Done
        </button>
      </div>
    </motion.div>
  );
}

function BigAmount({ near }: { near: number }) {
  return (
    <div className="flex flex-col items-center gap-1 py-2">
      <NearAmount amount={near} className="title-chunky text-[44px]" />
      <span className="text-[13px] text-muted">
        ≈ <Money value={near * NEAR_USD} />
      </span>
    </div>
  );
}

function Rows({ rows, total }: { rows: [string, ReactNode][]; total?: [string, ReactNode] }) {
  return (
    <dl className="flex flex-col gap-2 rounded-[20px] border border-line-soft p-3 text-[14px]">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-center justify-between gap-3">
          <dt className="text-muted">{k}</dt>
          <dd className="font-medium">{v}</dd>
        </div>
      ))}
      {total && (
        <div className="flex items-center justify-between gap-3 border-t border-line-soft pt-2 text-[16px] font-bold">
          <dt>{total[0]}</dt>
          <dd>{total[1]}</dd>
        </div>
      )}
    </dl>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} className={`h-9 flex-1 rounded-full text-[13px] font-semibold transition ${on ? "bg-text text-surface" : "bg-fill hover:bg-line"}`}>
      {children}
    </button>
  );
}

function Note({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "up" | "warn" }) {
  const c = tone === "up" ? "bg-up/12 text-up-text" : tone === "warn" ? "bg-down/10 text-down" : "bg-fill text-muted";
  return (
    <p className={`flex items-start gap-2 rounded-[16px] p-3 text-[13px] ${c}`}>
      <Sym name="shield" size={16} weight="bold" className="mt-0.5" />
      <span>{children}</span>
    </p>
  );
}
