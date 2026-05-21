// Mirror of preload's API shape, exposed on `window.vibe`.
// Keep in sync with electron/preload.ts.

export interface VibeConfig {
  model: string;
  baseUrl: string;
  cwd: string;
  autoApprove: boolean;
  apiKey: string;
}

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type VibeEvent =
  | { kind: "user"; text: string }
  | { kind: "assistant-start" }
  | { kind: "assistant-chunk"; text: string }
  | { kind: "assistant-end" }
  | { kind: "tool-call"; id: string; name: string; args: unknown }
  | { kind: "tool-result"; id: string; ok: boolean; text: string }
  | { kind: "tool-denied"; id: string; name: string }
  | { kind: "info"; text: string }
  | { kind: "error"; text: string };

export interface ConfirmPayload {
  id: string;
  toolName: string;
  args: unknown;
}

export interface FsEntry {
  name: string;
  path: string;
  isDir: boolean;
  size?: number;
}

export interface ChatSummary {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export interface ChatRecord {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  // server-side ChatMessage shape
  messages: Array<{
    role: "system" | "user" | "assistant" | "tool";
    content: string | ContentPart[] | null;
    name?: string;
    tool_call_id?: string;
    tool_calls?: Array<{
      id: string;
      type: "function";
      function: { name: string; arguments: string };
    }>;
  }>;
}

export interface FileMatch {
  path: string;
  rel: string;
  name: string;
}

export interface Project {
  id: string;
  path: string;
  name: string;
  color: string;
  addedAt: number;
}

export interface VibeApi {
  init: () => Promise<
    { ok: true; config: VibeConfig } | { ok: false; error: string }
  >;
  send: (text: string) => Promise<{ ok: boolean; error?: string }>;
  sendParts: (
    parts: ContentPart[],
    display?: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  reset: () => Promise<void>;
  abort: () => Promise<void>;
  decide: (id: string, decision: "yes" | "no" | "always") => Promise<void>;
  pickWorkspace: () => Promise<string | null>;
  window: {
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    close: () => Promise<void>;
  };
  setModel: (model: string) => Promise<void>;
  setProvider: (apiKey: string, baseUrl: string, model: string) => Promise<void>;
  chats: {
    list: () => Promise<ChatSummary[]>;
    new: () => Promise<ChatSummary | null>;
    open: (id: string) => Promise<ChatRecord | null>;
    delete: (id: string) => Promise<void>;
    rename: (id: string, title: string) => Promise<void>;
  };
  projects: {
    list: () => Promise<Project[]>;
    active: () => Promise<Project | null>;
    add: () => Promise<Project | null>;
    setActive: (id: string) => Promise<Project | null>;
    remove: (id: string) => Promise<Project | null>;
    rename: (id: string, name: string) => Promise<void>;
    close: () => Promise<void>;
  };
  mcp: {
    list: () => Promise<Array<{ id: string; name: string; connected: boolean; toolCount: number }>>;
    configs: () => Promise<Array<{ id: string; name: string; command: string; args: string[]; env?: Record<string, string>; enabled: boolean }>>;
    add: (server: { name: string; command: string; args: string[]; env?: Record<string, string> }) => Promise<{ ok: boolean; server?: unknown; error?: string }>;
    remove: (id: string) => Promise<{ ok: boolean }>;
    connect: (id: string) => Promise<{ ok: boolean; error?: string; toolCount?: number }>;
    disconnect: (id: string) => Promise<{ ok: boolean }>;
  };
  snapshot: {
    create: () => Promise<{ ok: boolean; name?: string; path?: string; date?: string; error?: string }>;
    list: () => Promise<Array<{ name: string; path: string; size: number; date: string }>>;
    reveal: (path: string) => Promise<void>;
  };
  templates: {
    list: () => Promise<Array<{ id: string; name: string; description: string; icon: string }>>;
    use: (id: string) => Promise<{ ok: boolean; error?: string }>;
  };
  fs: {
    list: (dir: string) => Promise<
      | { ok: true; entries: FsEntry[] }
      | { ok: false; error: string }
    >;
    reveal: (path: string) => Promise<void>;
    read: (path: string) => Promise<
      { ok: true; content: string } | { ok: false; error: string }
    >;
    write: (path: string, content: string) => Promise<
      { ok: true } | { ok: false; error: string }
    >;
    rename: (from: string, to: string) => Promise<
      { ok: true } | { ok: false; error: string }
    >;
    copy: (from: string, to: string) => Promise<
      { ok: true } | { ok: false; error: string }
    >;
    delete: (path: string) => Promise<
      { ok: true } | { ok: false; error: string }
    >;
    createFile: (
      dir: string,
      name: string,
    ) => Promise<
      { ok: true; path: string } | { ok: false; error: string }
    >;
    createDir: (
      dir: string,
      name: string,
    ) => Promise<
      { ok: true; path: string } | { ok: false; error: string }
    >;
    find: (
      root: string,
      query: string,
      limit?: number,
    ) => Promise<
      { ok: true; matches: FileMatch[] } | { ok: false; error: string }
    >;
    projectInfo: (dir: string) => Promise<
      | { ok: true; name: string | null; version: string | null }
      | { ok: false }
    >;
  };
  clipboard: {
    writeText: (text: string) => void;
  };
  whisper: {
    transcribe: (
      audioBase64: string,
      mimeType: string,
    ) => Promise<{ ok: true; text: string } | { ok: false; error: string }>;
  };
  onEvent: (cb: (e: VibeEvent) => void) => () => void;
  onBusy: (cb: (busy: boolean) => void) => () => void;
  onConfirm: (cb: (p: ConfirmPayload) => void) => () => void;
  onFsChanged: (cb: () => void) => () => void;
  term: {
    start: (id: string, cols: number, rows: number) => Promise<boolean>;
    write: (id: string, data: string) => Promise<void>;
    resize: (id: string, cols: number, rows: number) => Promise<void>;
    kill: (id: string) => Promise<void>;
    onData: (cb: (p: { id: string; chunk: string }) => void) => () => void;
    onExit: (cb: (p: { id: string; code: number }) => void) => () => void;
  };
}

declare global {
  interface Window {
    vibe: VibeApi;
  }
}
