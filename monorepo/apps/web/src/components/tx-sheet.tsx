"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Artwork } from "@/components/etf-card";
import { Sym, type IconName } from "@/components/icons";
import { ConnectPrompt } from "@/components/navbar";
import HoldButton from "@/components/react-bits/HoldButton";
import { ActionCircle, Avatar, Money, NearAmount, Segmented, TokenIcon } from "@/components/ui";
import { EmptyState, ErrorState, Skeleton } from "@/components/load-state";
import { useNear } from "@/providers/near-provider";
import { NEAR_USD, TOKENS, type Etf, type TokenKey } from "@/lib/mock";
import { FTS, MARKET, ftByKey, vaultOf } from "@/lib/contracts";
import { toNear, toVault, tokenKey, useApi, type VaultDetail, type VaultSummary } from "@/lib/api";
import * as near from "@/lib/near-tx";

/* One sheet for every vault transaction: review → wallet signature → done (or the wallet/contract error). */

export type TxKind = "buy" | "offer" | "accept" | "deposit" | "withdraw" | "transfer" | "list" | "delist";
/**
 * `tokenId` is the on-chain NFT id (`etfId` is the same thing under the pages' older name). Without one,
 * the sheet lets the signed-in owner pick one of their vaults. Everything shown is loaded from the API
 * (`/vaults/:id`) by that id; the buy price and listing state are re-read on-chain before signing.
 */
export type Tx = { kind: TxKind; tokenId?: string; etfId?: string; offer?: { from: string; priceNear: number } };

// Market contract: 2% fee out of the price, then 2.5% creator royalty out of the remaining 98% (wave 1 deltas).
const MARKET_FEE = 0.02;
const ROYALTY = 0.025;
const DAY_MS = 86_400_000;
const expiresIn = (days: number) => Date.now() + days * DAY_MS;

const META: Record<TxKind, { title: string; icon: IconName; cta: string; done: string }> = {
  buy: { title: "Buy vault", icon: "tag", cta: "Hold to buy", done: "The vault is yours" },
  offer: { title: "Make an offer", icon: "swap", cta: "Place offer", done: "Offer placed" },
  deposit: { title: "Deposit", icon: "down", cta: "Deposit", done: "Deposited" },
  withdraw: { title: "Withdraw", icon: "up", cta: "Withdraw", done: "Withdrawn" },
  transfer: { title: "Transfer vault", icon: "share", cta: "Hold to transfer", done: "Vault sent" },
  accept: { title: "Accept offer", icon: "check", cta: "Hold to accept", done: "Offer accepted" },
  list: { title: "List for sale", icon: "tag", cta: "List vault", done: "Listed" },
  delist: { title: "Remove listing", icon: "close", cta: "Delist", done: "Delisted" },
};

const Ctx = createContext<(tx: Tx) => void>(() => {});
export const useTx = () => useContext(Ctx);

export function TxProvider({ children }: { children: ReactNode }) {
  const [tx, setTx] = useState<Tx | null>(null);
  return (
    <Ctx.Provider value={setTx}>
      {children}
      <AnimatePresence>{tx && <Sheet key={tx.kind + (tx.tokenId ?? tx.etfId ?? "")} tx={tx} onClose={() => setTx(null)} />}</AnimatePresence>
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
type Listing = { token_id: string; seller_id: string; price: string; approval_id: number; listed_at: number };

const r2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: n < 1 ? 6 : 2 });
const DECIMAL = /^\d*\.?\d*$/;

