import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { streamChat } from "./llm.js";
import type { SessionBus } from "./events.js";
import type { ChatMessage, ContentPart, Config, Tool } from "./types.js";

const MAX_TURNS = 25;

function systemPrompt(cwd: string): string {
  return [
    "You are openvibe, a coding assistant with direct access to the file system.",
    `CURRENT WORKING DIRECTORY: ${cwd}`,
    "",
    "CRITICAL RULES:",
    "1. DISTINGUISH between coding tasks and conversational questions:",
    "   - If the user asks to CREATE, WRITE, BUILD, or FIX code/files → use tools (write_file, edit_file).",
    "   - If the user asks a QUESTION, asks to EXPLAIN, SOLVE a math problem, or just CHATS → respond with text in chat. Do NOT create files.",
    "   - Examples of chat-only: 'solve this equation', 'explain how X works', 'what is Y', 'help me understand Z'.",
    "   - Examples of file tasks: 'create a bot', 'write a script', 'fix the bug in X', 'add feature Y'.",
    "2. When responding with explanations or solutions (math, logic, etc.):",
    "   - Write detailed step-by-step solutions directly in chat.",
    "   - Use clear formatting with numbered steps.",
    "   - Show your work and reasoning.",
    "3. For coding tasks: use tools to create/edit files. NEVER paste full source code in chat.",
    "4. To create a new file: use write_file tool with the full content.",
    "5. To fix/modify an existing file: use edit_file tool (old_str → new_str). Do NOT use write_file for files that already exist.",
    "6. After creating or editing a file, respond ONLY with a short summary and the run command if applicable.",
    "7. NEVER dump the full source code in your text response. The user can see the file in the editor.",
    "8. If unsure whether a file exists, use read_file or list_dir first.",
    "",
    "Tool use:",
    "- read_file, list_dir, grep — use freely to investigate.",
    "- write_file — ONLY for new files that don't exist yet.",
    "- edit_file — for modifying existing files. Always use this instead of write_file when the file exists.",
    "- create_dir — for creating new directories/folders.",
    "- bash — for running commands.",
    "- web_search — search the internet for current information, docs, solutions. Use when you don't know something or need up-to-date info.",
    "",
    "Behavior:",
    "- If the user asks where they are — answer from context, no tool needed.",
    "- If the user asks to look at the project — read files yourself.",
    "- For conversational questions, math, explanations — respond in chat with detailed text. NO file creation.",
    "- After file changes, give a one-line summary + run command.",
    "- Respond in the same language the user writes in.",
    "- You may have access to MCP (Model Context Protocol) tools prefixed with 'mcp_'. These are external tools connected by the user (e.g. GitHub, databases, browsers). Use them when the user asks to interact with external services.",
    "",
    "Style learning:",
    "- There may be a file .openvibe/style.md in the project with the user's coding preferences.",
    "- If it exists, follow those conventions (naming, formatting, architecture patterns).",
    "- After completing a task, if you notice consistent patterns in the user's code (naming style, preferred libraries, architecture), append a brief note to .openvibe/style.md using edit_file or write_file. Keep it concise — one line per pattern.",
  ].join("\n");
}

export class Agent {
  private messages: ChatMessage[];
  private toolMap: Map<string, Tool>;
  private alwaysAllow = new Set<string>();
  private config: Config;
  private tools: Tool[];
  private bus: SessionBus;
  private abortController: AbortController | null = null;
  private _totalTokens = 0;

  get totalTokens(): number { return this._totalTokens; }

  constructor(config: Config, tools: Tool[], bus: SessionBus) {
    this.config = config;
    this.tools = tools;
    this.bus = bus;
    this.messages = [{ role: "system", content: systemPrompt(config.cwd) }];
    this.toolMap = new Map(tools.map((t) => [t.definition.function.name, t]));
    this.loadProjectContext();
  }

