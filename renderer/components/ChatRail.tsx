import React, { useState } from "react";
import type { Project } from "../types.js";
import { ContextMenu, type MenuItem } from "./ContextMenu.js";
import { SidebarToggleIcon } from "./icons.js";
import { useT } from "../i18n.js";

interface Props {
  projects: Project[];
  activeId: string | null;
  expanded: boolean;
  onPick: (id: string) => void;
  onAdd: () => void;
  onClose: () => void;
  onRemove: (id: string) => void;
  onToggleExpanded: () => void;
  onSettings: () => void;
}

interface Ctx {
  x: number;
  y: number;
  project: Project;
}

function initial(name: string, fallback: number): string {
  const t = name.trim();
  if (!t) return String(fallback + 1);
  const ch = t.replace(/[^\p{L}\p{N}]+/gu, "")[0];
  return ch ? ch.toUpperCase() : String(fallback + 1);
}

export function ChatRail({
  projects,
  activeId,
  expanded,
  onPick,
  onAdd,
  onClose,
  onRemove,
  onToggleExpanded,
  onSettings,
}: Props): React.ReactElement {
  const t = useT();
  const [ctx, setCtx] = useState<Ctx | null>(null);

  function buildItems(c: Ctx): MenuItem[] {
    const isActive = c.project.id === activeId;
    return [
      ...(isActive
        ? [
            {
              label: t("rail.close_project"),
              onClick: () => onClose(),
            },
            { label: "-", onClick: () => {} },
          ]
        : []),
      {
        label: t("rail.open_project"),
        disabled: isActive,
        onClick: () => onPick(c.project.id),
      },
      {
        label: t("rail.reveal_explorer"),
        onClick: () => window.vibe.fs.reveal(c.project.path),
      },
      { label: "-", onClick: () => {} },
      {
        label: t("rail.remove_from_list"),
        danger: true,
        onClick: () => onRemove(c.project.id),
      },
    ];
  }

  return (
    <div className="chatrail">
      <button
        className={
          "chatrail__top" + (expanded ? " chatrail__top--active" : "")
        }
        onClick={onToggleExpanded}
        title={expanded ? t("rail.hide_sessions") : t("rail.show_sessions")}
        aria-label={t("rail.toggle_sessions")}
      >
        <SidebarToggleIcon />
      </button>

      <div className="chatrail__list">
        {projects.map((p, i) => {
          const isActive = p.id === activeId;
          return (
            <button
              key={p.id}
              className={
                "chatrail__tile" + (isActive ? " chatrail__tile--active" : "")
              }
              onClick={() => onPick(p.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                setCtx({ x: e.clientX, y: e.clientY, project: p });
              }}
              title={`${p.name}\n${p.path}`}
              style={
                isActive
                  ? ({ "--tile-color": p.color } as React.CSSProperties)
                  : undefined
              }
            >
              <span
                className="chatrail__avatar"
                style={{ background: p.color }}
              >
                {initial(p.name, i)}
              </span>
            </button>
          );
        })}
        <button
          className="chatrail__add"
          onClick={onAdd}
          title={t("rail.open_folder")}
          aria-label={t("rail.open_folder")}
        >
          +
        </button>
      </div>

      <div className="chatrail__bottom">
        <button
          className="chatrail__settings"
          title={t("rail.settings")}
          aria-label={t("rail.settings")}
          onClick={onSettings}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1.08 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1.08z" />
          </svg>
        </button>
      </div>

      {ctx ? (
        <ContextMenu
          x={ctx.x}
          y={ctx.y}
          items={buildItems(ctx)}
          onClose={() => setCtx(null)}
        />
      ) : null}

    </div>
  );
}
