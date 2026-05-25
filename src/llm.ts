import type { ChatMessage, Config, ContentPart, ToolCall, ToolDefinition } from "./types.js";

export interface StreamDelta {
  content?: string;
  toolCalls?: ToolCall[];
}

export interface AssistantTurn {
  content: string;
  toolCalls: ToolCall[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

/** Heuristic: does this model accept multimodal image_url content?
 *  Open by default for unknown models — better to send the image and let
 *  the provider decide than silently strip it. */
function supportsVision(model: string): boolean {
  const m = model.toLowerCase();
  // OpenAI vision-capable families: gpt-4o, gpt-4-turbo, gpt-4-vision,
  // gpt-4.x, gpt-5.x, o1*, o3*, o4* — all current and future.
  if (/^gpt-4o/.test(m)) return true;
  if (/^gpt-4-?(?:vision|turbo|\.\d+)/.test(m)) return true;
  if (/^gpt-?[5-9]/.test(m)) return true;
  if (/^o[1-9]/.test(m)) return true;
  // Anthropic Claude: any opus/sonnet/haiku from Claude 3+ accept images.
  if (/claude.*(?:opus|sonnet|haiku)/.test(m)) return true;
  if (/^(?:opus|sonnet|haiku)-?\d/.test(m)) return true;
  // Google Gemini: 1.5+, 2.x, 3.x — all multimodal.
  if (/gemini-?(?:1\.5|2|3|[4-9])/.test(m)) return true;
  if (/gemini.*(?:pro|flash|ultra)/.test(m)) return true;
  // Meta Llama vision (3.2-vision, llama-4*, llama-vision)
  if (/llama-?[34].*vision/.test(m)) return true;
  if (/llama-?[4-9]/.test(m)) return true;
  // Qwen VL / Qwen3-VL family
  if (/qwen.*vl/.test(m)) return true;
  // Mistral / Pixtral / Llava / InternVL
  if (/pixtral|llava|internvl/.test(m)) return true;
  // Grok vision (xAI)
  if (/grok.*vision/.test(m)) return true;
  if (/grok-?[2-9]/.test(m)) return true;
  return false;
}

/** Detect OpenAI reasoning models (o1, o1-mini, o1-preview, o3*, o4*, etc.).
 *  These do NOT accept `system` messages, `temperature`, or `tools` in the
 *  traditional way — they need different request shaping. */
function isReasoningModel(model: string): boolean {
  const m = model.toLowerCase();
  return /^o[1-9](?:-|$)/.test(m);
}

/** Flatten multimodal content for text-only models. */
function flattenForTextOnly(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((m) => {
    if (!Array.isArray(m.content)) return m;
    const parts = m.content as ContentPart[];
    const text = parts
      .map((p) => {
        if (p.type === "text") return p.text;
        if (p.type === "image_url") return "[image attached]";
        return "";
      })
      .filter(Boolean)
      .join("\n");
    return { ...m, content: text };
  });
}

/** OpenAI reasoning models reject `system` messages. Concatenate any system
 *  prompt(s) into the first user message so the instructions still reach
 *  the model. */
function mergeSystemIntoFirstUser(messages: ChatMessage[]): ChatMessage[] {
  const systems: string[] = [];
  const rest: ChatMessage[] = [];
  for (const m of messages) {
    if (m.role === "system") {
      const text = typeof m.content === "string"
        ? m.content
        : Array.isArray(m.content)
          ? m.content.map((p) => (p.type === "text" ? p.text : "")).join("\n")
          : "";
      if (text) systems.push(text);
    } else {
      rest.push(m);
    }
  }
  if (systems.length === 0) return rest;
  const sysText = systems.join("\n\n");
  // Prepend to first user message; if none, create one.
  const firstUserIdx = rest.findIndex((m) => m.role === "user");
  if (firstUserIdx === -1) {
    return [{ role: "user", content: sysText }, ...rest];
  }
  const u = rest[firstUserIdx]!;
  if (typeof u.content === "string") {
    rest[firstUserIdx] = { ...u, content: `${sysText}\n\n${u.content}` };
  } else if (Array.isArray(u.content)) {
    rest[firstUserIdx] = {
      ...u,
      content: [{ type: "text", text: sysText }, ...u.content],
    };
  } else {
    rest[firstUserIdx] = { ...u, content: sysText };
  }
  return rest;
}

/** Remove older messages from the middle to reduce token count.
 *  Keeps system prompt + last ~10 messages. Mutates the array. */
function trimMessages(messages: ChatMessage[]): void {
  // Keep system (first) + last 10 messages
  const keep = 10;
  if (messages.length <= keep + 1) return;
  const system = messages[0]?.role === "system" ? messages.shift()! : null;
  const tail = messages.splice(-keep);
  messages.length = 0;
  if (system) messages.push(system);
  messages.push({
    role: "user",
    content: "[earlier conversation trimmed to fit context limit]",
  });
  messages.push(...tail);
}

/**
 * Streams a chat completion. Routes to the Anthropic Messages API for
 * `api.anthropic.com` endpoints, otherwise uses the OpenAI-compatible
 * `/chat/completions` shape (which covers OpenAI, Google AI's compat
 * endpoint, Groq, DeepSeek, OpenRouter, Ollama, LM Studio, vLLM, etc.).
 * Calls onDelta for each text chunk so we can render it live.
 * Retries automatically on 429 rate-limit errors.
 */
export async function streamChat(
  config: Config,
  messages: ChatMessage[],
  tools: ToolDefinition[],
  onDelta: (text: string) => void,
  signal?: AbortSignal,
): Promise<AssistantTurn> {
  if (isAnthropicEndpoint(config.baseUrl)) {
    return streamAnthropic(config, messages, tools, onDelta, signal);
  }
  return streamOpenAI(config, messages, tools, onDelta, signal);
}

function isAnthropicEndpoint(baseUrl: string): boolean {
  return /api\.anthropic\.com/.test(baseUrl);
}

async function streamOpenAI(
  config: Config,
  messages: ChatMessage[],
  tools: ToolDefinition[],
  onDelta: (text: string) => void,
  signal?: AbortSignal,
): Promise<AssistantTurn> {
  let outboundMessages = supportsVision(config.model)
    ? messages
    : flattenForTextOnly(messages);

  // OpenAI reasoning models (o1/o1-mini/o1-preview/o3*/o4*) reject `system`
  // role messages. Merge any system content into the first user turn so
  // instructions still reach the model.
  const reasoning = isReasoningModel(config.model);
  if (reasoning) {
    outboundMessages = mergeSystemIntoFirstUser(outboundMessages);
  }

  const MAX_RETRIES = 3;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    // Google AI supports both Bearer token and ?key= param
    const isGoogleAI = config.baseUrl.includes("generativelanguage.googleapis.com");
    const url = isGoogleAI
      ? `${config.baseUrl}/chat/completions?key=${config.apiKey}`
      : `${config.baseUrl}/chat/completions`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${config.apiKey}`,
    };

    const body: Record<string, unknown> = {
      model: config.model,
      messages: outboundMessages,
      stream: true,
      stream_options: { include_usage: true },
    };
    // Reasoning models: skip `tools` (they don't support function calling)
    // and `temperature` (they reject any explicit value).
    if (!reasoning && tools.length) {
      body.tools = tools;
      body.tool_choice = "auto";
    }

    const res = await fetch(url, {
      method: "POST",
      headers,
      signal,
      body: JSON.stringify(body),
    });

    // Friendly 404 — provider doesn't know this model id.
    if (res.status === 404) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Model "${config.model}" not found at ${config.baseUrl}.\n` +
        `Check the model id in Settings or pick another from the provider's docs.\n${text}`,
      );
    }

