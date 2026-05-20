import React, { useState } from "react";
import { TermPane } from "./TermPane.js";

interface Tab {
  id: string;
  title: string;
}

let nextNum = 0;

function makeTab(): Tab {
  nextNum += 1;
  const id = `t${Date.now().toString(36)}-${nextNum}`;
  return { id, title: `Terminal ${nextNum}` };
}

interface TerminalsProps {
  /** Whether the parent view is currently visible. */
  active: boolean;
}

export function Terminals({ active }: TerminalsProps): React.ReactElement {
  const [tabs, setTabs] = useState<Tab[]>(() => [makeTab()]);
  const [activeId, setActiveId] = useState<string>(tabs[0]!.id);

  function addTab(): void {
    const t = makeTab();
    setTabs((p) => [...p, t]);
    setActiveId(t.id);
  }

  function closeTab(id: string, e: React.MouseEvent): void {
    e.stopPropagation();
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
  }

  return (
    <div className="terminals">
      <div className="termtabs">
        {tabs.map((t) => (
          <div
            key={t.id}
            className={
              "termtabs__tab" +
              (t.id === activeId ? " termtabs__tab--active" : "")
            }
            onClick={() => setActiveId(t.id)}
          >
            <span className="termtabs__title">{t.title}</span>
            <button
              className="termtabs__close"
              onClick={(e) => closeTab(t.id, e)}
              title="Close"
              aria-label="Close tab"
            >
              ×
            </button>
          </div>
        ))}
        <button className="termtabs__new" onClick={addTab} title="New terminal">
          +
        </button>
      </div>
      <div className="terminals__panes">
        {tabs.map((t) => (
          <TermPane
            key={t.id}
            id={t.id}
            visible={active && t.id === activeId}
          />
        ))}
      </div>
    </div>
  );
}
