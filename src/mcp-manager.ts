import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { McpClient, type McpServerConfig } from "./mcp.js";
import type { Tool } from "./types.js";

export class McpManager {
  private clients = new Map<string, McpClient>();
  private configPath: string;
  private configs: McpServerConfig[] = [];

  constructor(dataDir: string) {
    const dir = join(dataDir, "mcp");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    this.configPath = join(dir, "servers.json");
    this.load();
  }

  private load(): void {
    if (!existsSync(this.configPath)) return;
    try {
      const raw = readFileSync(this.configPath, "utf8");
      this.configs = JSON.parse(raw) as McpServerConfig[];
    } catch { /* ignore */ }
  }

  private save(): void {
    writeFileSync(this.configPath, JSON.stringify(this.configs, null, 2), "utf8");
  }

  getConfigs(): McpServerConfig[] {
    return [...this.configs];
  }

  getStatus(): Array<{ id: string; name: string; connected: boolean; toolCount: number }> {
    return this.configs.map((c) => {
      const client = this.clients.get(c.id);
      return {
        id: c.id,
        name: c.name,
        connected: client?.connected ?? false,
        toolCount: client?.tools.length ?? 0,
      };
    });
  }

  addServer(config: Omit<McpServerConfig, "id">): McpServerConfig {
    const id = `mcp_${Date.now().toString(36)}`;
    const full: McpServerConfig = { ...config, id };
    this.configs.push(full);
    this.save();
    return full;
  }

  removeServer(id: string): void {
    const client = this.clients.get(id);
    if (client) {
      client.disconnect();
      this.clients.delete(id);
    }
    this.configs = this.configs.filter((c) => c.id !== id);
    this.save();
  }

  async connectServer(id: string): Promise<{ ok: boolean; error?: string; toolCount?: number }> {
    const config = this.configs.find((c) => c.id === id);
    if (!config) return { ok: false, error: "Server not found" };

    let client = this.clients.get(id);
    if (client?.connected) return { ok: true, toolCount: client.tools.length };

    client = new McpClient(config);
    this.clients.set(id, client);

    try {
      await client.connect();
      return { ok: true, toolCount: client.tools.length };
    } catch (err) {
      this.clients.delete(id);
      return { ok: false, error: (err as Error).message };
    }
  }

  disconnectServer(id: string): void {
    const client = this.clients.get(id);
    if (client) {
      client.disconnect();
      this.clients.delete(id);
    }
  }

  /** Get all tools from all connected MCP servers */
  getAllTools(): Tool[] {
    const tools: Tool[] = [];
    for (const client of this.clients.values()) {
      if (client.connected) {
        tools.push(...client.toVibeTools());
      }
    }
    return tools;
  }

  /** Auto-connect all enabled servers */
  async autoConnect(): Promise<void> {
    for (const config of this.configs) {
      if (config.enabled) {
        await this.connectServer(config.id).catch(() => {});
      }
    }
  }

  disconnectAll(): void {
    for (const client of this.clients.values()) {
      client.disconnect();
    }
    this.clients.clear();
  }
}