    if (res.status === 429 || res.status === 413) {
      // Parse retry-after from body or header
      let waitMs = 5000;
      try {
        const body = await res.text();
        const match = /try again in ([\d.]+)s/i.exec(body);
        if (match) waitMs = Math.ceil(parseFloat(match[1]!) * 1000) + 500;
        // For 413 (payload too large) — trim context and retry immediately
        if (res.status === 413) {
          trimMessages(messages);
          await new Promise((r) => setTimeout(r, 1000));
          continue;
        }
      } catch {
        // ignore
      }
      const retryAfter = res.headers.get("retry-after");
      if (retryAfter) {
        const secs = parseFloat(retryAfter);
        if (!isNaN(secs)) waitMs = Math.ceil(secs * 1000) + 500;
      }
      // Cap wait at 60s
      waitMs = Math.min(waitMs, 60000);
      // Silent retry — don't pollute the chat with rate-limit notices
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => "");
      throw new Error(`LLM request failed: ${res.status} ${res.statusText}\n${text}`);
    }

    return parseStream(res.body, onDelta);
  }

  throw new Error("Rate limit: too many retries. Try again in a minute.");
}

async function parseStream(
  body: ReadableStream<Uint8Array>,
  onDelta: (text: string) => void,
): Promise<AssistantTurn> {

  let content = "";
  let usage: AssistantTurn["usage"] = undefined;
  // Accumulate tool call fragments by index, since providers stream them piecewise.
  const toolAcc = new Map<
    number,
    { id: string; name: string; arguments: string }
  >();

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE: events split by blank line, each line "data: <json>"
    let idx: number;
    while ((idx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") continue;

      let event: any;
      try {
        event = JSON.parse(payload);
      } catch {
        continue;
      }

      // Capture usage if present
      if (event.usage) {
        usage = event.usage;
      }

      const delta = event.choices?.[0]?.delta;
      if (!delta) continue;

      if (typeof delta.content === "string" && delta.content.length > 0) {
        content += delta.content;
        onDelta(delta.content);
      }

      // DeepSeek-R1, OpenAI o1/o3, Qwen-QwQ and similar reasoning models
      // stream their internal "thought" as `reasoning_content` (DeepSeek)
      // or `reasoning` (OpenAI). Surface it inline so the user sees it,
      // but mark it visibly so it isn't confused with the final answer.
      const reasoningChunk =
        typeof delta.reasoning_content === "string"
          ? delta.reasoning_content
          : typeof delta.reasoning === "string"
            ? delta.reasoning
            : "";
      if (reasoningChunk) {
        // Stream as italic-prefixed text the markdown renderer can format.
        onDelta(reasoningChunk);
        content += reasoningChunk;
      }

      if (Array.isArray(delta.tool_calls)) {
        for (const tc of delta.tool_calls) {
          const i = tc.index ?? 0;
          const cur = toolAcc.get(i) ?? { id: "", name: "", arguments: "" };
          if (tc.id) cur.id = tc.id;
          if (tc.function?.name) cur.name = tc.function.name;
          if (tc.function?.arguments) cur.arguments += tc.function.arguments;
          toolAcc.set(i, cur);
        }
      }
    }
  }

  const toolCalls: ToolCall[] = [...toolAcc.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, v]) => ({
      id: v.id,
      type: "function" as const,
      function: { name: v.name, arguments: v.arguments },
    }));

  return { content, toolCalls, usage };
}


