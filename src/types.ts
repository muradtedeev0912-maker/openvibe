export type Role = "system" | "user" | "assistant" | "tool";

/** OpenAI-style content parts. Strings still work for plain text. */
export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string; // JSON-encoded
  };
}

export interface ChatMessage {
  role: Role;
  content: string | ContentPart[] | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface Tool {
  definition: ToolDefinition;
  /** Whether to ask the user before running. */
  requiresConfirmation: boolean;
  run: (args: Record<string, unknown>) => Promise<string>;
}

export interface Config {
  apiKey: string;
  baseUrl: string;
  model: string;
  cwd: string;
  autoApprove: boolean;
}
