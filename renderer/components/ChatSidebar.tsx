import React, { useEffect, useRef, useState } from "react";
import type { ChatSummary, Project } from "../types.js";
import { useT } from "../i18n.js";

interface Props {
  open: boolean;
  projects: Project[];
  activeProjectId: string | null;
  activeChatId: string | null;
  onPickProjectChat: (projectId: string, chatId: string) => void;
  onNewProject: () => void;
  onNewSession: (projectId: string) => void;
  onRemoveProject: (id: string) => void;
  onDeleteChat: (projectId: string, chatId: string) => void;
  onRenameChat: (projectId: string, chatId: string, title: string) => void;
  onClose: () => void;
}

interface ProjectGroup {
  project: Project;
  chats: ChatSummary[];
}

function FolderIcon(): React.ReactElement {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
    </svg>
  );
}

/** Format a timestamp as a compact relative label: 4h, 2d, 3w, 1mo, 1y. */
function relTime(ts: number, now: number): string {
  const diff = Math.max(0, now - ts);
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo`;
  const y = Math.floor(d / 365);
  return `${y}y`;
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
          const trimmed = v.trim();
          if (trimmed && trimmed !== initial) onCommit(trimmed);
          else onCancel();
        } else if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
      onBlur={() => {
        const trimmed = v.trim();
        if (trimmed && trimmed !== initial) onCommit(trimmed);
        else onCancel();
      }}
      spellCheck={false}
    />
  );
}

function PopMenu({
  onRename,
  onDelete,
}: {
  onRename: () => void;
  onDelete: () => void;
}): React.ReactElement {
  const t = useT();
  return (
    <div className="popmenu" role="menu">
      <button className="popmenu__item" role="menuitem" onClick={(e) => { e.stopPropagation(); onRename(); }}>
        {t("common.rename")}
      </button>
      <div className="popmenu__sep" />
      <button
        className="popmenu__item popmenu__item--danger"
        role="menuitem"
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
      >
        {t("common.delete")}
      </button>
    </div>
  );
}

function ProjectMenu({
  onNewSession,
  onReveal,
  onRemove,
}: {
  onNewSession: () => void;
  onReveal: () => void;
  onRemove: () => void;
}): React.ReactElement {
  const t = useT();
  return (
    <div className="popmenu" role="menu">
      <button className="popmenu__item" role="menuitem" onClick={(e) => { e.stopPropagation(); onNewSession(); }}>
        {t("chatside.new_session")}
      </button>
      <div className="popmenu__sep" />
      <button className="popmenu__item" role="menuitem" onClick={(e) => { e.stopPropagation(); onReveal(); }}>
        {t("rail.reveal_explorer")}
      </button>
      <div className="popmenu__sep" />
      <button
        className="popmenu__item popmenu__item--danger"
        role="menuitem"
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
      >
        {t("rail.remove_from_list")}
      </button>
    </div>
  );
}

export function ChatSidebar({
  open,
  projects,
  activeProjectId,
  activeChatId,
  onPickProjectChat,
  onNewProject,
  onNewSession,
  onRemoveProject,
  onDeleteChat,
  onRenameChat,
  onClose,
}: Props): React.ReactElement {
  const t = useT();
  const [groups, setGroups] = useState<ProjectGroup[]>([]);
  const [chatMenuFor, setChatMenuFor] = useState<string | null>(null);
  const [projMenuFor, setProjMenuFor] = useState<string | null>(null);
  const [renamingChatId, setRenamingChatId] = useState<string | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());

  // Refresh "now" every 60s so relative timestamps stay accurate without
  // remounting the panel.
  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, [open]);

  // Load chats for every project whenever the sidebar opens or the
  // project list changes. We intentionally do NOT depend on activeChatId
  // — switching the active session must NOT re-sort the list.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const fetched = await Promise.all(
        projects.map(async (p) => ({
          project: p,
          chats: await window.vibe.projects.chatsList(p.id),
        })),
      );
      if (!cancelled) setGroups(fetched);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, projects]);

  /** Reload chats for a single project (after rename/delete/new). */
  async function refreshProjectChats(projectId: string): Promise<void> {
    const list = await window.vibe.projects.chatsList(projectId);
    setGroups((prev) =>
      prev.map((g) => (g.project.id === projectId ? { ...g, chats: list } : g)),
    );
  }

  // Close any open popover on outside click
  useEffect(() => {
    if (!chatMenuFor && !projMenuFor) return;
    const handler = (e: MouseEvent): void => {
      const target = e.target as HTMLElement;
      if (target.closest(".popmenu")) return;
      setChatMenuFor(null);
      setProjMenuFor(null);
    };
    const timer = window.setTimeout(() => {
      window.addEventListener("mousedown", handler);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("mousedown", handler);
    };
  }, [chatMenuFor, projMenuFor]);

  const filtered = groups;

  return (
    <>
      <div
        className={"chatside__overlay" + (open ? " chatside__overlay--show" : "")}
        onClick={onClose}
      />
      <aside className={"chatside" + (open ? " chatside--open" : "")}>
        <div className="chatside__head">
          <div className="chatside__title">{t("chatside.projects")}</div>
        </div>

        <button className="chatside__newproject" onClick={onNewProject}>
          <span>{t("chatside.open_project")}</span>
        </button>

        <div className="chatside__list">
          {filtered.length === 0 ? (
            <div className="chatside__empty">{t("chatside.no_sessions")}</div>
          ) : null}

          {filtered.map((g) => (
            <div key={g.project.id} className="proj-group">
              <div
                className={
                  "proj-group__head" +
                  (g.project.id === activeProjectId ? " proj-group__head--active" : "")
                }
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setProjMenuFor(projMenuFor === g.project.id ? null : g.project.id);
                }}
                title={g.project.path}
              >
                <FolderIcon />
                <span className="proj-group__name">{g.project.name}</span>
                <button
                  className="proj-group__more"
                  onClick={(e) => {
                    e.stopPropagation();
                    setProjMenuFor(projMenuFor === g.project.id ? null : g.project.id);
                  }}
                  aria-label={t("chatside.more")}
                >
                  ⋯
                </button>
                {projMenuFor === g.project.id ? (
                  <ProjectMenu
                    onNewSession={async () => {
                      setProjMenuFor(null);
                      onNewSession(g.project.id);
                      // Defer so backend has time to write the new chat file
                      setTimeout(() => {
                        void refreshProjectChats(g.project.id);
                      }, 80);
                    }}
                    onReveal={() => {
                      setProjMenuFor(null);
                      window.vibe.fs.reveal(g.project.path);
                    }}
                    onRemove={() => {
                      setProjMenuFor(null);
                      onRemoveProject(g.project.id);
                    }}
                  />
                ) : null}
              </div>

              {g.chats.length === 0 ? (
                <div className="proj-group__empty">{t("chatside.no_sessions_short")}</div>
              ) : (
                <div className="proj-group__chats">
                  {g.chats.map((c) => {
                    const isActive =
                      c.id === activeChatId && g.project.id === activeProjectId;
                    return (
                      <div
                        key={c.id}
                        className={
                          "proj-chat" + (isActive ? " proj-chat--active" : "")
                        }
                        onClick={() => {
                          if (renamingChatId !== c.id) {
                            onPickProjectChat(g.project.id, c.id);
                          }
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setChatMenuFor(chatMenuFor === c.id ? null : c.id);
                        }}
                        title={c.title}
                      >
                        {renamingChatId === c.id ? (
                          <RenameInput
                            initial={c.title || t("common.untitled")}
                            onCommit={async (title) => {
                              onRenameChat(g.project.id, c.id, title);
                              setRenamingChatId(null);
                              await refreshProjectChats(g.project.id);
                            }}
                            onCancel={() => setRenamingChatId(null)}
                          />
                        ) : (
                          <span className="proj-chat__title">
                            {c.title || t("common.untitled")}
                          </span>
                        )}
                        <span className="proj-chat__time">
                          {relTime(c.updatedAt, now)}
                        </span>
                        <button
                          className="proj-chat__more"
                          onClick={(e) => {
                            e.stopPropagation();
                            setChatMenuFor(chatMenuFor === c.id ? null : c.id);
                          }}
                          aria-label={t("chatside.more")}
                        >
                          ⋯
                        </button>
                        {chatMenuFor === c.id ? (
                          <PopMenu
                            onRename={() => {
                              setChatMenuFor(null);
                              setRenamingChatId(c.id);
                            }}
                            onDelete={async () => {
                              setChatMenuFor(null);
                              await onDeleteChat(g.project.id, c.id);
                              await refreshProjectChats(g.project.id);
                            }}
                          />
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </aside>
    </>
  );
}
