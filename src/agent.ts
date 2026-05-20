import { randomUUID } from "node:crypto";
import { streamChat } from "./llm.js";
import type { SessionBus } from "./events.js";
import type { ChatMessage, ContentPart, Config, Tool } from "./types.js";

const MAX_TURNS = 25;

function systemPrompt(cwd: string): string {
  return [
    "You are vibe, a coding assistant running in the user's terminal.",
    `CURRENT WORKING DIRECTORY: ${cwd}`,
    "Always use this directory for file operations. Use relative paths or this absolute path. Never assume any other path.",
    "",
    "Memory & context:",
    "- The conversation history is persistent: everything the user said, every file you read, every change you made — all of it is in your context. Use it. Don't ask the user to repeat information that was already shared in this chat.",
    "- When the user references something earlier in the chat (\"that file\", \"the function we wrote\", \"as before\"), trust your memory and act on it.",
    "- Track the project state across turns: which files exist, what they contain after your edits, what the user's goal is.",
    "",
    "Tool use:",
    "- Read-only tools (read_file, list_dir, grep) — use freely when relevant. Investigate before answering questions about the project.",
    "- Write tools (write_file, edit_file) and shell (bash) — use them directly when the user asks you to make changes or run commands. Don't ask for permission to act, just do it.",
    "- Never call any tool just for greetings or small talk.",
    "",
    "Behavior:",
    "- If the user asks where they are or about the project — answer using the working directory above; you don't need a tool for that.",
    "- If the user asks you to look at, review, explore, or understand the project — read the relevant files yourself.",
    "- If a request is genuinely ambiguous, ask one clarifying question and stop.",
    "- Make minimal, surgical edits. Don't refactor unrelated code.",
    "- Prefer edit_file for small changes; write_file for new files or full rewrites.",
    "- Be concise. Use code blocks only for code.",
    "- When done with changes, give a short summary of what you did.",
  ].join("\n");
}

export class Agent {
  private messages: ChatMessage[];
  private toolMap: Map<string, Tool>;
  private alwaysAllow = new Set<string>();
  private config: Config;
  private tools: Tool[];
  private bus: SessionBus;

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
    // Plain string when single text part — keeps providers without multimodal happy
    const content: string | ContentPart[] =
      parts.length === 1 && parts[0]!.type === "text"
        ? parts[0]!.text
        : parts;
    this.messages.push({ role: "user", content });

    const toolDefs = this.tools.map((t) => t.definition);
    this.bus.setBusy(true);

    try {
      for (let turn = 0; turn < MAX_TURNS; turn++) {
        this.bus.emitEvent({ kind: "assistant-start" });
        const turnResult = await streamChat(
          this.config,
          this.messages,
          toolDefs,
          (chunk) => this.bus.emitEvent({ kind: "assistant-chunk", text: chunk }),
        );
        this.bus.emitEvent({ kind: "assistant-end" });

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