  /** Load package.json and README to give the agent project context. */
  private async loadProjectContext(): Promise<void> {
    const parts: string[] = [];

    // Try package.json
    try {
      const pkg = await readFile(join(this.config.cwd, "package.json"), "utf8");
      const data = JSON.parse(pkg) as Record<string, unknown>;
      const info: string[] = [];
      if (data.name) info.push(`Name: ${data.name}`);
      if (data.version) info.push(`Version: ${data.version}`);
      if (data.description) info.push(`Description: ${data.description}`);
      if (data.scripts && typeof data.scripts === "object") {
        const scripts = Object.keys(data.scripts as object).slice(0, 10);
        info.push(`Scripts: ${scripts.join(", ")}`);
      }
      if (data.dependencies && typeof data.dependencies === "object") {
        const deps = Object.keys(data.dependencies as object).slice(0, 15);
        info.push(`Dependencies: ${deps.join(", ")}`);
      }
      if (info.length > 0) parts.push("PROJECT (package.json):\n" + info.join("\n"));
    } catch { /* no package.json */ }

    // Try README
    try {
      const readme = await readFile(join(this.config.cwd, "README.md"), "utf8");
      const trimmed = readme.slice(0, 1500); // first 1500 chars
      parts.push("README.md (first 1500 chars):\n" + trimmed);
    } catch {
      try {
        const readme = await readFile(join(this.config.cwd, "readme.md"), "utf8");
        parts.push("README.md (first 1500 chars):\n" + readme.slice(0, 1500));
      } catch { /* no readme */ }
    }

    // Try .openvibe/style.md
    try {
      const style = await readFile(join(this.config.cwd, ".openvibe", "style.md"), "utf8");
      if (style.trim()) parts.push("USER STYLE PREFERENCES (.openvibe/style.md):\n" + style.slice(0, 2000));
    } catch { /* no style file */ }

    if (parts.length > 0) {
      const contextMsg: ChatMessage = {
        role: "system",
        content: "Project context (auto-loaded):\n\n" + parts.join("\n\n"),
      };
      // Insert after the first system message
      this.messages.splice(1, 0, contextMsg);
    }
  }

  reset(): void {
    this.messages = [
      { role: "system", content: systemPrompt(this.config.cwd) },
    ];
    this.alwaysAllow.clear();
  }

  /** Switch the working directory and rebuild tools so they target the new cwd. */
  setCwd(cwd: string, tools: Tool[]): void {
    this.config = { ...this.config, cwd };
    this.tools = tools;
    this.toolMap = new Map(tools.map((t) => [t.definition.function.name, t]));
    this.messages = [{ role: "system", content: systemPrompt(cwd) }];
    this.alwaysAllow.clear();
    this.loadProjectContext();
  }

  /** Update provider credentials without resetting conversation. */
  setProvider(apiKey: string, baseUrl: string, model: string): void {
    this.config = { ...this.config, apiKey, baseUrl, model };
  }

  /** Replace conversation history (used when switching chat sessions). */
  setMessages(msgs: ChatMessage[]): void {
    if (msgs.length === 0) {
      this.messages = [{ role: "system", content: systemPrompt(this.config.cwd) }];
      return;
    }
    // Force a fresh system prompt with the CURRENT cwd, regardless of what
    // was stored. Otherwise restoring an old chat brings back stale paths.
    const rest = msgs[0]?.role === "system" ? msgs.slice(1) : msgs;
    this.messages = [
      { role: "system", content: systemPrompt(this.config.cwd) },
      ...rest,
    ];
  }

  getMessages(): ChatMessage[] {
    return this.messages;
  }

  /** Abort the current request. */
  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  private askConfirm(toolName: string, args: unknown): Promise<"yes" | "no" | "always"> {
    return new Promise((resolve) => {
      this.bus.requestConfirm({
        id: randomUUID(),
        toolName,
        args,
        resolve,
      });
    });
  }

  async send(userInput: string): Promise<void> {
    return this.sendParts([{ type: "text", text: userInput }], userInput);
  }

