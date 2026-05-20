import React, { useEffect, useMemo, useRef, useState } from "react";
import type { ChatSummary } from "../types.js";

interface Props {
  open: boolean;
  chats: ChatSummary[];
  activeId: string | null;
  workspace: string;
  workspaceLabel: string;
  onPick: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onClose: () => void;
}

function PenIcon(): React.ReactElement {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M11 2.5l2.5 2.5-8 8H3v-2.5l8-8z" />
    </svg>
  );
}

function HandleIcon(): React.ReactElement {
  return (
    <span className="grid-icon" aria-hidden="true">
      <span /><span /><span />
      <span /><span /><span />
      <span /><span /><span />
    </span>
  );
}

function PopMenu({
  onRename,
  onDelete,
}: {
  onRename: () => void;
  onDelete: () => void;
}): React.ReactElement {
  return (
    <div className="popmenu" role="menu" onClick={(e) => e.stopPropagation()}>
      <button className="popmenu__item" role="menuitem" onClick={onRename}>
        <svg
          width="13"
          height="13"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M11 2.5l2.5 2.5-8 8H3v-2.5l8-8z" />
        </svg>
        Rename
      </button>
      <div className="popmenu__sep" />
      <button
        className="popmenu__item popmenu__item--danger"
        role="menuitem"
        onClick={onDelete}
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M3 4h10M6 4V2.5h4V4M5 4l1 9.5h4L11 4" />
        </svg>
        Delete
      </button>
    </div>
  );
}

function RenameInput({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string;
  onCommit: (v: string) => void;
  onCancel: () => void;
}): React.ReactElement {
  const [v, setV] = useState(initial);
  const ref = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <input
      ref={ref}
      className="chatside__rename"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const t = v.trim();
          if (t && t !== initial) onCommit(t);
          else onCancel();
        } else if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
      onBlur={() => {
        const t = v.trim();
        if (t && t !== initial) onCommit(t);
        else onCancel();
      }}
      spellCheck={false}
    />
  );
}

export function ChatSidebar({
  open,
  chats,
  activeId,
  workspace,
  workspaceLabel,
  onPick,
  onNew,
  onDelete,
  onRename,
  onClose,
}: Props): React.ReactElement {
  const [query, setQuery] = useState("");
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string | null>(null);

  // Close popover on outside click
  useEffect(() => {
    if (!menuFor) return;
    const onDown = (e: MouseEvent): void => {
      // Don't close if click is inside the popover itself
      const target = e.target as HTMLElement;
      if (target.closest(".popmenu")) return;
      setMenuFor(null);
    };
    // Use setTimeout so the current click that opened the menu doesn't immediately close it
    const timer = setTimeout(() => {
      window.addEventListener("mousedown", onDown);
    }, 0);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("mousedown", onDown);
    };
  }, [menuFor]);

  // Pull project name from package.json
  useEffect(() => {
    let cancelled = false;
    setProjectName(null);
    window.vibe.fs.projectInfo(workspace).then((res) => {
      if (cancelled) return;
      if (res.ok && res.name) setProjectName(res.name);
    });
    return () => {
      cancelled = true;
    };
  }, [workspace]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return chats;
    return chats.filter((c) => c.title.toLowerCase().includes(q));
  }, [chats, query]);

  const displayName = projectName ?? workspaceLabel;

  return (
    <>
      <div
        className={"chatside__overlay" + (open ? " chatside__overlay--show" : "")}
        onClick={onClose}
      />
      <aside className={"chatside" + (open ? " chatside--open" : "")}>
        <div className="chatside__head">
          <div className="chatside__name">{displayName}</div>
          <div className="chatside__path" title={workspace}>
            {workspace}
          </div>
        </div>

        <button className="chatside__newsession" onClick={onNew}>
          <PenIcon />
          <span>New session</span>
        </button>

        <input
          className="chatside__search"
          placeholder="Search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          spellCheck={false}
        />

        <div className="chatside__list">
          {filtered.length === 0 ? (
            <div className="chatside__empty">
              {query ? "No matches" : "No sessions yet"}
            </div>
          ) : null}
          {filtered.map((c) => (
            <div
              key={c.id}
              className={
                "chatside__row" +
                (c.id === activeId ? " chatside__row--active" : "")
              }
              onClick={() => {
                if (renamingId !== c.id) onPick(c.id);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setMenuFor(menuFor === c.id ? null : c.id);
              }}
              title={c.title}
            >
              <span className="chatside__handle">
                <HandleIcon />
              </span>
              {renamingId === c.id ? (
                <RenameInput
                  initial={c.title || "Untitled"}
                  onCommit={(t) => {
                    onRename(c.id, t);
                    setRenamingId(null);
                  }}
                  onCancel={() => setRenamingId(null)}
                />
              ) : (
                <span className="chatside__rowtitle">
                  {c.title || "Untitled"}
                </span>
              )}
              <button
                className="chatside__more"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuFor(menuFor === c.id ? null : c.id);
                }}
                aria-label="More"
              >
                ⋯
              </button>
              {menuFor === c.id ? (
                <PopMenu
                  onRename={() => {
                    setMenuFor(null);
                    setRenamingId(c.id);
                  }}
                  onDelete={() => {
                    setMenuFor(null);
                    onDelete(c.id);
                  }}
                />
              ) : null}
            </div>
          ))}
        </div>
      </aside>
    </>
  );
}
