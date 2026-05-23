import { BrowserWindow, app, ipcMain, dialog, shell } from "electron";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readdir, stat, readFile, writeFile, rename, rm, mkdir, cp, copyFile } from "node:fs/promises";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { Agent } from "../src/agent.js";
import { McpManager } from "../src/mcp-manager.js";
import { TEMPLATES } from "../src/templates.js";
import { loadConfig } from "../src/config.js";
import { SessionBus, type ConfirmRequest } from "../src/events.js";
import { buildTools } from "../src/tools.js";
import type { ChatMessage, ContentPart, Config } from "../src/types.js";
import { ChatStore, deriveTitle, type ChatSummary } from "./chats.js";
import { ProjectStore, projectBasename } from "./projects.js";
import { TerminalManager, type ShellKind } from "./terminal.js";
import { findFiles } from "./walker.js";

// ===== Shell preference (persisted in userData/settings.json) =====
function settingsPath(): string {
  return join(app.getPath("userData"), "settings.json");
}

function readShellPref(): ShellKind {
  try {
    const raw = readFileSync(settingsPath(), "utf8");
    const parsed = JSON.parse(raw) as { shell?: string };
    if (parsed.shell === "cmd" || parsed.shell === "bash" || parsed.shell === "powershell") {
      return parsed.shell;
    }
  } catch {
    // missing/invalid — fall through to default
  }
  return "powershell";
}

function writeShellPref(shell: ShellKind): void {
  let current: Record<string, unknown> = {};
  try {
    const raw = readFileSync(settingsPath(), "utf8");
    current = JSON.parse(raw);
  } catch {
    // ignore
  }
  current.shell = shell;
  writeFileSync(settingsPath(), JSON.stringify(current, null, 2));
}

const __dirname = dirname(fileURLToPath(import.meta.url));

// Fix GPU cache errors on Windows when multiple instances or permission issues
app.commandLine.appendSwitch("disk-cache-dir", join(app.getPath("userData"), "gpu-cache"));
app.commandLine.appendSwitch("disable-gpu-shader-disk-cache");