// ============================================================================
// Anthropic Messages API support
// ----------------------------------------------------------------------------
// Anthropic uses a different shape than OpenAI:
//   POST {base}/messages
//   - `system` is a top-level string (not a message with role "system")
//   - tool calls live in `content` as `{type: "tool_use", id, name, input}`
//   - tool results come back as user messages with
//     `{type: "tool_result", tool_use_id, content}`
//   - SSE events are typed: message_start, content_block_delta, etc.
// ============================================================================

interface AnthropicTextBlock { type: "text"; text: string }
interface AnthropicImageBlock {
  type: "image";
  source: { type: "base64"; media_type: string; data: string } | { type: "url"; url: string };
}
interface AnthropicToolUseBlock { type: "tool_use"; id: string; name: string; input: unknown }
interface AnthropicToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string | Array<AnthropicTextBlock>;
  is_error?: boolean;
}
type AnthropicBlock =
  | AnthropicTextBlock
  | AnthropicImageBlock
  | AnthropicToolUseBlock
  | AnthropicToolResultBlock;

interface AnthropicMessage {
  role: "user" | "assistant";
  content: AnthropicBlock[];
}

/** Convert OpenAI-style messages to Anthropic Messages API format. */
function toAnthropic(messages: ChatMessage[]): { system: string; messages: AnthropicMessage[] } {
  const systemParts: string[] = [];
  const out: AnthropicMessage[] = [];

  for (const m of messages) {
    if (m.role === "system") {
      const text = typeof m.content === "string"
        ? m.content
        : Array.isArray(m.content)
          ? m.content.map((p) => (p.type === "text" ? p.text : "")).join("\n")
          : "";
      if (text) systemParts.push(text);
      continue;
    }

    if (m.role === "tool") {
      // Tool result → user message with tool_result block.
      const text = typeof m.content === "string"
        ? m.content
        : Array.isArray(m.content)
          ? m.content.map((p) => (p.type === "text" ? p.text : "")).join("\n")
          : "";
      const block: AnthropicToolResultBlock = {
        type: "tool_result",
        tool_use_id: m.tool_call_id ?? "",
        content: text,
      };
      out.push({ role: "user", content: [block] });
      continue;
    }

    if (m.role === "assistant") {
      const blocks: AnthropicBlock[] = [];
      const text = typeof m.content === "string"
        ? m.content
        : Array.isArray(m.content)
          ? m.content.map((p) => (p.type === "text" ? p.text : "")).join("")
          : "";
      if (text) blocks.push({ type: "text", text });
      for (const tc of m.tool_calls ?? []) {
        let input: unknown = {};
        try { input = tc.function.arguments ? JSON.parse(tc.function.arguments) : {}; } catch { input = {}; }
        blocks.push({ type: "tool_use", id: tc.id, name: tc.function.name, input });
      }
      if (blocks.length > 0) out.push({ role: "assistant", content: blocks });
      continue;
    }

    // user
    const blocks: AnthropicBlock[] = [];
    if (typeof m.content === "string") {
      if (m.content) blocks.push({ type: "text", text: m.content });
    } else if (Array.isArray(m.content)) {
      for (const p of m.content) {
        if (p.type === "text") blocks.push({ type: "text", text: p.text });
        else if (p.type === "image_url") {
          const url = p.image_url.url;
          if (url.startsWith("data:")) {
            const match = /^data:([^;]+);base64,(.+)$/.exec(url);
            if (match) {
              blocks.push({
                type: "image",
                source: { type: "base64", media_type: match[1]!, data: match[2]! },
              });
            }
          } else {
            blocks.push({ type: "image", source: { type: "url", url } });
          }
        }
      }
    }
    if (blocks.length > 0) out.push({ role: "user", content: blocks });
  }

  // Anthropic requires the conversation to start with a user turn after
  // system. If the first non-system message is assistant, prepend a stub.
  if (out.length > 0 && out[0]!.role === "assistant") {
    out.unshift({ role: "user", content: [{ type: "text", text: "(continue)" }] });
  }

  return { system: systemParts.join("\n\n"), messages: out };
}

