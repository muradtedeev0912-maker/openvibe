import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type { ChatMessage } from "../src/types.js";

export interface ChatRecord {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

export interface ChatSummary {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

/** Persists chat sessions as JSON files in a given directory. */
export class ChatStore {
  private dir: string;

  constructor(dir: string) {
    this.dir = dir;
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
  }

  list(): ChatSummary[] {
    let names: string[] = [];
    try {
      names = readdirSync(this.dir);
    } catch {
      return [];
    }
    const items: ChatSummary[] = [];
    for (const n of names) {
      if (!n.endsWith(".json")) continue;
      try {
        const raw = readFileSync(join(this.dir, n), "utf8");
        const r = JSON.parse(raw) as ChatRecord;
        items.push({
          id: r.id,
          title: r.title,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        });
      } catch {
        // skip corrupt
      }
    }
    items.sort((a, b) => b.updatedAt - a.updatedAt);
    return items;
  }

  get(id: string): ChatRecord | null {
    const p = join(this.dir, `${id}.json`);
    if (!existsSync(p)) return null;
    try {
      return JSON.parse(readFileSync(p, "utf8")) as ChatRecord;
    } catch {
      return null;
    }
  }

  save(record: ChatRecord): void {
    const p = join(this.dir, `${record.id}.json`);
    writeFileSync(p, JSON.stringify(record, null, 2), "utf8");
  }

  delete(id: string): void {
    const p = join(this.dir, `${id}.json`);
    if (existsSync(p)) unlinkSync(p);
  }
}

/** Generate a short title from the first user message. */
export function deriveTitle(messages: ChatMessage[]): string {
  for (const m of messages) {
    if (m.role !== "user") continue;
    const text =
      typeof m.content === "string"
        ? m.content
        : Array.isArray(m.content)
          ? m.content
              .filter((p): p is { type: "text"; text: string } => p.type === "text")
              .map((p) => p.text)
              .join(" ")
          : "";
    const trimmed = text.trim().split("\n")[0]!.slice(0, 60);
    if (trimmed) return trimmed;
  }
  return "New chat";
}
