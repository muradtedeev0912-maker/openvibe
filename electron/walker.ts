import { readdir, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const SKIP = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "out",
  ".cache",
  ".turbo",
  "coverage",
  ".vite",
]);

const MAX_FILES = 8000;
const CACHE_TTL = 10_000;

interface CacheEntry {
  files: string[];
  at: number;
}

const cache = new Map<string, CacheEntry>();

async function walk(root: string): Promise<string[]> {
  const out: string[] = [];
  async function go(dir: string): Promise<void> {
    if (out.length >= MAX_FILES) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (out.length >= MAX_FILES) return;
      if (SKIP.has(e.name)) continue;
      if (e.name.startsWith(".") && e.name !== ".env" && e.name !== ".gitignore")
        continue;
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        await go(full);
      } else if (e.isFile()) {
        out.push(full);
      }
    }
  }
  await go(root);
  return out;
}

async function ensureIndex(root: string): Promise<string[]> {
  const cached = cache.get(root);
  if (cached && Date.now() - cached.at < CACHE_TTL) return cached.files;
  const files = await walk(root);
  cache.set(root, { files, at: Date.now() });
  return files;
}

/** Lightweight subsequence/contains scoring for fuzzy matches. */
function score(haystack: string, needle: string): number {
  if (!needle) return 1;
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  // exact substring on basename
  const base = h.split(/[\\/]/).pop()!;
  if (base.includes(n)) return 100 + (base.startsWith(n) ? 50 : 0) - h.length / 1000;
  if (h.includes(n)) return 50 - h.length / 1000;
  // subsequence
  let i = 0;
  for (let j = 0; j < h.length && i < n.length; j++) {
    if (h.charCodeAt(j) === n.charCodeAt(i)) i++;
  }
  if (i === n.length) return 10 - (h.length - n.length) / 1000;
  return -1;
}

export interface FileMatch {
  path: string;
  rel: string;
  name: string;
}

export async function findFiles(
  root: string,
  query: string,
  limit = 30,
): Promise<FileMatch[]> {
  const files = await ensureIndex(root);
  const ranked: Array<{ s: number; path: string }> = [];
  for (const f of files) {
    const rel = relative(root, f);
    const s = score(rel, query);
    if (s > 0) ranked.push({ s, path: f });
  }
  ranked.sort((a, b) => b.s - a.s);
  return ranked.slice(0, limit).map((r) => ({
    path: r.path,
    rel: relative(root, r.path),
    name: r.path.split(sep).pop() ?? r.path,
  }));
}