/** Convert OpenAI tool defs to Anthropic tool defs. */
function toAnthropicTools(tools: ToolDefinition[]): Array<{ name: string; description: string; input_schema: Record<string, unknown> }> {
  return tools.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters,
  }));
}

async function streamAnthropic(
  config: Config,
  messages: ChatMessage[],
  tools: ToolDefinition[],
  onDelta: (text: string) => void,
  signal?: AbortSignal,
): Promise<AssistantTurn> {
  const outboundMessages = supportsVision(config.model)
    ? messages
    : flattenForTextOnly(messages);

  const MAX_RETRIES = 3;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const { system, messages: amsgs } = toAnthropic(outboundMessages);
    const anthropicTools = tools.length ? toAnthropicTools(tools) : undefined;

    const body: Record<string, unknown> = {
      model: config.model,
      max_tokens: 8192,
      stream: true,
      messages: amsgs,
    };
    if (system) body.system = system;
    if (anthropicTools) body.tools = anthropicTools;

    const res = await fetch(`${config.baseUrl}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
      },
      signal,
      body: JSON.stringify(body),
    });

    if (res.status === 404) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Model "${config.model}" not found at ${config.baseUrl}.\n` +
        `Check the model id in Settings (e.g. claude-opus-4-5, claude-sonnet-4-5).\n${text}`,
      );
    }

    if (res.status === 429 || res.status === 529) {
      const retryAfter = res.headers.get("retry-after");
      let waitMs = 5000;
      if (retryAfter) {
        const secs = parseFloat(retryAfter);
        if (!isNaN(secs)) waitMs = Math.ceil(secs * 1000) + 500;
      }
      waitMs = Math.min(waitMs, 60000);
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }

    if (res.status === 413) {
      trimMessages(messages);
      await new Promise((r) => setTimeout(r, 500));
      continue;
    }

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => "");
      throw new Error(`Anthropic request failed: ${res.status} ${res.statusText}\n${text}`);
    }

    return parseAnthropicStream(res.body, onDelta);
  }

  throw new Error("Rate limit: too many retries. Try again in a minute.");
}

