// Theme management for OpenVibe. Mirrors the i18n module pattern: theme is
// stored in localStorage, applied by setting `data-theme` on <html>, and
// components subscribe to changes via the `useTheme()` hook.

import { useEffect, useState } from "react";

export type Theme = "dark" | "light" | "codex";

const STORAGE_KEY = "vibe_theme";
const EVENT_NAME = "vibe-theme-change";

export function getCurrentTheme(): Theme {
  const v = localStorage.getItem(STORAGE_KEY);
  if (v === "light") return "light";
  if (v === "dark") return "dark";
  if (v === "codex") return "codex";
  return "codex";
}

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute("data-theme", theme);
}

export function setCurrentTheme(theme: Theme): void {
  localStorage.setItem(STORAGE_KEY, theme);
  applyTheme(theme);
  window.dispatchEvent(new Event(EVENT_NAME));
}

export function useTheme(): Theme {
  const [theme, setTheme] = useState<Theme>(getCurrentTheme);
  useEffect(() => {
    function onChange(): void {
      setTheme(getCurrentTheme());
    }
    window.addEventListener(EVENT_NAME, onChange);
    return () => window.removeEventListener(EVENT_NAME, onChange);
  }, []);
  return theme;
}
