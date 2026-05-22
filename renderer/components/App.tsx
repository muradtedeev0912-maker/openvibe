import React, { useCallback, useEffect, useRef, useState } from "react";
import type {
  ChatRecord,
  ChatSummary,
  ConfirmPayload,
  ContentPart,
  Project,
  VibeConfig,
  VibeEvent,
} from "../types.js";
import { ChatRail } from "./ChatRail.js";
import { ChatSidebar } from "./ChatSidebar.js";
import { Composer, type SendPayload } from "./Composer.js";
import { Confirm } from "./Confirm.js";
import { Editor } from "./Editor.js";
import { FileTree } from "./FileTree.js";
import { History, type HistoryItem } from "./History.js";
import { Settings } from "./Settings.js";
import { Terminals } from "./Terminals.js";
import { Titlebar } from "./Titlebar.js";
import successSfx from "../succes.mp3";

function playSound(src: string): void {
  const audio = new Audio(src);
  audio.volume = 0.5;
  audio.play().catch(() => {});
}

type FatalState = { kind: "ok" } | { kind: "fatal"; error: string };

let nextLocalId = 0;
const localId = (): string => `l${++nextLocalId}`;

/** Convert a saved ChatRecord into UI history items (best-effort, lossy). */
function recordToItems(record: ChatRecord): HistoryItem[] {
  const out: HistoryItem[] = [];
  for (const msg of record.messages) {
    if (msg.role === "system") continue;
    if (msg.role === "user") {
      const text =
        typeof msg.content === "string"
          ? msg.content
          : Array.isArray(msg.content)
            ? msg.content
                .map((p) => (p.type === "text" ? p.text : "[image]"))
                .join(" ")
            : "";
      out.push({ id: localId(), kind: "user", text });
    } else if (msg.role === "assistant") {
      const text =
        typeof msg.content === "string"
          ? msg.content
          : Array.isArray(msg.content)
            ? msg.content
                .map((p) => (p.type === "text" ? p.text : ""))
                .join("")
            : "";
      if (text) out.push({ id: localId(), kind: "assistant", text });
      for (const tc of msg.tool_calls ?? []) {
        let parsed: unknown = {};
        try {
          parsed = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
        } catch {
          parsed = tc.function.arguments;
        }
        out.push({
          id: tc.id,
          kind: "tool",
          text: "",
          toolName: tc.function.name,
          toolArgs: parsed,
        });
      }
    } else if (msg.role === "tool") {
      const idx = out.findIndex(
        (it) => it.kind === "tool" && it.id === msg.tool_call_id,
      );
      if (idx >= 0) {
        const text =
          typeof msg.content === "string"
            ? msg.content
            : Array.isArray(msg.content)
              ? msg.content
                  .map((p) => (p.type === "text" ? p.text : ""))
                  .join("")
              : "";
        out[idx] = { ...out[idx]!, text, ok: true };
      }
    }
  }
  return out;
}