  async sendParts(parts: ContentPart[], displayText?: string): Promise<void> {
    const display =
      displayText ??
      parts
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join("\n");
    this.bus.emitEvent({ kind: "user", text: display });

    // Check if provider is connected
    if (!this.config.apiKey) {
      this.bus.emitEvent({ kind: "error", text: "API not connected. Open Settings (⚙) to add a provider." });
      return;
    }

    // Plain string when single text part — keeps providers without multimodal happy
    const content: string | ContentPart[] =
      parts.length === 1 && parts[0]!.type === "text"
        ? parts[0]!.text
        : parts;
    this.messages.push({ role: "user", content });

    const toolDefs = this.tools.map((t) => t.definition);
    this.bus.setBusy(true);
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    try {
      for (let turn = 0; turn < MAX_TURNS; turn++) {
        if (signal.aborted) break;
        this.bus.emitEvent({ kind: "assistant-start" });
        const turnStart = Date.now();
        const turnResult = await streamChat(
          this.config,
          this.messages,
          toolDefs,
          (chunk) => this.bus.emitEvent({ kind: "assistant-chunk", text: chunk }),
          signal,
        );
        const elapsed = ((Date.now() - turnStart) / 1000).toFixed(1);
        this.bus.emitEvent({ kind: "assistant-end" });

        // Track token usage and time
        if (turnResult.usage) {
          this._totalTokens += turnResult.usage.total_tokens ?? 0;
          this.bus.emitEvent({ kind: "info", text: `${elapsed}s · ${turnResult.usage.prompt_tokens ?? 0} in / ${turnResult.usage.completion_tokens ?? 0} out tokens` });
        } else {
          this.bus.emitEvent({ kind: "info", text: `${elapsed}s` });
        }

        this.messages.push({
          role: "assistant",
          content: turnResult.content || null,
          tool_calls: turnResult.toolCalls.length ? turnResult.toolCalls : undefined,
        });

        if (turnResult.toolCalls.length === 0) return;

        for (const call of turnResult.toolCalls) {
          const tool = this.toolMap.get(call.function.name);
          let resultText: string;

          if (!tool) {
            resultText = `Unknown tool: ${call.function.name}`;
            this.bus.emitEvent({ kind: "error", text: resultText });
            this.messages.push({
              role: "tool",
              tool_call_id: call.id,
              content: resultText,
            });
            continue;
          }

          let parsed: Record<string, unknown> = {};
          try {
            parsed = call.function.arguments
              ? JSON.parse(call.function.arguments)
              : {};
          } catch (e) {
            resultText = `Invalid JSON arguments: ${(e as Error).message}`;
            this.bus.emitEvent({
              kind: "tool-result",
              id: call.id,
              ok: false,
              text: resultText,
            });
            this.messages.push({
              role: "tool",
              tool_call_id: call.id,
              content: resultText,
            });
            continue;
          }

          this.bus.emitEvent({
            kind: "tool-call",
            id: call.id,
            name: call.function.name,
            args: parsed,
          });

          const needsConfirm =
            tool.requiresConfirmation &&
            !this.config.autoApprove &&
            !this.alwaysAllow.has(call.function.name);

          if (needsConfirm) {
            const decision = await this.askConfirm(call.function.name, parsed);
            if (decision === "no") {
              this.bus.emitEvent({
                kind: "tool-denied",
                id: call.id,
                name: call.function.name,
              });
              resultText = "User denied this tool call.";
              this.messages.push({
                role: "tool",
                tool_call_id: call.id,
                content: resultText,
              });
              continue;
            }
            if (decision === "always") {
              this.alwaysAllow.add(call.function.name);
            }
          }

          try {
            resultText = await tool.run(parsed);
            this.bus.emitEvent({
              kind: "tool-result",
              id: call.id,
              ok: true,
              text: resultText,
            });
          } catch (e) {
            resultText = `Tool error: ${(e as Error).message}`;
            this.bus.emitEvent({
              kind: "tool-result",
              id: call.id,
              ok: false,
              text: resultText,
            });
          }

          this.messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: resultText,
          });
        }
      }

      this.bus.emitEvent({
        kind: "error",
        text: `reached max turns (${MAX_TURNS}); stopping.`,
      });
    } finally {
      this.bus.setBusy(false);
    }
  }
}
