import React, { useEffect, useState } from "react";
import { useT } from "../i18n.js";

/** Build a short label like "cs2/soft" from an absolute project path,
 *  showing only the parent folder + project folder. */
function shortPath(path: string): string {
  const norm = path.replace(/\\/g, "/").replace(/\/+$/, "");
  const parts = norm.split("/").filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0]!;
  return parts.slice(-2).join("/");
}

export function Titlebar(): React.ReactElement {
  const t = useT();
  const [label, setLabel] = useState("~open@root");

  useEffect(() => {
    let cancelled = false;
    async function refresh(): Promise<void> {
      const active = await window.vibe.projects.active();
      if (cancelled) return;
      setLabel(active ? shortPath(active.path) : "~open@root");
    }
    refresh();
    // Project changes don't push events, so re-read on focus to catch
    // switches made elsewhere (e.g. picking a different project in the rail).
    const onFocus = (): void => { refresh(); };
    window.addEventListener("focus", onFocus);
    const interval = window.setInterval(refresh, 1500);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      window.clearInterval(interval);
    };
  }, []);

  return (
    <div className="titlebar">
      <div className="titlebar__drag">
        <span className="titlebar__title" title={label}>{label}</span>
      </div>
      <div className="titlebar__controls">
        <button
          className="titlebar__btn"
          onClick={() => window.vibe.window.minimize()}
          title={t("title.minimize")}
          aria-label={t("title.minimize")}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M2 6h8" />
          </svg>
        </button>
        <button
          className="titlebar__btn"
          onClick={() => window.vibe.window.maximize()}
          title={t("title.maximize")}
          aria-label={t("title.maximize")}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="2" width="8" height="8" />
          </svg>
        </button>
        <button
          className="titlebar__btn titlebar__btn--close"
          onClick={() => window.vibe.window.close()}
          title={t("title.close")}
          aria-label={t("title.close")}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M2 2l8 8M10 2l-8 8" />
          </svg>
        </button>
      </div>
    </div>
  );
}
