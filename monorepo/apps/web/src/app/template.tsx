"use client";

import { motion } from "motion/react";

/**
 * Re-mounts on every navigation, so each page eases in.
 * Slide only, no opacity: server HTML must be visible before hydration.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ y: 10 }}
      animate={{ y: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 30 }}
      className="flex min-w-0 flex-1 flex-col"
    >
      {children}
    </motion.div>
  );
}
