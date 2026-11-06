import { TokenIcon } from "@/components/ui";
import { vaultOf } from "@/lib/contracts";
import { TOKENS, fmtUsd, type Etf } from "@/lib/tokens";

const NODE_H = 64;
const GAP = 16;
const TOKEN_X = 16;
const TOKEN_W = 160;
const VAULT_X = 226;
const VAULT_W = 180;
const SETTINGS_X = 436;
const SETTINGS_W = 172;
const WIDTH = SETTINGS_X + SETTINGS_W + 16;

/** Node-editor style view of the basket: tokens → vault account → strategy settings. */
export function BasketGraph({ etf }: { etf: Etf }) {
  const n = etf.allocation.length;
  const height = Math.max(n * (NODE_H + GAP) + 40, 300);
  const tokenY = (i: number) => 24 + i * (NODE_H + GAP);
  const vaultY = height / 2 - 70;
  const vaultMid = height / 2;

  return (
    <div className="canvas-dots card overflow-x-auto">
      <div className="relative mx-auto" style={{ width: WIDTH, height }}>
        <svg className="absolute inset-0" width={WIDTH} height={height} aria-hidden>
          {etf.allocation.map((a, i) => {
            const y1 = tokenY(i) + NODE_H / 2;
            const x1 = TOKEN_X + TOKEN_W;
            const mid = (x1 + VAULT_X) / 2;
            return (
              <path
                key={a.token}
                d={`M${x1},${y1} C${mid},${y1} ${mid},${vaultMid} ${VAULT_X},${vaultMid}`}
                fill="none"
                stroke="var(--text)"
                strokeOpacity="0.22"
                strokeWidth="2"
              />
            );
          })}
          <path
            d={`M${VAULT_X + VAULT_W},${vaultMid} C${VAULT_X + VAULT_W + 30},${vaultMid} ${SETTINGS_X - 30},${vaultMid} ${SETTINGS_X},${vaultMid}`}
            fill="none"
            stroke="var(--ink)"
            strokeWidth="2"
          />
        </svg>

        {etf.allocation.map((a, i) => {
          const t = TOKENS[a.token];
          const usd = (etf.navUsd * a.weight) / 100;
          return (
            <div
              key={a.token}
              className="absolute flex items-center gap-3 rounded-xl border border-line bg-surface px-3 shadow-sm"
              style={{ left: TOKEN_X, top: tokenY(i), width: TOKEN_W, height: NODE_H }}
            >
              <TokenIcon token={a.token} size={32} />
              <div className="min-w-0 flex-1 text-xs">
                <div className="flex justify-between font-semibold">
                  <span className="truncate">{t.symbol}</span>
                  <span>{a.weight}%</span>
                </div>
                <div className="text-muted">{fmtUsd(usd)}</div>
              </div>
              <span className="absolute -right-1.5 size-3 rounded-full border-2 border-surface" style={{ background: "var(--text)" }} />
            </div>
          );
        })}

        <Node title="Vault account" x={VAULT_X} y={vaultY} w={VAULT_W} glow>
          <Row k="Account" v={vaultOf(etf.id)} mono />
          <Row k="Owner" v={etf.owner} mono />
          <Row k="Access keys" v="None" accent />
          <Row k="Status" v={etf.listed ? "Listed · withdraw locked" : "Active"} />
        </Node>

        <Node title="Swaps" x={SETTINGS_X} y={vaultY} w={SETTINGS_W}>
          <Row k="Max slippage" v={`${(etf.slippageBps / 100).toFixed(2)}%`} />
          <Row k="Category" v={etf.category} />
          <Row k="Route" v="RHEA · NEAR Intents" />
        </Node>
      </div>
    </div>
  );
}

function Node({ title, x, y, w, glow, children }: { title: string; x: number; y: number; w: number; glow?: boolean; children: React.ReactNode }) {
  return (
    <div
      className={`absolute rounded-xl border bg-surface shadow-sm ${glow ? "border-ink shadow-[0_10px_30px_-12px_#00000059]" : "border-line"}`}
      style={{ left: x, top: y, width: w }}
    >
      <div className="border-b border-line px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-muted">{title}</div>
      <div className="flex flex-col gap-1.5 p-3 text-xs">{children}</div>
    </div>
  );
}

function Row({ k, v, mono, accent }: { k: string; v: string; mono?: boolean; accent?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted">{k}</span>
      <span className={`truncate ${mono ? "font-mono" : ""} ${accent ? "text-up" : ""}`}>{v}</span>
    </div>
  );
}
