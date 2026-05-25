// Agent mode: vibe (act) or plan (think first, no edits).

import { useEffect, useState } from "react";

export type AgentMode = "vibe" | "plan";

const STORAGE_KEY = "vibe_agent_mode";
const EVENT_NAME = "vibe-agent-mode-change";

export function getCurrentAgentMode(): AgentMode {
  return localStorage.getItem(STORAGE_KEY) === "plan" ? "plan" : "vibe";
}

export function setCurrentAgentMode(mode: AgentMode): void {
  localStorage.setItem(STORAGE_KEY, mode);
  window.dispatchEvent(new Event(EVENT_NAME));
}

export function useAgentMode(): [AgentMode, (m: AgentMode) => void] {
  const [mode, setMode] = useState<AgentMode>(getCurrentAgentMode);
  useEffect(() => {
    function onChange(): void {
      setMode(getCurrentAgentMode());
    }
    window.addEventListener(EVENT_NAME, onChange);
    return () => window.removeEventListener(EVENT_NAME, onChange);
  }, []);
  return [mode, (m) => setCurrentAgentMode(m)];
}
