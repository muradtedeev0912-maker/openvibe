import { randomUUID } from "node:crypto";
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
    "1. ALWAYS use tools to create/edit files. NEVER paste source code in chat.",
    "2. To create a new file: use write_file tool with the full content.",
    "3. To fix/modify an existing file: use edit_file tool (old_str → new_str). Do NOT use write_file for files that already exist.",
    "4. After creating or editing a file, respond ONLY with a short summary and the run command if applicable. Example: 'Created calculator.py. Run: python calculator.py'",
    "5. NEVER dump the full source code in your text response. The user can see the file in the editor.",
    "6. If unsure whether a file exists, use read_file or list_dir first.",
    "",
    "Tool use:",
    "- read_file, list_dir, grep — use freely to investigate.",
    "- write_file — ONLY for new files that don't exist yet.",
    "- edit_file — for modifying existing files. Always use this instead of write_file when the file exists.",
    "- bash — for running commands.",
    "",
    "Behavior:",
    "- If the user asks where they are — answer from context, no tool needed.",
    "- If the user asks to look at the project — read files yourself.",
    "- Be concise. No code blocks in chat. Use tools instead.",
    "- After changes, give a one-line summary + run command.",
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

  constructor(config: Config, tools: Tool[], bus: SessionBus) {
    this.config = config;
    this.tools = tools;
    this.bus = bus;
    this.messages = [{ role: "system", content: systemPrompt(config.cwd) }];
    this.toolMap = new Map(tools.map((t) => [t.definition.function.name, t]));
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

  stop(): void {
    this.abortController?.abort();
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
        const turnResult = await streamChat(
          this.config,
          this.messages,
          toolDefs,
          (chunk) => this.bus.emitEvent({ kind: "assistant-chunk", text: chunk }),
          signal,
        );
        this.bus.emitEvent({ kind: "assistant-end" });

        this.messages.push({
          role: "assistant",
          content: turnResult.content || null,
          tool_calls: turnResult.toolCalls.length ? turnResult.toolCalls : undefined,
        });

        if (turnResult.toolCalls.length === 0) break;

        for (const call of turnResult.toolCalls) {
          if (signal.aborted) break;

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
    } catch (err) {
      const isAbort = (err as Error).name === "AbortError" || (err as Error).message === "Aborted";
      if (isAbort) {
        this.bus.emitEvent({ kind: "info", text: "Manually Stopped" });
      } else {
        this.bus.emitEvent({ kind: "error", text: (err as Error).message });
      }
    } finally {
      this.bus.setBusy(false);
      this.abortController = null;
    }
  }
}
