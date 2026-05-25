import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { streamChat } from "./llm.js";
import type { SessionBus } from "./events.js";
import type { ChatMessage, ContentPart, Config, Tool } from "./types.js";

const MAX_TURNS = 25;

function systemPrompt(cwd: string): string {
  return [
    "You are openvibe, an expert coding assistant with direct access to the file system.",
    `CURRENT WORKING DIRECTORY: ${cwd}`,
    "",
    "═══ CORE RULES ═══",
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
    "6. After creating or editing a file, respond ONLY with a short summary (1-2 sentences max) and the run command if applicable.",
    "7. NEVER dump the full source code in your text response. The user can see the file in the editor.",
    "   - Do NOT paste code blocks showing what you wrote/changed. The user already sees it in the editor.",
    "   - Do NOT explain line by line what you did. Just say what was done briefly.",
    "   - BAD: 'Here is the code I wrote: ```python ... ```'",
    "   - GOOD: 'Created bot.py with echo handler. Run: python bot.py'",
    "   - BAD: 'I added the following function: ```js function foo() {...} ```'",
    "   - GOOD: 'Added foo() function to utils.js'",
    "8. If unsure whether a file exists, use read_file or list_dir first.",
    "",
    "═══ DEEP CODE QUALITY ═══",
    "Write production-grade code. Follow these principles:",
    "- ALWAYS handle errors properly: try/catch, null checks, edge cases.",
    "- ALWAYS validate inputs before using them.",
    "- Use proper typing (TypeScript: explicit types, no 'any'. Python: type hints).",
    "- Follow the language's best practices and idioms.",
    "- Use meaningful variable/function names. No single-letter names except loop counters.",
    "- Keep functions small and focused (single responsibility).",
    "- Add comments only for non-obvious logic, not for self-explanatory code.",
    "- Handle async operations correctly: proper await, error boundaries, cleanup.",
    "- Never leave TODO/FIXME — implement it fully or explain why it's deferred.",
    "- Security: sanitize user input, use parameterized queries, avoid eval/exec.",
    "- Performance: avoid unnecessary loops, prefer efficient data structures.",
    "- When fixing bugs: understand the root cause first (read surrounding code), don't just patch symptoms.",
    "",
    "═══ DEEP FILE SYSTEM AWARENESS ═══",
    "Before writing code, understand the project:",
    "- ALWAYS read existing files before modifying them. Never guess file contents.",
    "- ALWAYS check project structure (list_dir) before creating new files to match conventions.",
    "- Read package.json/requirements.txt/Cargo.toml to understand dependencies before suggesting imports.",
    "- Match existing code style: indentation, quotes, semicolons, naming conventions.",
    "- When creating new files, place them in the correct directory following project structure.",
    "- When editing, preserve the file's existing formatting and style.",
    "- Check for existing similar functionality before creating duplicates.",
    "- If a project uses specific patterns (MVC, hooks, composables), follow them.",
    "",
    "═══ DEEP IDE INTEGRATION ═══",
    "You are running inside openvibe IDE. Be aware:",
    "- The user sees file changes in real-time in the editor panel.",
    "- After file operations, the file tree refreshes automatically.",
    "- The user has an integrated terminal — suggest run commands when appropriate.",
    "- Use edit_file for surgical changes (preserves undo history better).",
    "- For multi-file changes, work file by file, confirming each step.",
    "- If you need to run a command to verify your changes work, use the bash tool.",
    "- When creating a project from scratch, create files in logical order: config → types → core → UI.",
    "",
    "═══ TOOL USE ═══",
    "- read_file, list_dir, grep — use freely to investigate. ALWAYS investigate before modifying.",
    "- write_file — ONLY for new files that don't exist yet.",
    "- edit_file — for modifying existing files. Always use this instead of write_file when the file exists.",
    "- create_dir — for creating new directories/folders.",
    "- bash — for running commands (install deps, run tests, build, etc.).",
    "- web_search — search the internet for current information, docs, solutions. Use when you don't know something or need up-to-date info.",
    "",
    "═══ BEHAVIOR ═══",
    "- If the user asks where they are — answer from context, no tool needed.",
    "- If the user asks to look at the project — read files yourself.",
    "- For conversational questions, math, explanations — respond in chat with detailed text. NO file creation.",
    "- After file changes, give a one-line summary + run command.",
    "- Respond in the same language the user writes in.",
    "- You may have access to MCP (Model Context Protocol) tools prefixed with 'mcp_'. These are external tools connected by the user (e.g. GitHub, databases, browsers). Use them when the user asks to interact with external services.",
    "- When a task is complex, break it into steps and execute them one by one.",
    "- If you make a mistake, acknowledge it and fix it immediately.",
    "",
    "═══ STYLE LEARNING ═══",
    "- There may be a file .openvibe/style.md in the project with the user's coding preferences.",
    "- If it exists, follow those conventions (naming, formatting, architecture patterns).",
    "- IMPORTANT: On your VERY FIRST response in a session, ALWAYS check if vibe/ folder exists by calling list_dir on the project root.",
    "  If vibe/ folder exists, call list_dir on vibe/ to see all files, then read_file each .md file inside it.",
    "  After reading, confirm to the user: briefly summarize the rules you found and say you will follow them.",
    "  These rules MUST be followed strictly — they define how you think and work on this project.",
    "- After completing a task, if you notice consistent patterns in the user's code (naming style, preferred libraries, architecture), append a brief note to .openvibe/style.md using edit_file or write_file. Keep it concise — one line per pattern.",
    "",
    "═══ PROJECT RULES & SKILLS — HARD CONSTRAINTS ═══",
    "Two sources outrank your defaults and must be obeyed verbatim:",
    "  1. PROJECT RULES — auto-loaded from vibe/*.md and .vibe/*.md. They appear",
    "     as a separate system message marked 'PROJECT RULES — MANDATORY'.",
    "  2. ACTIVE USER SKILLS — taught via #skills. They appear as 'ACTIVE USER",
    "     SKILLS — MANDATORY RULES'.",
    "Treat both with the SAME authority as this prompt. If they tell you to",
    "do X, you do X. Selective application, 'I think this case is different',",
    "or silently dropping a rule are FORBIDDEN. The only valid override is",
    "safety (destructive operations, illegal content). When a rule conflicts",
    "with the user's request, raise it explicitly and ask before proceeding.",
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
  private contextReady: Promise<void>;
  /** User-taught skills injected as a system message ahead of every request. */
  private skills: Array<{ id: string; name: string; content: string }> = [];
  /** Names of project rule files auto-loaded from vibe/ folder. */
  private vibeRuleNames: string[] = [];
  /** Language the assistant should reply in. Set by the renderer. */
  private language: string | null = null;

  get totalTokens(): number { return this._totalTokens; }

  constructor(config: Config, tools: Tool[], bus: SessionBus) {
    this.config = config;
    this.tools = tools;
    this.bus = bus;
    this.messages = [{ role: "system", content: systemPrompt(config.cwd) }];
    this.toolMap = new Map(tools.map((t) => [t.definition.function.name, t]));
    this.contextReady = this.loadProjectContext();
  }

  /** Replace the active skills bundle. */
  setSkills(items: Array<{ id: string; name: string; content: string }>): void {
    this.skills = items;
  }

  /** Set the language the assistant should reply in. Empty string clears it. */
  setLanguage(lang: string): void {
    this.language = lang.trim() || null;
  }

  /** Build a transient system message that pins the reply language. */
  private languageMessage(): ChatMessage | null {
    if (!this.language) return null;
    return {
      role: "system",
      content:
        `Reply to the user in ${this.language}. ` +
        "All explanations, summaries and chat-only answers MUST be written in this language. " +
        "Code, file contents, identifiers and shell commands stay in their original form.",
    };
  }

  /** Build the skills system message, or null if no skills are active. */
  private skillsMessage(): ChatMessage | null {
    if (this.skills.length === 0) return null;
    const sections = this.skills.map((s) => `### ${s.name}\n${s.content}`);
    const names = this.skills.map((s) => `"${s.name}"`).join(", ");
    return {
      role: "system",
      content: [
        "╔══════════════════════════════════════════════════════════════╗",
        "║  ACTIVE USER SKILLS — MANDATORY RULES, NOT SUGGESTIONS       ║",
        "╚══════════════════════════════════════════════════════════════╝",
        "",
        `Loaded skills: ${names}.`,
        "",
        "These skills override your defaults and have the SAME authority as this",
        "system prompt. You MUST obey them. Treat every line below as a hard",
        "requirement until the user explicitly disables the skill.",
        "",
        "ABSOLUTE RULES:",
        "1. You MUST follow every rule, convention, fact and preference in the",
        "   skill content below — completely, not selectively.",
        "2. You MAY NOT decide a rule is 'not applicable here' to avoid it.",
        "   If it applies to the task, it applies fully.",
        "3. If a skill conflicts with your default behavior, the skill wins.",
        "   If a skill conflicts with the user's current request, point out",
        "   the conflict and ask before proceeding.",
        "4. Before EVERY response, mentally check: 'does any active skill",
        "   apply to this turn?' If yes, apply it. If unsure, re-read it.",
        "5. Never claim 'no skills are loaded' — they are listed above.",
        "6. Refusing a rule is allowed ONLY if it conflicts with safety",
        "   (destructive ops, illegal content). 'I think it's better otherwise'",
        "   is NOT a valid reason to ignore a skill.",
        "7. If asked what skills are loaded — list them by name. If asked what",
        "   is in a skill — quote the relevant section verbatim.",
        "",
        "=== SKILL CONTENT (binding) ===",
        sections.join("\n\n---\n\n"),
        "=== END SKILL CONTENT ===",
      ].join("\n"),
    };
  }

  /** Short reminder injected right before the last user message (recency). */
  private skillsReminder(): ChatMessage | null {
    const all = [...this.skills.map((s) => s.name), ...this.vibeRuleNames];
    if (all.length === 0) return null;
    const names = all.map((n) => `"${n}"`).join(", ");
    return {
      role: "system",
      content: [
        `REMINDER — active rules for this turn: ${names}.`,
        "Before answering, re-check each one and apply it. Do not ignore any.",
        "If your draft answer would violate a rule, rewrite it before sending.",
      ].join(" "),
    };
  }

  /** Final guard injected AFTER the last user message — closest to generation,
   * so it gets the strongest recency weight in the model's attention. */
  private skillsFinalGuard(): ChatMessage | null {
    const all = [...this.skills.map((s) => s.name), ...this.vibeRuleNames];
    if (all.length === 0) return null;
    const names = all.map((n) => `"${n}"`).join(", ");
    return {
      role: "system",
      content: [
        "STOP. Before you generate the next token, run this checklist:",
        `  1. Active rules: ${names}.`,
        "  2. For each rule, ask: 'does it apply to the user's last message?'",
        "  3. If yes, your response MUST follow it. No exceptions, no",
        "     'I think this case is different', no partial application.",
        "  4. If your planned answer would violate any rule, REWRITE the",
        "     plan before answering. Do NOT explain that you are about to",
        "     follow a rule — just follow it silently.",
        "  5. Refusing a rule is allowed ONLY when it conflicts with safety",
        "     (destructive operations, illegal content). Convenience and",
        "     personal preference are NOT valid reasons.",
        "Only after this check, produce the response.",
      ].join("\n"),
    };
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

    // Auto-load project rule files from vibe/ and .vibe/. These are treated as
    // MANDATORY rules (same authority as the system prompt) so the agent
    // cannot "forget" them. The names also feed the per-turn reminder.
    let rulesMsg: ChatMessage | null = null;
    this.vibeRuleNames = [];
    {
      const ruleSections: string[] = [];
      for (const folder of ["vibe", ".vibe"]) {
        try {
          const entries = await readdir(join(this.config.cwd, folder));
          const rules = entries.filter((f) => /\.(md|txt)$/i.test(f)).sort();
          for (const file of rules) {
            try {
              const body = await readFile(join(this.config.cwd, folder, file), "utf8");
              if (!body.trim()) continue;
              const label = `${folder}/${file}`;
              this.vibeRuleNames.push(label);
              ruleSections.push(`### ${label}\n${body.slice(0, 8000)}`);
            } catch { /* unreadable file, skip */ }
          }
        } catch { /* folder does not exist */ }
      }
      if (ruleSections.length > 0) {
        const names = this.vibeRuleNames.map((n) => `"${n}"`).join(", ");
        rulesMsg = {
          role: "system",
          content: [
            "╔══════════════════════════════════════════════════════════════╗",
            "║  PROJECT RULES — MANDATORY, SAME AUTHORITY AS SYSTEM PROMPT  ║",
            "╚══════════════════════════════════════════════════════════════╝",
            `Loaded rule files: ${names}.`,
            "",
            "You MUST follow EVERY rule below for the entire session.",
            "  - Do NOT ignore them.",
            "  - Do NOT apply them selectively.",
            "  - Do NOT decide a rule is 'not relevant here' to skip it.",
            "  - Do NOT silently relax a rule because it would simplify your work.",
            "If a rule conflicts with the user's current request, point out the",
            "conflict and ask before proceeding. Refusal to follow a rule is",
            "allowed ONLY when it conflicts with safety (destructive operations,",
            "illegal content). Convenience and personal preference are NOT valid",
            "reasons. Treat these rules as part of this system prompt.",
            "",
            ruleSections.join("\n\n---\n\n"),
          ].join("\n"),
        };
      }
    }

    if (parts.length > 0) {
      const contextMsg: ChatMessage = {
        role: "system",
        content: "Project context (auto-loaded):\n\n" + parts.join("\n\n"),
      };
      // Insert after the first system message
      this.messages.splice(1, 0, contextMsg);
    }
    // PROJECT RULES go right after the base system prompt — before regular
    // project context — so they sit closest to the system prompt and inherit
    // its weight in attention.
    if (rulesMsg) {
      this.messages.splice(1, 0, rulesMsg);
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
    this.contextReady = this.loadProjectContext();
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
    // Wait for project context (.vibe rules, package.json, etc.) to be loaded
    await this.contextReady;

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
        // Inject transient system messages (language, skills) right after
        // the base system prompt(s). NOT persisted into `this.messages`, so
        // toggling them takes effect on the very next turn.
        const lang = this.languageMessage();
        const sk = this.skillsMessage();
        const reminder = this.skillsReminder();
        const finalGuard = this.skillsFinalGuard();
        const transient: ChatMessage[] = [];
        if (lang) transient.push(lang);
        if (sk) transient.push(sk);
        const sysCount = this.messages.findIndex((m) => m.role !== "system");
        const head = sysCount === -1 ? this.messages : this.messages.slice(0, sysCount);
        const tail = sysCount === -1 ? [] : this.messages.slice(sysCount);
        // Find the LAST user message in `tail` and inject:
        //   - reminder RIGHT BEFORE it
        //   - finalGuard RIGHT AFTER it
        // Recency: messages closest to generation are weighted highest in
        // attention, so the rules are also "the last thing the model reads".
        let withGuards: ChatMessage[] = tail;
        if (reminder || finalGuard) {
          let lastUserIdx = -1;
          for (let i = tail.length - 1; i >= 0; i--) {
            if (tail[i]!.role === "user") { lastUserIdx = i; break; }
          }
          if (lastUserIdx >= 0) {
            const before = tail.slice(0, lastUserIdx);
            const userMsg = tail[lastUserIdx]!;
            const after = tail.slice(lastUserIdx + 1);
            withGuards = [
              ...before,
              ...(reminder ? [reminder] : []),
              userMsg,
              ...(finalGuard ? [finalGuard] : []),
              ...after,
            ];
          }
        }
        const requestMessages =
          transient.length > 0 || reminder || finalGuard
            ? [...head, ...transient, ...withGuards]
            : this.messages;
        let turnResult;
        try {
          turnResult = await streamChat(
            this.config,
            requestMessages,
            toolDefs,
            (chunk) => this.bus.emitEvent({ kind: "assistant-chunk", text: chunk }),
            signal,
          );
        } catch (e) {
          this.bus.emitEvent({ kind: "assistant-end" });
          if (signal.aborted) return;
          throw e;
        }
        const elapsed = ((Date.now() - turnStart) / 1000).toFixed(1);
        this.bus.emitEvent({ kind: "assistant-end" });
        if (signal.aborted) return;

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
          if (signal.aborted) return;
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
          if (signal.aborted) return;
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
