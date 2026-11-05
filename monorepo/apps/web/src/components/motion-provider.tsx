"use client";

import { MotionConfig } from "motion/react";

/** One spring for the whole app; honours the OS "reduce motion" setting. */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ type: "spring", stiffness: 420, damping: 36 }}>
      {children}
    </MotionConfig>
  );
}
