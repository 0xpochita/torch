import { TOKENS, type Allocation } from "@/lib/mock";

// Live preview of a basket as a cluster of 3D coins. Bigger weight → bigger coin.
// ponytail: CSS only; final NFT art is generated at mint, swap for a three.js scene if this stops being enough.
const SPOTS = [
  { x: 50, y: 42, z: 6 },
  { x: 70, y: 56, z: 5 },
  { x: 32, y: 60, z: 4 },
  { x: 58, y: 72, z: 3 },
  { x: 30, y: 34, z: 2 },
  { x: 74, y: 30, z: 1 },
];

export function CoinStack({ allocation, spin = false }: { allocation: Allocation[]; spin?: boolean }) {
  const sorted = [...allocation].sort((a, b) => b.weight - a.weight).slice(0, SPOTS.length);
  return (
    <div className="relative size-full [perspective:900px]">
      <div className={`absolute inset-0 [transform-style:preserve-3d] ${spin ? "animate-[float_6s_ease-in-out_infinite]" : ""}`}>
        {sorted.map((a, i) => {
          const t = TOKENS[a.token];
          const size = 22 + a.weight * 0.45; // % of container
          const s = SPOTS[i];
          return (
            <div
              key={a.token}
              className="absolute grid place-items-center rounded-full font-black text-white"
              style={{
                left: `${s.x}%`,
                top: `${s.y}%`,
                width: `${size}%`,
                aspectRatio: "1",
                zIndex: s.z,
                transform: `translate(-50%, -50%) rotateX(18deg) rotateY(${(i % 2 ? -1 : 1) * (12 + i * 6)}deg)`,
                background: `radial-gradient(circle at 30% 25%, color-mix(in oklab, ${t.color} 55%, white), ${t.color} 45%, color-mix(in oklab, ${t.color} 60%, black))`,
                boxShadow: `inset 0 -6px 0 color-mix(in oklab, ${t.color} 55%, black), inset 0 0 0 5px color-mix(in oklab, ${t.color} 75%, white), 0 18px 30px -10px rgb(0 0 0 / 0.45)`,
                fontSize: `${size * 0.16}cqw`,
              }}
            >
              <span className="drop-shadow-[0_2px_2px_rgb(0_0_0/0.35)]">{t.symbol.slice(0, t.symbol.length > 4 ? 2 : 4)}</span>
            </div>
          );
        })}
      </div>
      <div className="absolute bottom-[8%] left-1/2 h-[6%] w-1/2 -translate-x-1/2 rounded-[50%] bg-black/25 blur-md" />
    </div>
  );
}
