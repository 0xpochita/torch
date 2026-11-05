"use client";

import { useSyncExternalStore } from "react";
import DotGrid from "@/components/react-bits/DotGrid";

// Re-read theme tokens whenever the appearance changes (data-theme or OS setting).
function subscribe(onChange: () => void) {
  const mo = new MutationObserver(onChange);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", onChange);
  return () => {
    mo.disconnect();
    mq.removeEventListener("change", onChange);
  };
}
const read = () => {
  const css = getComputedStyle(document.documentElement);
  return `${css.getPropertyValue("--line").trim()}|${css.getPropertyValue("--tint").trim()}`;
};

/** Springy dot grid behind the Explore hero; colours follow the theme. */
export function HeroBackdrop() {
  const tokens = useSyncExternalStore(subscribe, read, () => "");
  if (!tokens) return null;
  const [base, active] = tokens.split("|");
  return (
    <div aria-hidden className="pointer-events-auto absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black_45%,transparent_85%)]">
      <DotGrid dotSize={4} gap={22} baseColor={base} activeColor={active} proximity={140} shockRadius={220} shockStrength={4} />
    </div>
  );
}
