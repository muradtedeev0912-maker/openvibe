// Composer input shape preference. Mirrors the theme/avatarShape modules.

import { useEffect, useState } from "react";

export type ComposerStyle = "compact" | "expanded";

const STORAGE_KEY = "vibe_composer_style";
const EVENT_NAME = "vibe-composer-style-change";

export function getCurrentComposerStyle(): ComposerStyle {
  return localStorage.getItem(STORAGE_KEY) === "expanded" ? "expanded" : "compact";
}

export function applyComposerStyle(style: ComposerStyle): void {
  document.documentElement.setAttribute("data-composer-style", style);
}

export function setCurrentComposerStyle(style: ComposerStyle): void {
  localStorage.setItem(STORAGE_KEY, style);
  applyComposerStyle(style);
  window.dispatchEvent(new Event(EVENT_NAME));
}

export function useComposerStyle(): ComposerStyle {
  const [style, setStyle] = useState<ComposerStyle>(getCurrentComposerStyle);
  useEffect(() => {
    function onChange(): void {
      setStyle(getCurrentComposerStyle());
    }
    window.addEventListener(EVENT_NAME, onChange);
    return () => window.removeEventListener(EVENT_NAME, onChange);
  }, []);
  return style;
}