async function parseAnthropicStream(
  body: ReadableStream<Uint8Array>,
  onDelta: (text: string) => void,
): Promise<AssistantTurn> {
  let content = "";
  let usage: AssistantTurn["usage"] = undefined;
  // Per-block accumulator. Anthropic streams content in indexed blocks;
  // text blocks deliver text deltas, tool_use blocks deliver JSON deltas.
  const blocks = new Map<
    number,
    { kind: "text" } | { kind: "tool"; id: string; name: string; argsBuf: string }
  >();

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx: number;
    while ((idx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;

      let event: any;
      try { event = JSON.parse(payload); } catch { continue; }

      switch (event.type) {
        case "message_start": {
          if (event.message?.usage) {
            usage = {
              prompt_tokens: event.message.usage.input_tokens ?? 0,
              completion_tokens: 0,
              total_tokens: event.message.usage.input_tokens ?? 0,
            };
          }
          break;
        }
        case "content_block_start": {
          const i = event.index as number;
          const block = event.content_block;
          if (block?.type === "text") {
            blocks.set(i, { kind: "text" });
          } else if (block?.type === "tool_use") {
            blocks.set(i, { kind: "tool", id: block.id, name: block.name, argsBuf: "" });
          }
          break;
        }
        case "content_block_delta": {
          const i = event.index as number;
          const block = blocks.get(i);
          const delta = event.delta;
          if (!block || !delta) break;
          if (block.kind === "text" && delta.type === "text_delta" && typeof delta.text === "string") {
            content += delta.text;
            onDelta(delta.text);
          } else if (block.kind === "tool" && delta.type === "input_json_delta" && typeof delta.partial_json === "string") {
            block.argsBuf += delta.partial_json;
          }
          break;
        }
        case "message_delta": {
          if (event.usage?.output_tokens != null) {
            const inTok = usage?.prompt_tokens ?? 0;
            const out = event.usage.output_tokens as number;
            usage = { prompt_tokens: inTok, completion_tokens: out, total_tokens: inTok + out };
          }
          break;
        }
        case "error": {
          throw new Error(`Anthropic stream error: ${event.error?.message ?? "unknown"}`);
        }
        default:
          break;
      }
    }
  }

  const toolCalls: ToolCall[] = [];
  for (const [, block] of blocks) {
    if (block.kind === "tool") {
      toolCalls.push({
        id: block.id,
        type: "function",
        function: { name: block.name, arguments: block.argsBuf || "{}" },
      });
    }
  }

  return { content, toolCalls, usage };
}
