// Project avatar shape preference. Mirrors the theme module pattern.

import { useEffect, useState } from "react";

export type AvatarShape = "square" | "round";

const STORAGE_KEY = "vibe_avatar_shape";
const EVENT_NAME = "vibe-avatar-shape-change";

export function getCurrentAvatarShape(): AvatarShape {
  return localStorage.getItem(STORAGE_KEY) === "round" ? "round" : "square";
}

export function applyAvatarShape(shape: AvatarShape): void {
  document.documentElement.setAttribute("data-avatar-shape", shape);
}

export function setCurrentAvatarShape(shape: AvatarShape): void {
  localStorage.setItem(STORAGE_KEY, shape);
  applyAvatarShape(shape);
  window.dispatchEvent(new Event(EVENT_NAME));
}

export function useAvatarShape(): AvatarShape {
  const [shape, setShape] = useState<AvatarShape>(getCurrentAvatarShape);
  useEffect(() => {
    function onChange(): void {
      setShape(getCurrentAvatarShape());
    }
    window.addEventListener(EVENT_NAME, onChange);
    return () => window.removeEventListener(EVENT_NAME, onChange);
  }, []);
  return shape;
}
