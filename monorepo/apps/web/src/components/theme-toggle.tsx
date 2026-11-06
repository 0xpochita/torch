"use client";

import type { Icon } from "@phosphor-icons/react";
import { Desktop, Moon, Sun } from "@phosphor-icons/react/ssr";
import Image from "next/image";
import { useSyncExternalStore } from "react";

const MODES = ["system", "light", "dark"] as const;
type Mode = (typeof MODES)[number];

const ICON: Record<Mode, Icon> = { system: Desktop, light: Sun, dark: Moon };
const LABEL: Record<Mode, string> = {
  system: "Auto",
  light: "Light",
  dark: "Dark",
};

/** Inline in <head> so the stored theme applies before first paint. */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

function read(): Mode {
  const t = document.documentElement.getAttribute("data-theme");
  return t === "light" || t === "dark" ? t : "system";
}

// The <html data-theme> attribute is the source of truth; the head script sets it before paint.
function subscribe(onChange: () => void) {
  const mo = new MutationObserver(onChange);
  mo.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => mo.disconnect();
}

/** iOS-style appearance switch: Auto / Light / Dark. */
export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const mode = useSyncExternalStore(subscribe, read, () => "system" as Mode);

  const apply = (m: Mode) => {
    const el = document.documentElement;
    if (m === "system") el.removeAttribute("data-theme");
    else el.setAttribute("data-theme", m);
    try {
      if (m === "system") localStorage.removeItem("theme");
      else localStorage.setItem("theme", m);
    } catch {
      // storage unavailable (private mode); theme still applies for this visit
    }
  };

  if (compact) {
    const next = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
    const Current = ICON[mode];
    return (
      <button
        onClick={() => apply(next)}
        title={`Appearance: ${LABEL[mode]}`}
        className="group grid size-10 place-items-center rounded-full text-muted hover:bg-fill"
      >
        <span className="relative">
          <Image src="/icons/3d/theme.png" alt="" width={22} height={22} className="opacity-80 transition group-hover:scale-110 group-hover:opacity-100" />
          <span className="absolute -bottom-1 -right-1.5 grid size-4 place-items-center rounded-full bg-surface text-muted shadow-[0_0_0_1px_var(--line)]">
            <Current size={10} weight="bold" />
          </span>
        </span>
      </button>
    );
  }

  return (
    <div
      role="radiogroup"
      aria-label="Appearance"
      className="grid grid-cols-3 rounded-[10px] bg-fill p-[2px] text-[12px]"
    >
      {MODES.map((m) => {
        const I = ICON[m];
        return (
          <button
            key={m}
            role="radio"
            aria-checked={mode === m}
            onClick={() => apply(m)}

            className={`flex items-center justify-center gap-1 rounded-[8px] py-1 font-medium transition ${mode === m ? "bg-raised shadow-[0_3px_8px_#0000001f]" : "text-muted"}`}
          >
            <I size={13} weight="bold" />
            {LABEL[m]}
          </button>
        );
      })}
    </div>
  );
}