let mainWindow: BrowserWindow | null = null;
let bus: SessionBus | null = null;
let agent: Agent | null = null;
let mcpManager: McpManager | null = null;
let config: Config | null = null;
const pendingConfirms = new Map<string, ConfirmRequest>();
let terminals: TerminalManager | null = null;
let projects: ProjectStore | null = null;
let chatStore: ChatStore | null = null;
let activeChatId: string | null = null;

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    resizable: true,
    backgroundColor: "#161616",
    title: "vibe",
    icon: join(__dirname, "../../assets/icon.png"),
    autoHideMenuBar: true,
    maximizable: true,
    fullscreenable: true,
    frame: false,
    titleBarStyle: "hidden",
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.maximize();

  const devUrl = process.env.VIBE_DEV_URL;
  if (devUrl) {
    await mainWindow.loadURL(devUrl);
    if (process.env.VIBE_DEVTOOLS) {
      mainWindow.webContents.openDevTools({ mode: "detach" });
    }
  } else {
    await mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

function persistActiveChat(): void {
  if (!chatStore || !activeChatId || !agent) return;
  const messages = agent.getMessages();
  const existing = chatStore.get(activeChatId);
  const now = Date.now();
  const record = {
    id: activeChatId,
    title: existing?.title ?? deriveTitle(messages),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    messages,
  };
  // Refresh title once we have a real first user message
  if (record.title === "New chat" || existing?.title === "New chat") {
    record.title = deriveTitle(messages);
  }
  chatStore.save(record);
}

function tryInitAgent(): { ok: true } | { ok: false; error: string } {
  try {
    config = loadConfig({ autoApprove: true });
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  bus = new SessionBus();
  projects = new ProjectStore(app.getPath("userData"));

  // Pick which directory to start in:
  //  - the previously-active project if its folder still exists
  //  - otherwise no project: app shows the Open Project welcome screen
  const stored = projects.getActive();
  let initialCwd = config.cwd;
  let initialProjectId: string | null = null;
  if (stored && existsSync(stored.path)) {
    initialCwd = stored.path;
    initialProjectId = stored.id;
  }
  config = { ...config, cwd: initialCwd };

  const tools = buildTools(config);
  agent = new Agent(config, tools, bus);
  mcpManager = new McpManager(app.getPath("userData"));
  // Auto-connect enabled MCP servers and add their tools
  mcpManager.autoConnect().then(() => {
    if (agent && mcpManager) {
      const mcpTools = mcpManager.getAllTools();
      if (mcpTools.length > 0) {
        agent.setCwd(config!.cwd, [...buildTools(config!), ...mcpTools]);
      }
    }
  });
  terminals = new TerminalManager(initialCwd, readShellPref());
  chatStore = initialProjectId
    ? new ChatStore(projects.chatsDir(initialProjectId))
    : null;

  bus.onEvent((e) => {
    mainWindow?.webContents.send("vibe:event", e);
    // Persist after structurally interesting events
    if (
      e.kind === "user" ||
      e.kind === "assistant-end" ||
      e.kind === "tool-result" ||
      e.kind === "tool-denied"
    ) {
      persistActiveChat();
    }
    // Notify renderer to refresh file tree after file-changing tools
    if (e.kind === "tool-result" && e.ok) {
      mainWindow?.webContents.send("vibe:fs:changed");
    }
  });
  bus.onBusy((b) => mainWindow?.webContents.send("vibe:busy", b));
  bus.onConfirm((req) => {
    pendingConfirms.set(req.id, req);
    mainWindow?.webContents.send("vibe:confirm", {
      id: req.id,
      toolName: req.toolName,
      args: req.args,
    });
  });

  return { ok: true };
}

ipcMain.handle("vibe:init", () => {
  const init = tryInitAgent();
  if (!init.ok) return { ok: false, error: init.error };
  return {
    ok: true,
    config: {
      model: config!.model,
      baseUrl: config!.baseUrl,
      cwd: config!.cwd,
      autoApprove: config!.autoApprove,
      apiKey: config!.apiKey ? "***" : "",
    },
  };
});

ipcMain.handle("vibe:templates", () => {
  return TEMPLATES.map((t) => ({ id: t.id, name: t.name, description: t.description, icon: t.icon }));
});

ipcMain.handle("vibe:template:use", async (_e, templateId: string) => {
  if (!agent) return { ok: false, error: "Agent not initialised" };
  const template = TEMPLATES.find((t) => t.id === templateId);
  if (!template) return { ok: false, error: "Template not found" };
  try {
    await agent.send(template.prompt);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
});

ipcMain.handle("vibe:sendParts", async (_e, parts: ContentPart[], display?: string) => {
  if (!agent) return { ok: false, error: "Agent not initialised" };
  try {
    await agent.sendParts(parts, display);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
});

ipcMain.handle("vibe:send", async (_e, text: string) => {
  if (!agent) return { ok: false, error: "Agent not initialised" };
  try {
    await agent.send(text);
    return { ok: true };
  } catch (err) {
    if ((err as Error).name === "AbortError") return { ok: true };
    return { ok: false, error: (err as Error).message };
  }
});

ipcMain.handle("vibe:abort", () => {
  agent?.abort();
});

ipcMain.handle("vibe:reset", () => {
  agent?.reset();
});

ipcMain.handle("vibe:chats:list", () => chatStore?.list() ?? []);

ipcMain.handle("vibe:chats:new", () => {
  if (!chatStore || !agent) return null;
  if (activeChatId) persistActiveChat();
  const id = `c${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const now = Date.now();
  const record = {
    id,
    title: "New chat",
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
  chatStore.save(record);
  agent.reset();
  activeChatId = id;
  return { id, title: record.title, createdAt: now, updatedAt: now } as ChatSummary;
});

ipcMain.handle("vibe:chats:open", (_e, id: string) => {
  if (!chatStore || !agent) return null;
  if (activeChatId && activeChatId !== id) persistActiveChat();
  const record = chatStore.get(id);
  if (!record) return null;
  agent.setMessages(record.messages);
  activeChatId = id;
  return record;
});

ipcMain.handle("vibe:chats:delete", (_e, id: string) => {
  if (!chatStore) return;
  chatStore.delete(id);
  if (activeChatId === id) {
    activeChatId = null;
    agent?.reset();
  }
});

ipcMain.handle("vibe:chats:rename", (_e, id: string, title: string) => {
  if (!chatStore) return;
  const r = chatStore.get(id);
  if (!r) return;
  r.title = title;
  r.updatedAt = Date.now();
  chatStore.save(r);
});

ipcMain.handle("vibe:projects:list", () => projects?.list() ?? []);

ipcMain.handle("vibe:projects:active", () => projects?.getActive() ?? null);

ipcMain.handle("vibe:projects:add", async () => {
  if (!projects || !mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const path = result.filePaths[0]!;
  const project = projects.add(path);
  switchToProject(project.path, project.id);
  return project;
});

ipcMain.handle("vibe:projects:setActive", (_e, id: string) => {
  if (!projects) return null;
  const p = projects.setActive(id);
  if (!p) return null;
  switchToProject(p.path, p.id);
  return p;
});

ipcMain.handle("vibe:projects:remove", (_e, id: string) => {
  if (!projects) return null;
  const next = projects.remove(id);
  if (next) {
    switchToProject(next.path, next.id);
  } else {
    // No more projects — close the active session
    if (activeChatId) persistActiveChat();
    chatStore = null;
    activeChatId = null;
    agent?.reset();
  }
  return next;
});

ipcMain.handle("vibe:projects:close", () => {
  if (!projects) return;
  if (activeChatId) persistActiveChat();
  projects.clearActive();
  chatStore = null;
  activeChatId = null;
  agent?.reset();
});

ipcMain.handle("vibe:projects:rename", (_e, id: string, name: string) => {
  projects?.rename(id, name);
});

// ===== MCP Handlers =====
ipcMain.handle("vibe:mcp:list", () => {
  return mcpManager?.getStatus() ?? [];
});

ipcMain.handle("vibe:mcp:configs", () => {
  return mcpManager?.getConfigs() ?? [];
});

ipcMain.handle("vibe:mcp:add", async (_e, server: { name: string; command: string; args: string[]; env?: Record<string, string> }) => {
  if (!mcpManager) return { ok: false, error: "MCP not initialized" };
  const config = mcpManager.addServer({ ...server, enabled: true });
  return { ok: true, server: config };
});

ipcMain.handle("vibe:mcp:remove", (_e, id: string) => {
  mcpManager?.removeServer(id);
  // Rebuild agent tools without this server
  if (agent && config && mcpManager) {
    agent.setCwd(config.cwd, [...buildTools(config), ...mcpManager.getAllTools()]);
  }
  return { ok: true };
});

ipcMain.handle("vibe:mcp:connect", async (_e, id: string) => {
  if (!mcpManager) return { ok: false, error: "MCP not initialized" };
  const result = await mcpManager.connectServer(id);
  // Rebuild agent tools with new MCP tools
  if (result.ok && agent && config) {
    agent.setCwd(config.cwd, [...buildTools(config), ...mcpManager.getAllTools()]);
  }
  return result;
});

ipcMain.handle("vibe:mcp:disconnect", (_e, id: string) => {
  mcpManager?.disconnectServer(id);
  if (agent && config && mcpManager) {
    agent.setCwd(config.cwd, [...buildTools(config), ...mcpManager.getAllTools()]);
  }
  return { ok: true };
});

// ===== Snapshot Handlers =====
ipcMain.handle("vibe:snapshot:create", async () => {
  if (!config) return { ok: false, error: "No project open" };
  const { spawn: spawnChild } = await import("node:child_process");
  const snapshotsDir = join(app.getPath("userData"), "snapshots");
  if (!existsSync(snapshotsDir)) mkdirSync(snapshotsDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const projectName = config.cwd.split(/[\\/]/).pop() ?? "project";
  const zipName = `${projectName}_${timestamp}.zip`;
  const zipPath = join(snapshotsDir, zipName);

  try {
    // Use PowerShell with exclusions - get items first, then compress
    const ps = `
      $src = '${config.cwd.replace(/'/g, "''")}'
      $dst = '${zipPath.replace(/'/g, "''")}'
      $exclude = @('node_modules', '.git', 'dist', '.next', 'out', '.cache')
      $items = Get-ChildItem -Path $src | Where-Object { $exclude -notcontains $_.Name }
      if ($items.Count -gt 0) {
        $items | Compress-Archive -DestinationPath $dst -Force
      }
    `.trim();

    await new Promise<void>((resolve, reject) => {
      const child = spawnChild("powershell", ["-NoProfile", "-Command", ps], { stdio: "pipe" });
      child.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`PowerShell exited with code ${code}`));
      });
      child.on("error", reject);
      setTimeout(() => { child.kill(); reject(new Error("Timeout")); }, 120000);
    });

    return { ok: true, name: zipName, path: zipPath, date: new Date().toISOString() };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
});

ipcMain.handle("vibe:snapshot:list", async () => {
  const snapshotsDir = join(app.getPath("userData"), "snapshots");
  if (!existsSync(snapshotsDir)) return [];
  const files = await readdir(snapshotsDir);
  const zips = files.filter((f) => f.endsWith(".zip")).sort().reverse();
  const results = [];
  for (const name of zips) {
    const full = join(snapshotsDir, name);
    const s = await stat(full);
    results.push({ name, path: full, size: s.size, date: s.mtime.toISOString() });
  }
  return results;
});

ipcMain.handle("vibe:snapshot:reveal", (_e, path: string) => {
  shell.showItemInFolder(path);
});

function switchToProject(path: string, projectId: string): void {
  if (!projects || !agent || !config) return;
  if (activeChatId) persistActiveChat();
  // Update config + rebuild tools so file/shell tools target the new path
  config = { ...config, cwd: path };
  const newTools = buildTools(config);
  agent.setCwd(path, newTools);
  // Fresh terminal sessions for the new project
  terminals?.killAll();
  terminals = new TerminalManager(path, readShellPref());
  // Per-project chat store
  chatStore = new ChatStore(projects.chatsDir(projectId));
  activeChatId = null;
}

ipcMain.handle(
  "vibe:decide",
  (_e, id: string, decision: "yes" | "no" | "always") => {
    const req = pendingConfirms.get(id);
    if (!req) return;
    pendingConfirms.delete(id);
    req.resolve(decision);
  },
);

ipcMain.handle("vibe:pickWorkspace", async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle("vibe:window:minimize", () => mainWindow?.minimize());
ipcMain.handle("vibe:window:maximize", () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.handle("vibe:window:close", () => mainWindow?.close());

ipcMain.handle("vibe:setModel", (_e, model: string) => {
  if (!config) return;
  config = { ...config, model };
});

ipcMain.handle(
  "vibe:setProvider",
  (_e, apiKey: string, baseUrl: string, model: string) => {
    if (!config || !agent) return;
    config = { ...config, apiKey, baseUrl, model };
    agent.setProvider(apiKey, baseUrl, model);
  },
);

ipcMain.handle(
  "vibe:term:start",
  (_e, id: string, cols: number, rows: number) => {
    if (!terminals) return false;
    terminals.start(
      id,
      cols,
      rows,
      (chunk) =>
        mainWindow?.webContents.send("vibe:term:data", { id, chunk }),
      (code) => mainWindow?.webContents.send("vibe:term:exit", { id, code }),
    );
    return true;
  },
);

ipcMain.handle("vibe:term:write", (_e, id: string, data: string) => {
  terminals?.write(id, data);
});

ipcMain.handle(
  "vibe:term:resize",
  (_e, id: string, cols: number, rows: number) => {
    terminals?.resize(id, cols, rows);
  },
);

ipcMain.handle("vibe:term:kill", (_e, id: string) => {
  terminals?.kill(id);
});

ipcMain.handle("vibe:terminal:getShell", () => {
  return terminals?.getShell() ?? readShellPref();
});

ipcMain.handle("vibe:terminal:setShell", (_e, shell: string) => {
  if (shell !== "powershell" && shell !== "cmd" && shell !== "bash") return false;
  writeShellPref(shell);
  // New terminals will use the new shell; existing PTYs are unaffected.
  terminals?.setShell(shell);
  return true;
});

app.on("before-quit", () => {
  terminals?.killAll();
});

ipcMain.handle("vibe:fs:list", async (_e, dir: string) => {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    const result = await Promise.all(
      entries
        .filter((e) => !e.name.startsWith(".") || e.name === ".env" || e.name === ".gitignore" || e.name === ".openvibe")
        .map(async (e) => {
          const full = join(dir, e.name);
          let size: number | undefined;
          if (e.isFile()) {
            try {
              const s = await stat(full);
              size = s.size;
            } catch {
              // ignore
            }
          }
          return {
            name: e.name,
            path: full,
            isDir: e.isDirectory(),
            size,
          };
        }),
    );
    result.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return { ok: true, entries: result };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
});

ipcMain.handle("vibe:fs:reveal", (_e, path: string) => {
  shell.showItemInFolder(path);
});

const TEXT_FILE_LIMIT = 2 * 1024 * 1024; // 2 MB

ipcMain.handle("vibe:fs:read", async (_e, path: string) => {
  try {
    const s = await stat(path);
    if (s.size > TEXT_FILE_LIMIT) {
      return { ok: false, error: `File too large (${s.size} bytes)` };
    }
    const content = await readFile(path, "utf8");
    return { ok: true, content };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
});

ipcMain.handle("vibe:fs:readBinary", async (_e, path: string) => {
  try {
    const s = await stat(path);
    if (s.size > 50 * 1024 * 1024) {
      return { ok: false, error: `File too large (${s.size} bytes)` };
    }
    const buf = await readFile(path);
    return { ok: true, base64: buf.toString("base64") };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
});

ipcMain.handle(
  "vibe:fs:write",
  async (_e, path: string, content: string) => {
    try {
      await writeFile(path, content, "utf8");
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  },
);

ipcMain.handle("vibe:fs:rename", async (_e, from: string, to: string) => {
  try {
    await rename(from, to);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
});

ipcMain.handle("vibe:fs:copy", async (_e, from: string, to: string) => {
  try {
    const s = await stat(from);
    if (s.isDirectory()) {
      await cp(from, to, { recursive: true });
    } else {
      await copyFile(from, to);
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
});

ipcMain.handle("vibe:fs:delete", async (_e, path: string) => {
  try {
    await rm(path, { recursive: true, force: true });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
});

ipcMain.handle(
  "vibe:fs:createFile",
  async (_e, dir: string, name: string) => {
    try {
      const p = join(dir, name);
      // refuse to overwrite
      try {
        await stat(p);
        return { ok: false, error: "File already exists" };
      } catch {
        // not exists, good
      }
      await writeFile(p, "", "utf8");
      return { ok: true, path: p };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  },
);

ipcMain.handle(
  "vibe:fs:createDir",
  async (_e, dir: string, name: string) => {
    try {
      const p = join(dir, name);
      await mkdir(p, { recursive: false });
      return { ok: true, path: p };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  },
);

ipcMain.handle(
  "vibe:fs:find",
  async (_e, root: string, query: string, limit?: number) => {
    try {
      return { ok: true, matches: await findFiles(root, query, limit ?? 30) };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  },
);

ipcMain.handle("vibe:fs:projectInfo", async (_e, dir: string) => {
  try {
    const pkgPath = join(dir, "package.json");
    const raw = await readFile(pkgPath, "utf8");
    const data = JSON.parse(raw) as { name?: string; version?: string };
    return {
      ok: true,
      name: typeof data.name === "string" ? data.name : null,
      version: typeof data.version === "string" ? data.version : null,
    };
  } catch {
    return { ok: false };
  }
});

ipcMain.handle(
  "vibe:whisper:transcribe",
  async (_e, audioBase64: string, mimeType: string) => {
    // Use Groq's whisper endpoint (OpenAI-compatible)
    const apiKey =
      process.env.GROQ_API_KEY ??
      process.env.VIBE_API_KEY ??
      process.env.OPENAI_API_KEY ??
      "";
    const baseUrl = process.env.GROQ_API_KEY
      ? "https://api.groq.com/openai/v1"
      : config?.baseUrl ?? "https://api.openai.com/v1";

    if (!apiKey) return { ok: false, error: "No API key for whisper" };

    try {
      const buffer = Buffer.from(audioBase64, "base64");
      const ext = mimeType.includes("webm")
        ? "webm"
        : mimeType.includes("ogg")
          ? "ogg"
          : mimeType.includes("mp4")
            ? "mp4"
            : "wav";

      // Build multipart form data manually
      const boundary = `----vibewhisper${Date.now()}`;
      const parts: Buffer[] = [];

      // file field
      parts.push(
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.${ext}"\r\nContent-Type: ${mimeType}\r\n\r\n`,
        ),
      );
      parts.push(buffer);
      parts.push(Buffer.from("\r\n"));

      // model field
      parts.push(
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-large-v3\r\n`,
        ),
      );

      // language field (optional, helps accuracy)
      parts.push(
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\nru\r\n`,
        ),
      );

      parts.push(Buffer.from(`--${boundary}--\r\n`));

      const body = Buffer.concat(parts);

      const res = await fetch(`${baseUrl}/audio/transcriptions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
        },
        body,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return { ok: false, error: `${res.status}: ${text}` };
      }

      const data = (await res.json()) as { text?: string };
      return { ok: true, text: data.text ?? "" };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  },
);

// ===== Update checker =====
ipcMain.handle("vibe:checkUpdate", async () => {
  try {
    const res = await fetch("https://api.github.com/repos/muradtedeev0912-maker/openvibe/releases/latest", {
      headers: { "Accept": "application/vnd.github+json", "User-Agent": "openvibe" },
    });
    if (!res.ok) return { ok: false };
    const data = (await res.json()) as { tag_name?: string; html_url?: string; name?: string; body?: string };
    const tag = data.tag_name ?? "";
    return {
      ok: true,
      latestVersion: tag.replace(/^v/, ""),
      url: data.html_url ?? "",
      name: data.name ?? tag,
      body: data.body ?? "",
      currentVersion: app.getVersion(),
    };
  } catch {
    return { ok: false };
  }
});

ipcMain.handle("vibe:openExternal", (_e, url: string) => {
  shell.openExternal(url);
});

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