export function App(): React.ReactElement {
  const [state, setState] = useState<FatalState>({ kind: "ok" });
  const [config, setConfig] = useState<VibeConfig | null>(null);
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<ConfirmPayload | null>(null);
  const [termVisible, setTermVisible] = useState(false);
  const [editorVisible, setEditorVisible] = useState(false);
  const [folder, setFolder] = useState<string | null>(null);
  const [editorPath, setEditorPath] = useState<string | null>(null);
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [chatSideOpen, setChatSideOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mcpOpen, setMcpOpen] = useState(false);
  const [snapshotOpen, setSnapshotOpen] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [expandToPath, setExpandToPath] = useState<string | null>(null);
  const [chatInject, setChatInject] = useState<string | null>(null);
  const [termHeight, setTermHeight] = useState(220);
  const [editorWidth, setEditorWidth] = useState(420);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<string | null>(null);
  const streamingId = useRef<string | null>(null);
  const [streamingNow, setStreamingNow] = useState<string | null>(null);
  const pendingAttachments = useRef<HistoryItem["attachments"]>(undefined);

  /** Save current project's UI state to localStorage */
  function saveProjectState(projectId: string | null): void {
    if (!projectId) return;
    const state = {
      openTabs,
      editorPath,
      editorVisible,
      termVisible,
      editorWidth,
      termHeight,
    };
    localStorage.setItem(`vibe_project_ui_${projectId}`, JSON.stringify(state));
  }

  /** Restore a project's UI state from localStorage */
  function restoreProjectState(projectId: string): void {
    const raw = localStorage.getItem(`vibe_project_ui_${projectId}`);
    if (!raw) {
      setEditorPath(null);
      setOpenTabs([]);
      setEditorVisible(false);
      setTermVisible(false);
      setEditorWidth(420);
      setTermHeight(220);
      return;
    }
    try {
      const state = JSON.parse(raw) as {
        openTabs?: string[];
        editorPath?: string | null;
        editorVisible?: boolean;
        termVisible?: boolean;
        editorWidth?: number;
        termHeight?: number;
      };
      setOpenTabs(state.openTabs ?? []);
      setEditorPath(state.editorPath ?? null);
      setEditorVisible(state.editorVisible ?? false);
      setTermVisible(state.termVisible ?? false);
      setEditorWidth(state.editorWidth ?? 420);
      setTermHeight(state.termHeight ?? 220);
    } catch {
      setEditorPath(null);
      setOpenTabs([]);
      setEditorVisible(false);
      setTermVisible(false);
      setEditorWidth(420);
      setTermHeight(220);
    }
  }

  // Init agent on mount
  useEffect(() => {
    let cancelled = false;
    window.vibe.init().then(async (res) => {
      if (cancelled) return;
      if (!res.ok) {
        setState({ kind: "fatal", error: res.error });
        return;
      }
      setConfig(res.config);
      setFolder(res.config.cwd);
      setState({ kind: "ok" });

      // Restore saved provider from Settings (overrides .env)
      const savedProviders = localStorage.getItem("vibe_providers");
      if (savedProviders) {
        try {
          const list = JSON.parse(savedProviders) as Array<{
            connected: boolean;
            apiKey: string;
            baseUrl: string;
            model: string;
            id: string;
          }>;
          const active = list.find((p) => p.connected && p.apiKey);
          if (active) {
            const model = active.model || "";
            window.vibe.setProvider(active.apiKey, active.baseUrl, model);
            setConfig((c) => c ? { ...c, model, baseUrl: active.baseUrl, apiKey: "***" } : c);
          }
        } catch { /* ignore */ }
      }

      const projectList = await window.vibe.projects.list();
      const active = await window.vibe.projects.active();
      if (cancelled) return;
      setProjects(projectList);
      if (!active) {
        // No project selected — show welcome screen
        return;
      }
      setActiveProject(active.id);
      setFolder(active.path);

      // Restore chat list and open the most recent (or create one)
      const list = await window.vibe.chats.list();
      if (cancelled) return;
      if (list.length === 0) {
        const fresh = await window.vibe.chats.new();
        if (fresh) {
          setChats([fresh]);
          setActiveChat(fresh.id);
        }
      } else {
        setChats(list);
        const top = list[0]!;
        const record = await window.vibe.chats.open(top.id);
        if (cancelled) return;
        setActiveChat(top.id);
        if (record) setItems(recordToItems(record));
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Save project UI state on window close
  useEffect(() => {
    const onBeforeUnload = () => saveProjectState(activeProject);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  });

  // Subscribe to events
  useEffect(() => {
    const offEvent = window.vibe.onEvent((e: VibeEvent) => {
      setItems((prev) => {
        switch (e.kind) {
          case "user": {
            const atts = pendingAttachments.current;
            pendingAttachments.current = undefined;
            return [
              ...prev,
              {
                id: localId(),
                kind: "user",
                text: e.text,
                attachments: atts && atts.length > 0 ? atts : undefined,
              },
            ];
          }
          case "assistant-start": {
            const id = localId();
            streamingId.current = id;
            setStreamingNow(id);
            return [...prev, { id, kind: "assistant", text: "" }];
          }
          case "assistant-chunk": {
            const id = streamingId.current;
            if (!id) return prev;
            return prev.map((it) =>
              it.id === id ? { ...it, text: it.text + e.text } : it,
            );
          }
          case "assistant-end": {
            const id = streamingId.current;
            streamingId.current = null;
            setStreamingNow(null);
            if (!id) return prev;
            return prev.filter((it) => it.id !== id || it.text.length > 0);
          }
          case "tool-call":
            return [
              ...prev,
              {
                id: e.id,
                kind: "tool",
                text: "",
                toolName: e.name,
                toolArgs: e.args,
              },
            ];
          case "tool-result":
            return prev.map((it) =>
              it.id === e.id ? { ...it, text: e.text, ok: e.ok } : it,
            );
          case "tool-denied":
            return prev.map((it) =>
              it.id === e.id ? { ...it, text: "denied", ok: false } : it,
            );
          case "info":
            return [...prev, { id: localId(), kind: "info", text: e.text }];
          case "error":
            return [...prev, { id: localId(), kind: "error", text: e.text }];
        }
      });
      // Update chat list ordering after activity
      if (
        e.kind === "user" ||
        e.kind === "assistant-end" ||
        e.kind === "tool-result"
      ) {
        window.vibe.chats.list().then(setChats);
      }
    });
    const offBusy = window.vibe.onBusy((b) => {
      setBusy((prev) => {
        if (prev && !b) {
          if ((window as any).__vibeAborted) {
            (window as any).__vibeAborted = false;
          } else {
            playSound(successSfx);
          }
        }
        return b;
      });
    });
    const offConfirm = window.vibe.onConfirm(setPending);
    return () => {
      offEvent();
      offBusy();
      offConfirm();
    };
  }, []);

  const handleSlash = useCallback(
    (text: string): boolean => {
      const cmd = text.split(/\s+/)[0]!;
      switch (cmd) {
        case "/exit":
        case "/quit":
          window.close();
          return true;
        case "/help":
          setItems((p) => [
            ...p,
            { id: localId(), kind: "user", text },
            {
              id: localId(),
              kind: "info",
              text:
                "/help    show this list\n" +
                "/model   show active model and endpoint\n" +
                "/new     create project from template\n" +
                "/exit    quit",
            },
          ]);
          return true;
        case "/model": {
          const arg = text.slice(6).trim();
          // Get connected providers from localStorage
          let connectedModels: Array<{ id: string; name: string; model: string }> = [];
          try {
            const saved = localStorage.getItem("vibe_providers");
            if (saved) {
              const list = JSON.parse(saved) as Array<{
                id: string;
                name: string;
                model: string;
                connected: boolean;
              }>;
              connectedModels = list
                .filter((p) => p.connected && p.model)
                .map((p) => ({ id: p.id, name: p.name, model: p.model }));
            }
          } catch { /* ignore */ }

          if (connectedModels.length === 0 && !arg) {
            setItems((p) => [
              ...p,
              { id: localId(), kind: "user", text },
              {
                id: localId(),
                kind: "info",
                text: "No models connected yet. Open Settings (⚙) to add a provider.",
              },
            ]);
            return true;
          }

          if (!arg) {
            setItems((p) => [
              ...p,
              { id: localId(), kind: "user", text },
              {
                id: localId(),
                kind: "model-picker",
                text: "",
                models: connectedModels.map((m) => ({ id: m.model, name: `${m.name} — ${m.model}` })),
                currentModel: config?.model ?? "",
              },
            ]);
            return true;
          }
          // Switch model by name or id
          const q = arg.toLowerCase();
          const match = connectedModels.find(
            (m) => m.model === arg || m.model.includes(q) || m.name.toLowerCase().includes(q),
          );
          const newModel = match?.model ?? arg;
          window.vibe.setModel(newModel);
          if (config) setConfig({ ...config, model: newModel });
          setItems((p) => [
            ...p,
            { id: localId(), kind: "user", text },
            { id: localId(), kind: "info", text: `Switched to: ${newModel}` },
          ]);
          return true;
        }
        case "/new": {
          const arg = text.slice(4).trim().toLowerCase();
          if (arg) {
            window.vibe.templates.list().then(async (templates) => {
              const match = templates.find((t) => t.id === arg || t.name.toLowerCase().includes(arg));
              if (match) {
                const res = await window.vibe.templates.use(match.id);
                if (!res.ok && res.error) {
                  setItems((p) => [...p, { id: localId(), kind: "error", text: res.error! }]);
                }
              } else {
                setItems((p) => [...p, { id: localId(), kind: "error", text: `Template not found: ${arg}` }]);
              }
            });
          } else {
            window.vibe.templates.list().then((templates) => {
              setItems((p) => [
                ...p,
                { id: localId(), kind: "user", text },
                {
                  id: localId(),
                  kind: "template-picker",
                  text: "",
                  templates: templates.map((t) => ({ id: t.id, name: t.name, description: t.description, icon: t.icon })),
                },
              ]);
            });
          }
          return true;
        }
        default:
          setItems((p) => [
            ...p,
            { id: localId(), kind: "user", text },
            {
              id: localId(),
              kind: "error",
              text: `unknown command: ${cmd}`,
            },
          ]);
          return true;
      }
    },
    [config, folder],
  );

  const handleSubmit = useCallback(
    (payload: SendPayload | { slash: string }) => {
      if ("slash" in payload) {
        handleSlash(payload.slash);
        return;
      }
      const { parts, display, attachments } = payload;
      if (attachments.length > 0) {
        pendingAttachments.current = attachments.map((a) => ({
          id: a.id,
          kind: a.kind,
          name: a.name,
          path: a.path,
          dataUrl: a.dataUrl,
        }));
      }
      // Smart routing: plain single text part uses the simpler `send`
      if (parts.length === 1 && parts[0]!.type === "text") {
        window.vibe.send(parts[0]!.text).then((res) => {
          if (!res.ok && res.error) {
            setItems((p) => [
              ...p,
              { id: localId(), kind: "error", text: res.error! },
            ]);
          }
        });
        return;
      }
      window.vibe.sendParts(parts as ContentPart[], display).then((res) => {
        if (!res.ok && res.error) {
          setItems((p) => [
            ...p,
            { id: localId(), kind: "error", text: res.error! },
          ]);
        }
      });
    },
    [handleSlash],
  );

  const handleDecide = useCallback(
    (decision: "yes" | "no" | "always") => {
      if (!pending) return;
      window.vibe.decide(pending.id, decision);
      setPending(null);
    },
    [pending],
  );

  const handlePickFolder = useCallback(async () => {
    const picked = await window.vibe.pickWorkspace();
    if (picked) setFolder(picked);
  }, []);

  const handleOpenFile = useCallback((path: string) => {
    // If path is relative, resolve it against the workspace folder
    const isAbsolute = /^[A-Za-z]:[\\/]/.test(path) || path.startsWith("/");
    const resolved = isAbsolute ? path : ((folder ?? config?.cwd ?? "") + (path.includes("/") ? "/" : "\\") + path);
    setEditorPath(resolved);
    setEditorVisible(true);
    setOpenTabs((tabs) => tabs.includes(resolved) ? tabs : [...tabs, resolved]);
  }, [folder, config]);

  const handleCloseEditor = useCallback(() => {
    setEditorPath(null);
    setEditorVisible(false);
    setOpenTabs([]);
  }, []);

  const handleCloseTab = useCallback((path: string) => {
    setOpenTabs((tabs) => {
      const next = tabs.filter((t) => t !== path);
      if (editorPath === path) {
        if (next.length > 0) {
          setEditorPath(next[next.length - 1]!);
        } else {
          setEditorPath(null);
          setEditorVisible(false);
        }
      }
      return next;
    });
  }, [editorPath]);

  const handleSwitchTab = useCallback((path: string) => {
    setEditorPath(path);
  }, []);

  const handleNewChat = useCallback(async () => {
    const fresh = await window.vibe.chats.new();
    if (!fresh) return;
    setChats((p) => [fresh, ...p.filter((c) => c.id !== fresh.id)]);
    setActiveChat(fresh.id);
    setItems([]);
  }, []);

  const handlePickChat = useCallback(
    async (id: string) => {
      if (id === activeChat) return;
      const record = await window.vibe.chats.open(id);
      setActiveChat(id);
      setItems(record ? recordToItems(record) : []);
    },
    [activeChat],
  );

  const handleCloseChat = useCallback(
    async (id: string) => {
      await window.vibe.chats.delete(id);
      const list = await window.vibe.chats.list();
      if (list.length === 0) {
        const fresh = await window.vibe.chats.new();
        if (fresh) {
          setChats([fresh]);
          setActiveChat(fresh.id);
          setItems([]);
        }
        return;
      }
      setChats(list);
      if (activeChat === id) {
        const next = list[0]!;
        const record = await window.vibe.chats.open(next.id);
        setActiveChat(next.id);
        setItems(record ? recordToItems(record) : []);
      }
    },
    [activeChat],
  );

  const handleRenameChat = useCallback(
    async (id: string, title: string) => {
      await window.vibe.chats.rename(id, title);
      const list = await window.vibe.chats.list();
      setChats(list);
    },
    [],
  );

  const handlePickProject = useCallback(
    async (id: string) => {
      if (id === activeProject) return;

      // Save current project's UI state
      saveProjectState(activeProject);

      const project = await window.vibe.projects.setActive(id);
      if (!project) return;
      setActiveProject(project.id);
      setFolder(project.path);

      // Restore new project's UI state
      restoreProjectState(project.id);

      // Reset expand path
      setExpandToPath(null);

      // load that project's chats
      const list = await window.vibe.chats.list();
      if (list.length === 0) {
        const fresh = await window.vibe.chats.new();
        if (fresh) {
          setChats([fresh]);
          setActiveChat(fresh.id);
          setItems([]);
        }
        return;
      }
      setChats(list);
      const top = list[0]!;
      const record = await window.vibe.chats.open(top.id);
      setActiveChat(top.id);
      setItems(record ? recordToItems(record) : []);
    },
    [activeProject, openTabs, editorPath, editorVisible, termVisible, editorWidth, termHeight],
  );

  const handleAddProject = useCallback(async () => {
    const project = await window.vibe.projects.add();
    if (!project) return;
    const list = await window.vibe.projects.list();
    setProjects(list);
    setActiveProject(project.id);
    setFolder(project.path);

    // Reset editor state
    setEditorPath(null);
    setOpenTabs([]);
    setEditorVisible(false);
    setTermVisible(false);

    // fresh chat for new project
    const chatList = await window.vibe.chats.list();
    if (chatList.length === 0) {
      const fresh = await window.vibe.chats.new();
      if (fresh) {
        setChats([fresh]);
        setActiveChat(fresh.id);
        setItems([]);
      }
    } else {
      setChats(chatList);
      const top = chatList[0]!;
      const record = await window.vibe.chats.open(top.id);
      setActiveChat(top.id);
      setItems(record ? recordToItems(record) : []);
    }
  }, []);

  const handleCloseProject = useCallback(async () => {
    await window.vibe.projects.close();
    setActiveProject(null);
    setActiveChat(null);
    setChats([]);
    setItems([]);
    setEditorPath(null);
    setOpenTabs([]);
    setEditorVisible(false);
    setTermVisible(false);
  }, []);

  const handleRemoveProject = useCallback(
    async (id: string) => {
      const next = await window.vibe.projects.remove(id);
      const list = await window.vibe.projects.list();
      setProjects(list);
      if (next) {
        setActiveProject(next.id);
        setFolder(next.path);
        const chatList = await window.vibe.chats.list();
        setChats(chatList);
        if (chatList.length > 0) {
          const top = chatList[0]!;
          const record = await window.vibe.chats.open(top.id);
          setActiveChat(top.id);
          setItems(record ? recordToItems(record) : []);
        } else {
          setActiveChat(null);
          setItems([]);
        }
      } else {
        setActiveProject(null);
        setActiveChat(null);
        setChats([]);
        setItems([]);
        setEditorPath(null);
      }
    },
    [],
  );

  if (state.kind === "fatal") {
    return (
      <div className="app">
        <Titlebar />
        <div className="fatal">
          <div className="fatal__title">Couldn't start vibe</div>
          <div className="fatal__msg">{state.error}</div>
          <div className="fatal__hint">
            Set <code>VIBE_API_KEY</code> in a <code>.env</code> next to vibe,
            in <code>~/.vibe/config</code>, or as an environment variable.
          </div>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="app">
        <Titlebar />
        <div className="busy">
          <span className="busy__dot" />
          <span className="busy__dot" />
          <span className="busy__dot" />
          <span>starting…</span>
        </div>
      </div>
    );
  }

  if (!activeProject) {
    return (
      <div className="app">
        <Titlebar />
        <div className="app__body">
          <ChatRail
            projects={projects}
            activeId={activeProject}
            expanded={false}
            onToggleExpanded={() => {}}
            onPick={handlePickProject}
            onAdd={handleAddProject}
            onClose={handleCloseProject}
            onRemove={handleRemoveProject}
            onSettings={() => setSettingsOpen(true)}
          />
          <div className="welcome">
            <img className="welcome__icon" src="./icon.png" alt="OpenVibe" draggable={false} />
            <div className="welcome__brand">OpenVibe</div>
            <div className="welcome__hint">
              No project open. Pick a folder to start a session in it.
            </div>
            <button className="welcome__btn" onClick={handleAddProject}>
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
                <path d="M1.5 4.5h4l1.5 1.5h7.5v7a1 1 0 0 1-1 1h-12a1 1 0 0 1-1-1v-8.5z" />
              </svg>
              Open Project
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <Titlebar />
      <div className="app__body">
        <ChatRail
          projects={projects}
          activeId={activeProject}
          expanded={chatSideOpen}
          onToggleExpanded={() => setChatSideOpen((v) => !v)}
          onPick={handlePickProject}
          onAdd={handleAddProject}
          onClose={handleCloseProject}
          onRemove={handleRemoveProject}
          onSettings={() => setSettingsOpen(true)}
        />
        <ChatSidebar
          open={chatSideOpen}
          chats={chats}
          activeId={activeChat}
          workspace={folder ?? config.cwd}
          workspaceLabel={(folder ?? config.cwd).split(/[\\/]/).filter(Boolean).pop() ?? "vibe"}
          onPick={(id) => {
            handlePickChat(id);
          }}
          onNew={() => {
            handleNewChat();
          }}
          onDelete={handleCloseChat}
          onRename={handleRenameChat}
          onClose={() => setChatSideOpen(false)}
        />
        <div className="app__content">
          <div className="layout">
            <div className="layout__main">
              <div className="tabs">
                <button
                  className={"tabs__btn tabs__btn--active"}
                  title="Chat"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                </button>
                <button
                  className={"tabs__btn" + (termVisible ? " tabs__btn--active" : "")}
                  onClick={() => setTermVisible(!termVisible)}
                  title="Terminal"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="4 17 10 11 4 5"/>
                    <line x1="12" y1="19" x2="20" y2="19"/>
                  </svg>
                </button>
                <div className="tabs__spacer" />
                <button
                  className={"tabs__btn" + (editorVisible && editorPath ? " tabs__btn--active" : "")}
                  onClick={() => {
                    if (editorPath) setEditorVisible(!editorVisible);
                  }}
                  title="Editor"
                  disabled={!editorPath}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 20h9"/>
                    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                  </svg>
                </button>
                <button
                  className={"tabs__btn" + (sidebarVisible ? " tabs__btn--active" : "")}
                  onClick={() => setSidebarVisible(!sidebarVisible)}
                  title="Toggle files"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                  </svg>
                </button>
                <button
                  className={"tabs__btn"}
                  onClick={() => setMcpOpen(true)}
                  title="MCP Servers"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="2" width="20" height="8" rx="2"/>
                    <rect x="2" y="14" width="20" height="8" rx="2"/>
                    <circle cx="6" cy="6" r="1" fill="currentColor" stroke="none"/>
                    <circle cx="6" cy="18" r="1" fill="currentColor" stroke="none"/>
                  </svg>
                </button>
                <button
                  className={"tabs__btn"}
                  onClick={() => setSnapshotOpen(true)}
                  title="Project Snapshots"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                </button>
              </div>

              <div className="main__split">
                <div className="main__chat">
                  <History
                    items={items}
                    streamingId={streamingNow}
                    onShowTerminal={() => setTermVisible(true)}
                    onOpenFile={handleOpenFile}
                    workspace={folder ?? config?.cwd}
                    onPickModel={(id) => {
                      window.vibe.setModel(id);
                      if (config) setConfig({ ...config, model: id });
                      setItems((p) =>
                        p.map((it) =>
                          it.kind === "model-picker" ? { ...it, currentModel: id } : it,
                        ),
                      );
                    }}
                    onPickTemplate={(id) => {
                      window.vibe.templates.use(id).then((res) => {
                        if (!res.ok && res.error) {
                          setItems((p) => [...p, { id: localId(), kind: "error", text: res.error! }]);
                        }
                      });
                    }}
                  />
                  {busy && !pending ? (
                    <div className="loader">
                      <div className="loader__grid">
                        <span className="loader__dot" /><span className="loader__dot" /><span className="loader__dot" />
                        <span className="loader__dot" /><span className="loader__dot" /><span className="loader__dot" />
                        <span className="loader__dot" /><span className="loader__dot" /><span className="loader__dot" />
                      </div>
                      <span className="loader__text">thinking...</span>
                    </div>
                  ) : null}
                  {pending ? (
                    <Confirm payload={pending} onDecide={handleDecide} />
                  ) : (
                    <Composer
                      key={activeProject ?? "none"}
                      disabled={busy}
                      workspace={folder ?? config.cwd}
                      onSubmit={handleSubmit}
                      inject={chatInject}
                      onInjected={() => setChatInject(null)}
                    />
                  )}
                </div>

                {termVisible ? (
                  <div className="main__terminal" style={{ height: termHeight }}>
                    <div
                      className="resize-handle"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        const startY = e.clientY;
                        const startH = termHeight;
                        const onMove = (ev: MouseEvent) => {
                          const diff = startY - ev.clientY;
                          setTermHeight(Math.max(100, Math.min(500, startH + diff)));
                        };
                        const onUp = () => {
                          window.removeEventListener("mousemove", onMove);
                          window.removeEventListener("mouseup", onUp);
                        };
                        window.addEventListener("mousemove", onMove);
                        window.addEventListener("mouseup", onUp);
                      }}
                    />
                    <Terminals active={true} />
                  </div>
                ) : null}
              </div>
            </div>

            {editorVisible && editorPath ? (
              <>
                <div
                  className="layout__divider"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    const startX = e.clientX;
                    const startW = editorWidth;
                    const onMove = (ev: MouseEvent) => {
                      const diff = startX - ev.clientX;
                      setEditorWidth(Math.max(200, Math.min(900, startW + diff)));
                    };
                    const onUp = () => {
                      window.removeEventListener("mousemove", onMove);
                      window.removeEventListener("mouseup", onUp);
                    };
                    window.addEventListener("mousemove", onMove);
                    window.addEventListener("mouseup", onUp);
                  }}
                />
                <div className="layout__editor" style={{ width: editorWidth }}>
                  <Editor
                    path={editorPath}
                    cwd={folder ?? config.cwd}
                    onClose={handleCloseEditor}
                    openTabs={openTabs}
                    activeTab={editorPath}
                    onSwitchTab={handleSwitchTab}
                    onCloseTab={handleCloseTab}
                    onNavigate={(folderPath) => {
                      setSidebarVisible(true);
                      setExpandToPath(folderPath);
                    }}
                    onSendToChat={(ctx) => setChatInject(ctx)}
                  />
                </div>
              </>
            ) : null}

            <aside className={"sidebar" + (sidebarVisible ? " sidebar--open" : "")}>
              <FileTree
                cwd={folder ?? config.cwd}
                onPickFolder={handlePickFolder}
                onOpenFile={handleOpenFile}
                activeFile={editorPath}
                expandToPath={expandToPath}
                onExpandDone={() => setExpandToPath(null)}
              />
            </aside>
          </div>
        </div>
      </div>
      <Settings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onProviderChanged={(model, baseUrl) => {
          if (config) setConfig({ ...config, model, baseUrl, apiKey: "***" });
        }}
      />
      {mcpOpen ? <McpPanel onClose={() => setMcpOpen(false)} /> : null}
      {snapshotOpen ? <SnapshotPanel onClose={() => setSnapshotOpen(false)} /> : null}
    </div>
  );
}


function McpPanel({ onClose }: { onClose: () => void }): React.ReactElement {
  const [servers, setServers] = useState<Array<{ id: string; name: string; connected: boolean; toolCount: number }>>([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [envStr, setEnvStr] = useState("");

  useEffect(() => {
    window.vibe.mcp.list().then(setServers);
  }, []);

  async function handleAdd(): Promise<void> {
    if (!name.trim() || !command.trim()) return;
    const env: Record<string, string> = {};
    for (const line of envStr.split("\n")) {
      const eq = line.indexOf("=");
      if (eq > 0) {
        env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
      }
    }
    await window.vibe.mcp.add({
      name: name.trim(),
      command: command.trim(),
      args: args.trim() ? args.trim().split(" ") : [],
      env: Object.keys(env).length > 0 ? env : undefined,
    });
    setName("");
    setCommand("");
    setArgs("");
    setEnvStr("");
    setAdding(false);
    setServers(await window.vibe.mcp.list());
  }

  async function handleConnect(id: string): Promise<void> {
    await window.vibe.mcp.connect(id);
    setServers(await window.vibe.mcp.list());
  }

  async function handleDisconnect(id: string): Promise<void> {
    await window.vibe.mcp.disconnect(id);
    setServers(await window.vibe.mcp.list());
  }

  async function handleRemove(id: string): Promise<void> {
    await window.vibe.mcp.remove(id);
    setServers(await window.vibe.mcp.list());
  }

  return (
    <div className="settings__overlay" onClick={onClose}>
      <div className="settings" style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
        <div className="settings__header">
          <h2>MCP Servers</h2>
          <button className="settings__close" onClick={onClose}>×</button>
        </div>

        <div className="settings__list">
          {servers.length === 0 && !adding ? (
            <div style={{ color: "var(--fg-muted)", fontSize: 12, padding: "12px 0" }}>
              No MCP servers configured. Add one to extend the agent with external tools.
            </div>
          ) : null}

          {servers.map((s) => (
            <div key={s.id} className="settings__row">
              <div className="settings__row-info">
                <div className="settings__row-name">
                  {s.name}
                  {s.connected ? (
                    <span className="settings__connected">{s.toolCount} tools</span>
                  ) : null}
                </div>
                <div className="settings__row-desc">
                  {s.connected ? "Connected" : "Disconnected"}
                </div>
              </div>
              <div className="settings__row-actions">
                {s.connected ? (
                  <button className="settings__disconnect" onClick={() => handleDisconnect(s.id)}>
                    Disconnect
                  </button>
                ) : (
                  <button className="settings__connect" onClick={() => handleConnect(s.id)}>
                    Connect
                  </button>
                )}
                <button className="settings__disconnect" onClick={() => handleRemove(s.id)}>
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>

        {adding ? (
          <div className="settings__form" style={{ marginTop: 16 }}>
            <label className="settings__label">
              Name
              <input className="settings__input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Postgres" />
            </label>
            <label className="settings__label">
              Command
              <input className="settings__input" value={command} onChange={(e) => setCommand(e.target.value)} placeholder="e.g. npx or uvx" />
            </label>
            <label className="settings__label">
              Arguments (space-separated)
              <input className="settings__input" value={args} onChange={(e) => setArgs(e.target.value)} placeholder="e.g. -y @modelcontextprotocol/server-github" />
            </label>
            <label className="settings__label">
              Environment variables (KEY=VALUE, one per line)
              <textarea className="settings__input" value={envStr} onChange={(e) => setEnvStr(e.target.value)} placeholder="GITHUB_PERSONAL_ACCESS_TOKEN=ghp_xxx" style={{ minHeight: 50, resize: "vertical" }} />
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="settings__save" onClick={handleAdd}>Add Server</button>
              <button className="settings__connect" onClick={() => setAdding(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <div style={{ position: "absolute", bottom: 28, left: 28 }}>
            <button className="settings__save" onClick={() => setAdding(true)}>
              + Add MCP Server
            </button>
          </div>
        )}
      </div>
    </div>
  );
}


function SnapshotPanel({ onClose }: { onClose: () => void }): React.ReactElement {
  const [snapshots, setSnapshots] = useState<Array<{ name: string; path: string; size: number; date: string }>>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    window.vibe.snapshot.list().then(setSnapshots);
  }, []);

  async function handleCreate(): Promise<void> {
    setCreating(true);
    const res = await window.vibe.snapshot.create();
    setCreating(false);
    if (res.ok) {
      // Immediately refresh list
      const list = await window.vibe.snapshot.list();
      setSnapshots(list);
    }
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <div className="settings__overlay" onClick={onClose}>
      <div className="settings" style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
        <div className="settings__header">
          <h2>Project Snapshots</h2>
          <button className="settings__close" onClick={onClose}>×</button>
        </div>

        <div style={{ color: "var(--fg-muted)", fontSize: 12, marginBottom: 12 }}>
          Create a zip backup of your entire project. Download anytime.
        </div>

        <div className="settings__list" style={{ maxHeight: 320, overflowY: "auto" }}>
          {snapshots.length === 0 ? (
            <div style={{ color: "var(--fg-muted)", fontSize: 12, padding: "12px 0" }}>
              No snapshots yet.
            </div>
          ) : null}

          {snapshots.map((s) => (
            <div key={s.name} className="settings__row">
              <div className="settings__row-info">
                <div className="settings__row-name" style={{ fontSize: 12 }}>{s.name}</div>
                <div className="settings__row-desc">
                  {formatSize(s.size)} · {new Date(s.date).toLocaleString()}
                </div>
              </div>
              <button className="settings__connect" onClick={() => window.vibe.snapshot.reveal(s.path)}>
                Show
              </button>
            </div>
          ))}
        </div>

        <div style={{ position: "absolute", bottom: 28, left: 28 }}>
          <button style={{ border: "1px solid var(--line)", background: "transparent", color: "var(--fg-dim)", padding: "5px 12px", borderRadius: 4, fontSize: 12, cursor: "pointer" }} onClick={handleCreate} disabled={creating}>
            {creating ? "Creating..." : "Create Snapshot"}
          </button>
        </div>
      </div>
    </div>
  );
}
