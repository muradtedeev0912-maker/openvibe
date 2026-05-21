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

/** Heuristic: does this model accept multimodal image_url content? */
function supportsVision(model: string): boolean {
  const m = model.toLowerCase();
  // OpenAI vision models
  if (/^gpt-4o(-mini)?/.test(m)) return true;
  if (m.startsWith("gpt-4-vision")) return true;
  if (m.startsWith("gpt-4-turbo")) return true;
  // Claude (via OpenAI-compatible) — Sonnet/Opus accept images
  if (/claude.*(?:opus|sonnet)/.test(m)) return true;
  // Anthropic-style names that providers expose
  if (/sonnet|opus|haiku/.test(m) && /claude/.test(m)) return true;
  // Llama 3.2 vision
  if (/llama-?3\.?2.*vision/.test(m)) return true;
  // Gemini
  if (/gemini.*(?:pro|flash)/.test(m)) return true;
  // Pixtral / Llava
  if (/pixtral|llava/.test(m)) return true;
  return false;
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
 * Streams a chat completion from any OpenAI-compatible endpoint.
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
  const outboundMessages = supportsVision(config.model)
    ? messages
    : flattenForTextOnly(messages);

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

    const res = await fetch(url, {
      method: "POST",
      headers,
      signal,
      body: JSON.stringify({
        model: config.model,
        messages: outboundMessages,
        tools: tools.length ? tools : undefined,
        tool_choice: tools.length ? "auto" : undefined,
        stream: true,
        stream_options: { include_usage: true },
      }),
    });

    if (res.status === 429 || res.status === 413) {
      // Parse retry-after from body or header
      let waitMs = 5000;
      try {
        const body = await res.text();
        const match = /try again in ([\d.]+)s/i.exec(body);
        if (match) waitMs = Math.ceil(parseFloat(match[1]!) * 1000) + 500;
        // For 413 (payload too large) — trim context and retry immediately
        if (res.status === 413) {
          onDelta("[context too long, trimming history…]");
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
      onDelta(`[rate limited, retrying in ${Math.ceil(waitMs / 1000)}s…]`);
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
