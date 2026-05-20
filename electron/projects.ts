import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, sep } from "node:path";

export interface Project {
  id: string;
  path: string;
  name: string;
  color: string;
  addedAt: number;
}

interface State {
  projects: Project[];
  activeId: string | null;
}

const COLORS = [
  "#3b82f6",
  "#a855f7",
  "#ec4899",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#06b6d4",
  "#8b5cf6",
];

function pickColor(seed: string, used: string[]): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  // prefer an unused color first
  const start = Math.abs(h) % COLORS.length;
  for (let i = 0; i < COLORS.length; i++) {
    const c = COLORS[(start + i) % COLORS.length]!;
    if (!used.includes(c)) return c;
  }
  return COLORS[start]!;
}

function basename(p: string): string {
  const cleaned = p.replace(/[\\/]+$/, "");
  const parts = cleaned.split(/[\\/]/);
  return parts[parts.length - 1] || cleaned;
}

export class ProjectStore {
  private file: string;
  private dataDir: string;
  private state: State = { projects: [], activeId: null };

  constructor(baseDir: string) {
    this.dataDir = baseDir;
    if (!existsSync(this.dataDir)) mkdirSync(this.dataDir, { recursive: true });
    this.file = join(this.dataDir, "projects.json");
    this.load();
  }

  private load(): void {
    if (!existsSync(this.file)) return;
    try {
      const raw = readFileSync(this.file, "utf8");
      const parsed = JSON.parse(raw) as State;
      if (parsed && Array.isArray(parsed.projects)) {
        this.state.projects = parsed.projects;
        this.state.activeId = parsed.activeId ?? null;
      }
    } catch {
      // corrupt — start fresh
    }
  }

  private save(): void {
    writeFileSync(this.file, JSON.stringify(this.state, null, 2), "utf8");
  }

  list(): Project[] {
    return [...this.state.projects];
  }

  getActive(): Project | null {
    if (!this.state.activeId) return null;
    return (
      this.state.projects.find((p) => p.id === this.state.activeId) ?? null
    );
  }

  /** Get or create a project for a given absolute path. */
  ensure(path: string): Project {
    const existing = this.state.projects.find((p) => p.path === path);
    if (existing) return existing;
    const id = `p${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 7)}`;
    const used = this.state.projects.map((p) => p.color);
    const project: Project = {
      id,
      path,
      name: basename(path),
      color: pickColor(path, used),
      addedAt: Date.now(),
    };
    this.state.projects.push(project);
    this.save();
    return project;
  }

  add(path: string): Project {
    const project = this.ensure(path);
    this.state.activeId = project.id;
    this.save();
    return project;
  }

  remove(id: string): Project | null {
    const idx = this.state.projects.findIndex((p) => p.id === id);
    if (idx === -1) return null;
    this.state.projects.splice(idx, 1);
    let nextActive: Project | null = null;
    if (this.state.activeId === id) {
      nextActive =
        this.state.projects[idx] ??
        this.state.projects[idx - 1] ??
        this.state.projects[0] ??
        null;
      this.state.activeId = nextActive?.id ?? null;
    }
    this.save();
    return nextActive ?? this.getActive();
  }

  rename(id: string, name: string): void {
    const p = this.state.projects.find((p) => p.id === id);
    if (!p) return;
    p.name = name;
    this.save();
  }

  setActive(id: string): Project | null {
    const p = this.state.projects.find((p) => p.id === id);
    if (!p) return null;
    this.state.activeId = id;
    this.save();
    return p;
  }

  /** Clear the active project without removing it from the list. */
  clearActive(): void {
    this.state.activeId = null;
    this.save();
  }

  /** Returns the per-project chats directory and creates it if needed. */
  chatsDir(id: string): string {
    const dir = join(this.dataDir, "projects", id, "chats");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    return dir;
  }
}

export function projectBasename(path: string): string {
  return basename(path);
}

export const PATH_SEP = sep;
