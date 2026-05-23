import React, { useState } from "react";
import { TermPane } from "./TermPane.js";
import { useT } from "../i18n.js";

interface Tab {
  id: string;
  title: string;
}

let nextNum = 0;

function makeTab(): Tab {
  nextNum += 1;
  const id = `t${Date.now().toString(36)}-${nextNum}`;
  return { id, title: `terminal` };
}

interface TerminalsProps {
  /** Whether the parent view is currently visible. */
  active: boolean;
}

export function Terminals({ active }: TerminalsProps): React.ReactElement {
  const t = useT();
  const [tabs, setTabs] = useState<Tab[]>(() => [makeTab()]);
  const [activeId, setActiveId] = useState<string>(tabs[0]!.id);
  const [closingIds, setClosingIds] = useState<Set<string>>(new Set());

  function addTab(): void {
    const tab = makeTab();
    setTabs((p) => [...p, tab]);
    setActiveId(tab.id);
  }

  function closeTab(id: string, e: React.MouseEvent): void {
    e.stopPropagation();
    // Mark as closing for animation
    setClosingIds((prev) => new Set(prev).add(id));
    setTimeout(() => {
      setTabs((prev) => {
        const idx = prev.findIndex((t) => t.id === id);
        if (idx === -1) return prev;
        const next = prev.filter((t) => t.id !== id);
        if (next.length === 0) {
          const fresh = makeTab();
          setActiveId(fresh.id);
          return [fresh];
        }
        if (activeId === id) {
          const fallback = next[Math.max(0, idx - 1)]!;
          setActiveId(fallback.id);
        }
        return next;
      });
      setClosingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 180);
  }

  return (
    <div className="terminals">
      <div className="terminals__header">
        <span className="terminals__title">{t("term.title")}</span>
        <button
          className="terminals__new-btn"
          onClick={addTab}
          title={t("term.new")}
          aria-label={t("term.new")}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>
      <div className="terminals__body">
        <div className="terminals__panes">
          {tabs.map((tab) => (
            <TermPane
              key={tab.id}
              id={tab.id}
              visible={active && tab.id === activeId}
            />
          ))}
        </div>
        <div className="terminals__sidebar">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={
                "terminals__tab" +
                (tab.id === activeId ? " terminals__tab--active" : "") +
                (closingIds.has(tab.id) ? " terminals__tab--closing" : "")
              }
              onClick={() => setActiveId(tab.id)}
            >
              <svg className="terminals__tab-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="4 17 10 11 4 5" />
                <line x1="12" y1="19" x2="20" y2="19" />
              </svg>
              <span className="terminals__tab-name">{tab.title}</span>
              <button
                className="terminals__tab-close"
                onClick={(e) => closeTab(tab.id, e)}
                title={t("term.close")}
                aria-label={t("term.close_tab")}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 4h10M6 4V2.5h4V4M5 4l1 9.5h4L11 4" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
