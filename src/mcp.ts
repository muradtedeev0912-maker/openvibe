import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { Tool } from "./types.js";

export interface McpServerConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  enabled: boolean;
}

export interface McpToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export class McpClient {
  private process: ChildProcess | null = null;
  private pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private buffer = "";
  private _tools: McpToolDef[] = [];
  private _connected = false;
  readonly config: McpServerConfig;

  constructor(config: McpServerConfig) {
    this.config = config;
  }

  get connected(): boolean { return this._connected; }
  get tools(): McpToolDef[] { return this._tools; }

  async connect(): Promise<void> {
    if (this._connected) return;

    const env = { ...process.env, ...(this.config.env ?? {}) };
    this.process = spawn(this.config.command, this.config.args, {
      stdio: ["pipe", "pipe", "pipe"],
      env,
      shell: process.platform === "win32",
    });

    this.process.stdout!.on("data", (data: Buffer) => {
      this.buffer += data.toString();
      this.processBuffer();
    });

    this.process.on("exit", () => {
      this._connected = false;
      this.process = null;
      // Reject all pending
      for (const [, p] of this.pending) {
        p.reject(new Error("MCP server exited"));
      }
      this.pending.clear();
    });

    // Initialize
    await this.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "openvibe", version: "0.2.0" },
    });

    // Send initialized notification
    this.notify("notifications/initialized", {});

    // List tools
    const result = await this.request("tools/list", {}) as { tools?: McpToolDef[] };
    this._tools = result.tools ?? [];
    this._connected = true;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    const result = await this.request("tools/call", { name, arguments: args }) as {
      content?: Array<{ type: string; text?: string }>;
    };
    if (!result.content) return "No result";
    return result.content
      .filter((c) => c.type === "text" && c.text)
      .map((c) => c.text!)
      .join("\n") || "Done";
  }

  disconnect(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this._connected = false;
    this._tools = [];
  }

  /** Convert MCP tools to openvibe Tool format */
  toVibeTools(): Tool[] {
    return this._tools.map((t) => ({
      requiresConfirmation: true,
      definition: {
        type: "function" as const,
        function: {
          name: `mcp_${this.config.id}_${t.name}`,
          description: `[MCP: ${this.config.name}] ${t.description}`,
          parameters: t.inputSchema as Record<string, unknown>,
        },
      },
      run: async (args: Record<string, unknown>) => {
        return this.callTool(t.name, args);
      },
    }));
  }

  private request(method: string, params: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = randomUUID();
      const msg: JsonRpcRequest = { jsonrpc: "2.0", id, method, params };
      this.pending.set(id, { resolve, reject });
      const data = JSON.stringify(msg);
      const frame = `Content-Length: ${Buffer.byteLength(data)}\r\n\r\n${data}`;
      this.process?.stdin?.write(frame);
    });
  }

  private notify(method: string, params: unknown): void {
    const msg = { jsonrpc: "2.0", method, params };
    const data = JSON.stringify(msg);
    const frame = `Content-Length: ${Buffer.byteLength(data)}\r\n\r\n${data}`;
    this.process?.stdin?.write(frame);
  }

  private processBuffer(): void {
    while (true) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) break;

      const header = this.buffer.slice(0, headerEnd);
      const match = /Content-Length:\s*(\d+)/i.exec(header);
      if (!match) {
        this.buffer = this.buffer.slice(headerEnd + 4);
        continue;
      }

      const len = parseInt(match[1]!, 10);
      const bodyStart = headerEnd + 4;
      if (this.buffer.length < bodyStart + len) break;

      const body = this.buffer.slice(bodyStart, bodyStart + len);
      this.buffer = this.buffer.slice(bodyStart + len);

      try {
        const msg = JSON.parse(body) as JsonRpcResponse;
        if (msg.id && this.pending.has(String(msg.id))) {
          const p = this.pending.get(String(msg.id))!;
          this.pending.delete(String(msg.id));
          if (msg.error) {
            p.reject(new Error(msg.error.message));
          } else {
            p.resolve(msg.result);
          }
        }
      } catch {
        // ignore parse errors
      }
    }
  }
}
