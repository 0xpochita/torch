// Phosphor icons (https://phosphoricons.com) behind one name map so every screen uses the same set.
// SSR build: renders in server and client components alike.
import {
  ArrowDown,
  ArrowUp,
  ArrowsLeftRight,
  Bell,
  CaretDown,
  CaretRight,
  Check,
  Clock,
  DotsThree,
  Export,
  FileText,
  Heart,
  House,
  Key,
  Lock,
  MagnifyingGlass,
  Plus,
  PlusCircle,
  Pulse,
  ShieldCheck,
  Sparkle,
  Stack,
  Tag,
  Trophy,
  User,
  Vault,
  Wallet,
} from "@phosphor-icons/react/ssr";
import type { Icon, IconWeight } from "@phosphor-icons/react";

const ICONS = {
  house: House,
  plus: Plus,
  plusCircle: PlusCircle,
  vault: Vault,
  pulse: Pulse,
  heart: Heart,
  doc: FileText,
  bell: Bell,
  search: MagnifyingGlass,
  share: Export,
  chevron: CaretRight,
  chevronDown: CaretDown,
  swap: ArrowsLeftRight,
  down: ArrowDown,
  up: ArrowUp,
  sparkle: Sparkle,
  tag: Tag,
  layers: Stack,
  lock: Lock,
  key: Key,
  shield: ShieldCheck,
  clock: Clock,
  person: User,
  check: Check,
  wallet: Wallet,
  ellipsis: DotsThree,
  trophy: Trophy,
  arrowUp: ArrowUp,
  arrowDown: ArrowDown,
} satisfies Record<string, Icon>;

export type IconName = keyof typeof ICONS;

/** `stroke` is kept for call-site compatibility: ≥2.4 renders bold, otherwise regular. `weight` overrides. */
export function Sym({ name, size = 18, stroke = 1.9, weight, className = "" }: { name: IconName; size?: number; stroke?: number; weight?: IconWeight; className?: string }) {
  const C = ICONS[name];
  return <C size={size} weight={weight ?? (stroke >= 2.4 ? "bold" : "regular")} className={`shrink-0 ${className}`} aria-hidden />;
}

/** Rounded-square symbol tile. Neutral by default; `accent` uses the system tint. */
export function SymTile({ name, size = 30, accent = false }: { name: IconName; size?: number; accent?: boolean }) {
  return (
    <span className={`grid shrink-0 place-items-center rounded-[28%] ${accent ? "bg-tint text-white" : "bg-fill text-ink"}`} style={{ width: size, height: size }}>
      <Sym name={name} size={size * 0.56} weight="bold" />
    </span>
  );
}
