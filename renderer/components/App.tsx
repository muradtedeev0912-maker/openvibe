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
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [chatSideOpen, setChatSideOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [termHeight, setTermHeight] = useState(220);
  const [editorWidth, setEditorWidth] = useState(420);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<string | null>(null);
  const streamingId = useRef<string | null>(null);
  const [streamingNow, setStreamingNow] = useState<string | null>(null);
  const pendingAttachments = useRef<HistoryItem["attachments"]>(undefined);

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
    const offBusy = window.vibe.onBusy(setBusy);
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
                "/clear   clear conversation history\n" +
                "/cwd     print current working directory\n" +
                "/model   show active model and endpoint\n" +
                "/exit    quit",
            },
          ]);
          return true;
        case "/clear":
        case "/reset":
          window.vibe.reset();
          setItems([
            { id: localId(), kind: "info", text: "conversation cleared" },
          ]);
          return true;
        case "/cwd":
          setItems((p) => [
            ...p,
            { id: localId(), kind: "user", text },
            { id: localId(), kind: "info", text: folder ?? config?.cwd ?? "" },
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
    setEditorPath(path);
    setEditorVisible(true);
  }, []);

  const handleCloseEditor = useCallback(() => {
    setEditorPath(null);
    setEditorVisible(false);
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
      const project = await window.vibe.projects.setActive(id);
      if (!project) return;
      setActiveProject(project.id);
      setFolder(project.path);
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
    [activeProject],
  );

  const handleAddProject = useCallback(async () => {
    const project = await window.vibe.projects.add();
    if (!project) return;
    const list = await window.vibe.projects.list();
    setProjects(list);
    setActiveProject(project.id);
    setFolder(project.path);
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
            <div className="welcome__brand">vibe</div>
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
              </div>

              <div className="main__split">
                <div className="main__chat">
                  <History
                    items={items}
                    streamingId={streamingNow}
                    onPickModel={(id) => {
                      window.vibe.setModel(id);
                      if (config) setConfig({ ...config, model: id });
                      setItems((p) =>
                        p.map((it) =>
                          it.kind === "model-picker" ? { ...it, currentModel: id } : it,
                        ),
                      );
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
                      disabled={busy}
                      workspace={folder ?? config.cwd}
                      onSubmit={handleSubmit}
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
                  <Editor path={editorPath} onClose={handleCloseEditor} />
                </div>
              </>
            ) : null}

            <aside className={"sidebar" + (sidebarVisible ? " sidebar--open" : "")}>
              <FileTree
                cwd={folder ?? config.cwd}
                onPickFolder={handlePickFolder}
                onOpenFile={handleOpenFile}
                activeFile={editorPath}
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
    </div>
  );
}