/** Overlay + dialog card shared by every sheet state. `locked` while the wallet is open. */
function Frame({ title, locked = false, onClose, children }: { title: string; locked?: boolean; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !locked && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [locked, onClose]);
  return (
    <motion.div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <button aria-label="Close" onClick={() => !locked && onClose()} className="absolute inset-0 cursor-default bg-black/45 backdrop-blur-sm" />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        initial={{ y: 40, scale: 0.97 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: 30, scale: 0.97, opacity: 0 }}
        transition={{ type: "spring", stiffness: 420, damping: 34 }}
        className="relative flex max-h-[92dvh] w-full max-w-[440px] flex-col overflow-y-auto rounded-[30px] bg-surface p-5 shadow-[0_30px_80px_-20px_#00000080]"
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

/** Resolves which vault the sheet is about and loads it from the API; the review mounts once it has data. */
function Sheet({ tx, onClose }: { tx: Tx; onClose: () => void }) {
  const m = META[tx.kind];
  const { accountId } = useNear();
  const given = tx.tokenId ?? tx.etfId ?? null;
  const [picked, setPicked] = useState<string | null>(null);
  const mine = useApi<VaultSummary[]>(!given && accountId ? `/vaults?owner=${encodeURIComponent(accountId)}` : null);
  const tokenId = given ?? picked ?? mine.data?.[0]?.tokenId ?? null;
  const detail = useApi<VaultDetail>(accountId && tokenId ? `/vaults/${encodeURIComponent(tokenId)}` : null);

  if (accountId && detail.data && detail.data.tokenId === tokenId)
    return <Review key={tokenId} tx={tx} detail={detail.data} owned={given ? undefined : mine.data} onPick={setPicked} onClose={onClose} />;

  const failed = detail.error ?? mine.error;
  return (
    <Frame title={m.title} onClose={onClose}>
      {!accountId ? (
        <ConnectPrompt className="" sub={`Connect a NEAR wallet to ${m.title.toLowerCase()}. Nothing is signed until you confirm.`} />
      ) : failed ? (
        <ErrorState error={failed} className="!p-4" />
      ) : mine.data && !mine.data.length ? (
        <EmptyState title="No vaults yet" body="Mint a vault first, then come back to fund or move it." className="!p-4">
          <Link href="/create" onClick={onClose} className="btn-ink mt-2 grid h-11 place-items-center px-5 text-[15px]">
            Create a vault
          </Link>
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-4" aria-busy="true" aria-label={`Loading vault ${tokenId ?? ""}`}>
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-[76px]" />
          <Skeleton className="h-36" />
          <Skeleton className="h-12" />
        </div>
      )}
    </Frame>
  );
}

function Review({ tx, detail, owned, onPick, onClose }: { tx: Tx; detail: VaultDetail; owned?: VaultSummary[]; onPick: (id: string) => void; onClose: () => void }) {
  const tokenId = detail.tokenId;
  const etf = toVault(detail);
  const name = etf.name;
  const value = detail.navUsd;
  const seller = detail.listing?.sellerId ?? detail.ownerId;
  const m = META[tx.kind];
  const { accountId: account, wallet, canBatch } = useNear();
  // Accept from a page that did not pick an offer: the best live one.
  const bestOffer = [...detail.offers].sort((a, b) => (BigInt(b.amount) > BigInt(a.amount) ? 1 : -1))[0];
  const offerIn = tx.offer ?? (bestOffer ? { from: bestOffer.buyerId, priceNear: toNear(bestOffer.amount) } : undefined);

  // The live listing decides the buy price (it must match exactly) and blocks withdraw while listed.
  const needsListing = ["buy", "offer", "delist", "withdraw", "list"].includes(tx.kind);
  const live = near.useView<Listing | null>(needsListing ? MARKET : null, "get_listing", { token_id: tokenId });
  const onChain = live.data ?? null;
  const price = onChain ? near.fromUnits(onChain.price, 24) : detail.listing ? toNear(detail.listing.price) : 0;

  // Deposit: the basket's tokens (or any token for an empty basket). Withdraw: what the vault holds.
  const held = detail.balances.filter((b) => BigInt(b.amount) > BigInt(0)).flatMap((b) => tokenKey(b.ftId) ?? []);
  const choices: TokenKey[] = tx.kind === "withdraw" ? held : etf.allocation.length ? etf.allocation.map((a) => a.token) : FTS.map((f) => f.key);

  const [phase, setPhase] = useState<Phase>("review");
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const [offer, setOffer] = useState(price ? r2(price * 0.9) : 0.1);
  const [expiry, setExpiry] = useState<"1 day" | "3 days" | "7 days">("3 days");
  const [ftKey, setFtKey] = useState<TokenKey>(choices[0] ?? "USDC");
  const [amount, setAmount] = useState("");
  const [to, setTo] = useState("");

  // Deposit spends your wallet balance; withdraw draws from the vault's.
  const ft = ftByKey(ftKey);
  const holder = tx.kind === "deposit" ? account : tx.kind === "withdraw" ? vaultOf(tokenId) : null;
  const bal = near.useView<string>(holder ? ft.id : null, "ft_balance_of", { account_id: holder }, hash ? 1 : 0);
  const balRaw = BigInt(bal.data ?? "0");
  const amountRaw = (() => {
    try {
      return BigInt(near.toUnits(amount, ft.decimals));
    } catch {
      return BigInt(0);
    }
  })();

  const build = (): near.Tx[] => {
    const yocto = (n: number) => near.toUnits(n, 24);
    switch (tx.kind) {
      case "buy":
        return [near.buyTx(tokenId, onChain!.price)];
      case "offer":
        return [near.offerTx(tokenId, yocto(offer), expiresIn(parseInt(expiry)))];
      case "list":
        return [near.listTx(tokenId, yocto(offer))];
      case "delist":
        return near.delistTxs(tokenId);
      case "accept":
        return [near.acceptTx(tokenId, offerIn!.from)];
      case "deposit":
        return [near.depositTx(tokenId, ft.id, amountRaw.toString())];
      case "withdraw":
        return [near.withdrawTx(tokenId, ft.id, amountRaw.toString())];
      case "transfer":
        return [near.transferTx(tokenId, to)];
    }
  };

  // The wallet popup is the pending step; its result (or rejection / contract panic) decides the next one.
  const submit = async () => {
    if (!wallet) return;
    setError(null);
    setStep(null);
    setPhase("pending");
    try {
      // wallets without batch signing get one prompt per tx; say which one is up
      const outcomes = await near.send(wallet, build(), { onStep: (i, n) => setStep(`step ${i + 1} of ${n}`) });
      setHash(outcomes[outcomes.length - 1].transaction.hash);
      setPhase("done");
    } catch (e) {
      setError(near.walletError(e));
      setPhase("review");
    }
  };

  const validTo = /^[a-z0-9_-]+(\.[a-z0-9_-]+)*\.(near|tg|testnet)$/.test(to) && to !== account;
  const canSubmit =
    !!wallet &&
    (tx.kind === "buy"
      ? !!onChain && onChain.seller_id !== account
      : tx.kind === "offer"
        ? offer >= 0.01
        : tx.kind === "list"
          ? offer > 0 && !live.loading
          : tx.kind === "delist"
            ? !!onChain
            : tx.kind === "deposit" || tx.kind === "withdraw"
              ? amountRaw > BigInt(0) && amountRaw <= balRaw && !(tx.kind === "withdraw" && onChain)
              : tx.kind === "transfer"
                ? validTo
                : !!offerIn && detail.ownerId === account);
  const holdToConfirm = tx.kind === "buy" || tx.kind === "transfer" || tx.kind === "accept";

  return (
    <Frame title={m.title} locked={phase === "pending"} onClose={onClose}>
        <AnimatePresence mode="wait" initial={false}>
          {phase === "done" ? (
            <Done key="done" kind={tx.kind} etf={etf} name={name} hash={hash} onClose={onClose} detail={doneDetail()} />
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
                    {tx.kind === "buy" || tx.kind === "offer" ? (
                      <>
                        <Avatar account={onChain?.seller_id ?? seller} size={16} /> {onChain?.seller_id ?? seller}
                      </>
                    ) : (
                      <span className="truncate font-mono text-[12px]">{vaultOf(tokenId)}</span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] text-muted">Basket inside</div>
                  <Money value={value} className="text-[14px] font-semibold" />
                </div>
              </div>

              {owned && owned.length > 1 && (
                <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
                  {owned.map((v) => toVault(v)).map((e) => (
                    <button key={e.id} onClick={() => onPick(e.id)} disabled={phase === "pending"} className={`flex h-9 shrink-0 items-center gap-2 rounded-full pl-1 pr-3 text-[13px] font-semibold transition ${tokenId === e.id ? "bg-text text-surface" : "bg-fill"}`}>
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
                      ["Price", <NearAmount key="p" amount={fmt(price)} />],
                      [`Marketplace fee · ${MARKET_FEE * 100}%`, <span key="f" className="text-muted">paid by seller</span>],
                      [`Creator royalty · ${ROYALTY * 100}%`, <span key="r" className="text-muted">paid by seller</span>],
                    ]}
                    total={["You pay", <NearAmount key="t" amount={fmt(price)} />]}
                  />
                  {live.loading ? (
                    <Note>Checking the listing on-chain…</Note>
                  ) : !onChain ? (
                    <Note tone="warn">This vault is not listed on-chain right now. Make an offer instead.</Note>
                  ) : onChain.seller_id === account ? (
                    <Note tone="warn">This is your own listing.</Note>
                  ) : (
                    <Note>The vault account and all {etf.allocation.length} tokens inside move to you in the same transaction. If the sale cannot settle, the NEAR comes back.</Note>
                  )}
                </>
              )}

              {(tx.kind === "offer" || tx.kind === "list") && (
                <>
                  <label className="flex flex-col items-center gap-1 rounded-[20px] bg-fill px-4 py-5">
                    <span className="text-[12px] font-semibold text-muted">{tx.kind === "offer" ? "Your offer" : "Your price"}</span>
                    <span className="flex items-center gap-2">
                      <TokenIcon token="NEAR" size={30} />
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0.01}
                        step="any"
                        value={offer}
                        onChange={(e) => setOffer(Math.max(0, Number(e.target.value)))}
                        className="title-chunky w-[6ch] bg-transparent text-center text-[44px] outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                        aria-label={tx.kind === "offer" ? "Offer in NEAR" : "Price in NEAR"}
                      />
                    </span>
                    <span className="text-[13px] text-muted">
                      ≈ <Money value={offer * NEAR_USD} />
                      {tx.kind === "offer" && onChain && (
                        <>
                          {" "}
                          · listed at <NearAmount amount={fmt(price)} />
                        </>
                      )}
                    </span>
                  </label>
                  {tx.kind === "offer" ? (
                    <>
                      <div className="flex gap-1.5">
                        {[5, 10, 15].map((p) => (
                          <Chip key={p} on={offer === r2(price * (1 - p / 100))} onClick={() => setOffer(r2(price * (1 - p / 100)))}>
                            −{p}%
                          </Chip>
                        ))}
                        <Chip on={offer === r2(value / NEAR_USD)} onClick={() => setOffer(r2(value / NEAR_USD))}>
                          Basket value
                        </Chip>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[14px] font-semibold">Expires in</span>
                        <Segmented options={["1 day", "3 days", "7 days"] as const} value={expiry} onChange={setExpiry} />
                      </div>
                      <Note tone={offer < 0.01 ? "warn" : offer >= price * 0.95 ? "up" : "muted"}>
                        {offer < 0.01 ? "Offers start at 0.01 NEAR." : offer >= price * 0.95 ? "Within 5% of the asking price — offers like this usually get accepted." : "Well below asking. The seller may wait for a better offer."} Your NEAR is held in escrow by the market until it is accepted, cancelled or expires.
                      </Note>
                    </>
                  ) : (
                    <>
                      <Rows
                        rows={[
                          [`Marketplace fee · ${MARKET_FEE * 100}%`, <NearAmount key="f" amount={`−${fmt(offer * MARKET_FEE)}`} />],
                          [`Creator royalty · ${ROYALTY * 100}%`, <NearAmount key="r" amount={`−${fmt(offer * (1 - MARKET_FEE) * ROYALTY)}`} />],
                        ]}
                        total={["You receive", <NearAmount key="t" amount={fmt(offer * (1 - MARKET_FEE) * (1 - ROYALTY))} />]}
                      />
                      <Note>{onChain ? "Already listed: this replaces the price." : "The market gets approval to sell this vault at your price. Withdrawals are paused until you delist."}</Note>
                    </>
                  )}
                </>
              )}

              {tx.kind === "delist" && (
                <>
                  {onChain && <BigAmount near={price} />}
                  <Note tone={onChain || live.loading ? "muted" : "warn"}>
                    {live.loading
                      ? "Checking the listing on-chain…"
                      : onChain
                        ? `Removes the listing and revokes the market's approval, so you can withdraw again. ${canBatch ? "Two transactions, one approval." : "Your wallet signs them one at a time: two approvals."}`
                        : "This vault is not listed."}
                  </Note>
                </>
              )}

              {(tx.kind === "deposit" || tx.kind === "withdraw") && (
                <>
                  <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
                    {choices.map((t) => (
                      <button key={t} onClick={() => (setFtKey(t), setAmount(""))} className={`flex h-9 shrink-0 items-center gap-2 rounded-full pl-1 pr-3 text-[13px] font-semibold transition ${ftKey === t ? "bg-text text-surface" : "bg-fill"}`}>
                        <TokenIcon token={t} size={26} />
                        {TOKENS[t].symbol}
                      </button>
                    ))}
                  </div>
                  <label className="flex flex-col items-center gap-1 rounded-[20px] bg-fill px-4 py-5">
                    <span className="text-[12px] font-semibold text-muted">{tx.kind === "deposit" ? "You deposit" : "You withdraw"}</span>
                    <span className="flex items-center gap-2">
                      <TokenIcon token={ftKey} size={30} />
                      <input
                        inputMode="decimal"
                        placeholder="0"
                        value={amount}
                        onChange={(e) => DECIMAL.test(e.target.value) && setAmount(e.target.value)}
                        className="title-chunky w-[6ch] bg-transparent text-center text-[44px] outline-none placeholder:text-faint"
                        aria-label={`Amount in ${TOKENS[ftKey].symbol}`}
                      />
                    </span>
                    <span className={`text-[13px] ${amountRaw > balRaw ? "text-down" : "text-muted"}`}>
                      {bal.loading ? "Loading balance…" : bal.error ? "Balance unavailable" : `of ${near.formatUnits(balRaw, ft.decimals)} ${TOKENS[ftKey].symbol} ${tx.kind === "deposit" ? "in your wallet" : "in the vault"}`}
                    </span>
                  </label>
                  <div className="flex gap-1.5">
                    {[25, 50, 75, 100].map((p) => {
                      const v = near.formatUnits((balRaw * BigInt(p)) / BigInt(100), ft.decimals);
                      return (
                        <Chip key={p} on={!!amount && amount === v} onClick={() => setAmount(v)}>
                          {p === 100 ? "Max" : `${p}%`}
                        </Chip>
                      );
                    })}
                  </div>
                  {tx.kind === "deposit" ? (
                    <>
                      <Rows rows={[["Vault registration", "≤ 0.00125 NEAR"], ["Network fee", "≈ 0.003 NEAR"]]} />
                      {bal.data !== undefined && balRaw === BigInt(0) && (
                        <Note tone="warn">
                          No {TOKENS[ftKey].symbol} in your wallet.{" "}
                          <Link href="/faucet" onClick={onClose} className="font-semibold underline">
                            Get test tokens
                          </Link>
                        </Note>
                      )}
                    </>
                  ) : (
                    <>
                      <Rows rows={[["Sent to", <span key="a" className="font-mono text-[13px]">{account}</span>], ["Network fee", "≈ 0.003 NEAR"]]} />
                      {onChain && <Note tone="warn">This vault is listed. Delist it before withdrawing, so a buyer never gets an emptied vault.</Note>}
                    </>
                  )}
                </>
              )}

              {tx.kind === "transfer" && (
                <>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[13px] font-semibold">Send to</span>
                    <span className={`flex h-12 items-center gap-2 rounded-[16px] bg-fill px-3 ring-2 transition ${to && !validTo ? "ring-down/60" : "ring-transparent focus-within:ring-text/20"}`}>
                      {validTo ? <Avatar account={to} size={24} /> : <Sym name="person" size={18} className="text-muted" />}
                      <input value={to} onChange={(e) => setTo(e.target.value.trim().toLowerCase())} placeholder="account.testnet" className="flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted" autoFocus />
                    </span>
                    {to && !validTo && <span className="text-[12px] text-down">{to === account ? "That is your own account." : "Enter a NEAR account like alice.testnet"}</span>}
                  </label>
                  <Note tone="warn">The vault and every token inside go with the NFT. You lose all access the moment it lands.</Note>
                </>
              )}

              {tx.kind === "accept" && !offerIn && <Note tone="warn">No live offers on this vault right now.</Note>}
              {tx.kind === "withdraw" && !choices.length && <Note tone="warn">This vault holds no tokens yet. Deposit first.</Note>}

              {tx.kind === "accept" && offerIn && (
                <>
                  <div className="flex flex-col items-center gap-1 py-2">
                    <NearAmount amount={fmt(offerIn.priceNear)} className="title-chunky text-[44px]" />
                    <span className="flex items-center gap-1.5 text-[13px] text-muted">
                      from <Avatar account={offerIn.from} size={16} /> {offerIn.from}
                    </span>
                  </div>
                  <Rows
                    rows={[
                      ["Offer", <NearAmount key="o" amount={fmt(offerIn.priceNear)} />],
                      [`Marketplace fee · ${MARKET_FEE * 100}%`, <NearAmount key="f" amount={`−${fmt(offerIn.priceNear * MARKET_FEE)}`} />],
                      [`Creator royalty · ${ROYALTY * 100}%`, <NearAmount key="r" amount={`−${fmt(offerIn.priceNear * (1 - MARKET_FEE) * ROYALTY)}`} />],
                    ]}
                    total={["You receive", <NearAmount key="t" amount={fmt(offerIn.priceNear * (1 - MARKET_FEE) * (1 - ROYALTY))} />]}
                  />
                  <Note tone="warn">The vault and all {etf.allocation.length} tokens inside move to {offerIn.from} in one transaction. If the offer expired or was withdrawn, nothing moves.</Note>
                </>
              )}

              <AnimatePresence>
                {error && (
                  <motion.p key="err" role="alert" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="flex items-start gap-2 rounded-[16px] bg-down/10 p-3 text-[13px] text-down">
                    <Sym name="close" size={16} weight="bold" className="mt-0.5 shrink-0" />
                    <span className="min-w-0 break-words">
                      <b className="font-semibold">Not sent.</b> {error}
                    </span>
                  </motion.p>
                )}
              </AnimatePresence>

              <div className="flex gap-2 pt-1">
                <button onClick={onClose} disabled={phase === "pending"} className="btn-line h-12 px-5 text-[15px] disabled:opacity-40">
                  Cancel
                </button>
                {phase === "pending" ? (
                  <div className="flex h-12 flex-1 items-center justify-center gap-2.5 rounded-full bg-fill text-[15px] font-semibold">
                    <motion.span className="size-4 rounded-full border-2 border-text border-t-transparent" animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }} />
                    {step ? `Confirm ${step} in your wallet…` : "Confirm in your wallet…"}
                  </div>
                ) : holdToConfirm ? (
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
                    {error ? "Hold to retry" : m.cta}
                  </HoldButton>
                ) : (
                  <button onClick={submit} disabled={!canSubmit} className="btn-ink h-12 flex-1 text-[15px]">
                    {error ? "Try again" : m.cta}
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
    </Frame>
  );

  function doneDetail(): ReactNode {
    const sym = TOKENS[ftKey].symbol;
    if (tx.kind === "buy") return <>Paid <NearAmount amount={fmt(price)} /> · {name} is in My Vaults.</>;
    if (tx.kind === "offer") return <>Offered <NearAmount amount={fmt(offer)} /> · expires in {expiry}.</>;
    if (tx.kind === "list") return <>Listed at <NearAmount amount={fmt(offer)} /> on the market.</>;
    if (tx.kind === "delist") return <>{name} is off the market. Withdrawals are open again.</>;
    if (tx.kind === "deposit") return <>{amount} {sym} is now inside {vaultOf(tokenId)}.</>;
    if (tx.kind === "withdraw") return <>{amount} {sym} sent to {account}.</>;
    if (tx.kind === "transfer") return <>{name} now belongs to {to}.</>;
    return <>Sold to {offerIn?.from} for <NearAmount amount={fmt(offerIn?.priceNear ?? 0)} />.</>;
  }
}

function Done({ kind, etf, name, hash, detail, onClose }: { kind: TxKind; etf: Etf; name: string; hash: string | null; detail: ReactNode; onClose: () => void }) {
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
        {hash && <TxLink hash={hash} />}
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

/** "tx 8fK2…q9Za ↗" linking to nearblocks. */
export function TxLink({ hash, className = "text-muted" }: { hash: string; className?: string }) {
  return (
    <a href={near.explorerTx(hash)} target="_blank" rel="noreferrer" className={`flex shrink-0 items-center gap-1 font-mono text-[11px] hover:underline ${className}`}>
      tx {hash.slice(0, 4)}…{hash.slice(-4)}
      <Sym name="share" size={11} weight="bold" />
    </a>
  );
}

function BigAmount({ near: amount }: { near: number }) {
  return (
    <div className="flex flex-col items-center gap-1 py-2">
      <NearAmount amount={fmt(amount)} className="title-chunky text-[44px]" />
      <span className="text-[13px] text-muted">
        ≈ <Money value={amount * NEAR_USD} />
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
