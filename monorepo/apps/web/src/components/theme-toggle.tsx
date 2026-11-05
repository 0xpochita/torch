"use client";

import { useSyncExternalStore } from "react";

const MODES = ["system", "light", "dark"] as const;
type Mode = (typeof MODES)[number];

const ICON: Record<Mode, string> = {
  system: "M4 5h16v11H4zM9 20h6M12 16v4",
  light: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  dark: "M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z",
};
const LABEL: Record<Mode, string> = { system: "Auto", light: "Light", dark: "Dark" };

/** Inline in <head> so the stored theme applies before first paint. */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

function read(): Mode {
  const t = document.documentElement.getAttribute("data-theme");
  return t === "light" || t === "dark" ? t : "system";
}

// The <html data-theme> attribute is the source of truth; the head script sets it before paint.
function subscribe(onChange: () => void) {
  const mo = new MutationObserver(onChange);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
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
    return (
      <button onClick={() => apply(next)} title={`Appearance: ${LABEL[mode]}`} className="grid size-10 place-items-center rounded-full text-muted hover:bg-fill">
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d={ICON[mode]} />
        </svg>
      </button>
    );
  }

  return (
    <div role="radiogroup" aria-label="Appearance" className="grid grid-cols-3 rounded-[10px] bg-fill p-[2px] text-[12px]">
      {MODES.map((m) => (
        <button
          key={m}
          role="radio"
          aria-checked={mode === m}
          onClick={() => apply(m)}
         
          className={`flex items-center justify-center gap-1 rounded-[8px] py-1 font-medium transition ${mode === m ? "bg-raised shadow-[0_3px_8px_#0000001f]" : "text-muted"}`}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d={ICON[m]} />
          </svg>
          {LABEL[m]}
        </button>
      ))}
    </div>
  );
}
