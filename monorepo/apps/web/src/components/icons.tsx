// SF Symbols–style line icons (24×24, round caps). One map so every screen uses the same set.
const PATHS = {
  house: "M3.5 10.5 12 4l8.5 6.5V20a1 1 0 0 1-1 1H15v-6h-6v6H4.5a1 1 0 0 1-1-1z",
  plus: "M12 5v14M5 12h14",
  plusCircle: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 8v8M8 12h8",
  vault: "M4 6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5zM15 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM7 9v6",
  pulse: "M3 12h4l2.5-6 5 12L17 12h4",
  heart: "M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z",
  doc: "M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM14 3v5h5M9 13h6M9 17h4",
  bell: "M6 9a6 6 0 1 1 12 0c0 6 2.5 8 2.5 8h-17S6 15 6 9zM10 20.5a2.2 2.2 0 0 0 4 0",
  search: "M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15zM16 16l5 5",
  share: "M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7",
  chevron: "M9 5l7 7-7 7",
  chevronDown: "M6 9l6 6 6-6",
  swap: "M7 7h12l-3-3M17 17H5l3 3",
  down: "M12 4v14M6 12l6 6 6-6",
  up: "M12 20V6M6 12l6-6 6 6",
  sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z",
  tag: "M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9zM7.5 7.5h.01",
  layers: "M12 3 2.5 8 12 13l9.5-5zM2.5 12.5 12 17.5l9.5-5M2.5 16.5 12 21.5l9.5-5",
  lock: "M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3",
  key: "M14.5 9.5a4 4 0 1 1-1.2-2.8L21 14v3h-3v2h-2l-2.3-2.3",
  shield: "M12 3 4.5 6v6c0 4.5 3.2 7.8 7.5 9 4.3-1.2 7.5-4.5 7.5-9V6zM8.5 12l2.5 2.5 4.5-5",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  person: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20.5a7.5 7.5 0 0 1 15 0",
  check: "M5 12.5l4.5 4.5L19 7",
  wallet: "M4 7a2 2 0 0 1 2-2h11v4M4 7v10a2 2 0 0 0 2 2h14V9H6a2 2 0 0 1-2-2zM16.5 14h.01",
  ellipsis: "M6 12h.01M12 12h.01M18 12h.01",
} as const;

export type IconName = keyof typeof PATHS;

export function Sym({ name, size = 18, stroke = 1.9, className = "" }: { name: IconName; size?: number; stroke?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={PATHS[name]} />
    </svg>
  );
}

/** Rounded-square symbol tile. Neutral by default; `accent` uses the system tint. */
export function SymTile({ name, size = 30, accent = false }: { name: IconName; size?: number; accent?: boolean }) {
  return (
    <span className={`grid shrink-0 place-items-center rounded-[28%] ${accent ? "bg-tint text-white" : "bg-fill text-ink"}`} style={{ width: size, height: size }}>
      <Sym name={name} size={size * 0.56} stroke={2} />
    </span>
  );
}
