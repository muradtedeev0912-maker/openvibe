import { spawn } from "node:child_process";
import {
  readFile,
  writeFile,
  readdir,
  stat,
  mkdir,
  access,
} from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import type { Config, Tool } from "./types.js";

const MAX_FILE_BYTES = 256 * 1024; // 256 KB read cap
const MAX_OUTPUT_CHARS = 16_000; // shell output cap

function resolveInsideCwd(config: Config, p: string): string {
  const abs = isAbsolute(p) ? p : resolve(config.cwd, p);
  const rel = relative(config.cwd, abs);
  if (rel.startsWith("..")) {
    throw new Error(`Path escapes workspace: ${p}`);
  }
  return abs;
}

function clip(text: string, max = MAX_OUTPUT_CHARS): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + `\n…[truncated, ${text.length - max} more chars]`;
}

export function buildTools(config: Config): Tool[] {
  const readFileTool: Tool = {
    requiresConfirmation: false,
    definition: {
      type: "function",
      function: {
        name: "read_file",
        description: "Read a UTF-8 text file from the workspace.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "Relative or absolute path." },
          },
          required: ["path"],
        },
      },
    },
    run: async (args) => {
      const p = String(args.path ?? "");
      const abs = resolveInsideCwd(config, p);
      const s = await stat(abs);
      if (s.size > MAX_FILE_BYTES) {
        return `File too large (${s.size} bytes, max ${MAX_FILE_BYTES}).`;
      }
      const content = await readFile(abs, "utf8");
      return clip(content);
    },
  };

  const writeFileTool: Tool = {
    requiresConfirmation: false,
    definition: {
      type: "function",
      function: {
        name: "write_file",
        description:
          "Create or overwrite a file with the given content. Creates parent dirs.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string" },
            content: { type: "string" },
          },
          required: ["path", "content"],
        },
      },
    },
    run: async (args) => {
      const p = String(args.path ?? "");
      const content = String(args.content ?? "");
      const abs = resolveInsideCwd(config, p);
      let previousContent: string | null = null;
      try {
        await access(abs);
        previousContent = await readFile(abs, "utf8");
      } catch { /* file doesn't exist yet */ }
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, content, "utf8");
      return JSON.stringify({ msg: `Wrote ${content.length} chars to ${p}`, previousContent });
    },
  };

  const editFileTool: Tool = {
    requiresConfirmation: false,
    definition: {
      type: "function",
      function: {
        name: "edit_file",
        description:
          "Replace the first exact occurrence of old_str with new_str in a file. old_str must be unique.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string" },
            old_str: { type: "string" },
            new_str: { type: "string" },
          },
          required: ["path", "old_str", "new_str"],
        },
      },
    },
    run: async (args) => {
      const p = String(args.path ?? "");
      const oldStr = String(args.old_str ?? "");
      const newStr = String(args.new_str ?? "");
      const abs = resolveInsideCwd(config, p);
      const original = await readFile(abs, "utf8");
      const first = original.indexOf(oldStr);
      if (first === -1) return `old_str not found in ${p}`;
      if (original.indexOf(oldStr, first + 1) !== -1) {
        return `old_str is not unique in ${p}; provide more context.`;
      }
      const updated =
        original.slice(0, first) + newStr + original.slice(first + oldStr.length);
      await writeFile(abs, updated, "utf8");
      return `Edited ${p}`;
    },
  };

  const listDirTool: Tool = {
    requiresConfirmation: false,
    definition: {
      type: "function",
      function: {
        name: "list_dir",
        description: "List entries in a directory (non-recursive).",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "Defaults to '.'" },
          },
        },
      },
    },
    run: async (args) => {
      const p = String(args.path ?? ".");
      const abs = resolveInsideCwd(config, p);
      const entries = await readdir(abs, { withFileTypes: true });
      const lines = entries.map((e) => (e.isDirectory() ? `${e.name}/` : e.name));
      return lines.sort().join("\n") || "(empty)";
    },
  };

  const bashTool: Tool = {
    requiresConfirmation: false,
    definition: {
      type: "function",
      function: {
        name: "bash",
        description:
          "Run a shell command in the workspace. Output (stdout+stderr) is returned.",
        parameters: {
          type: "object",
          properties: {
            command: { type: "string" },
            timeout_ms: {
              type: "number",
              description: "Optional timeout, defaults to 60000.",
            },
          },
          required: ["command"],
        },
      },
    },
    run: (args) =>
      new Promise<string>((resolvePromise) => {
        const cmd = String(args.command ?? "");
        const timeout = Number(args.timeout_ms ?? 60_000);
        const isWin = process.platform === "win32";
        const shell = isWin ? "cmd.exe" : "/bin/sh";
        const shellArgs = isWin ? ["/d", "/s", "/c", cmd] : ["-c", cmd];
        const child = spawn(shell, shellArgs, { cwd: config.cwd });

        let out = "";
        let killed = false;
        const timer = setTimeout(() => {
          killed = true;
          child.kill();
        }, timeout);

        child.stdout.on("data", (d) => (out += d.toString()));
        child.stderr.on("data", (d) => (out += d.toString()));
        child.on("close", (code) => {
          clearTimeout(timer);
          const status = killed
            ? `\n[killed after ${timeout}ms]`
            : `\n[exit ${code ?? 0}]`;
          resolvePromise(clip(out + status));
        });
        child.on("error", (err) => {
          clearTimeout(timer);
          resolvePromise(`Failed to spawn: ${err.message}`);
        });
      }),
  };

  const grepTool: Tool = {
    requiresConfirmation: false,
    definition: {
      type: "function",
      function: {
        name: "grep",
        description:
          "Search files for a regex pattern. Returns matching lines with file:line prefix.",
        parameters: {
          type: "object",
          properties: {
            pattern: { type: "string" },
            path: { type: "string", description: "Directory to search, defaults to '.'" },
            max_results: { type: "number" },
          },
          required: ["pattern"],
        },
      },
    },
    run: async (args) => {
      const pattern = String(args.pattern ?? "");
      const root = resolveInsideCwd(config, String(args.path ?? "."));
      const max = Number(args.max_results ?? 200);
      const re = new RegExp(pattern);
      const skip = new Set([
        "node_modules",
        ".git",
        "dist",
        "build",
        ".next",
        "out",
      ]);
      const results: string[] = [];

      async function walk(dir: string): Promise<void> {
        if (results.length >= max) return;
        const entries = await readdir(dir, { withFileTypes: true });
        for (const e of entries) {
          if (results.length >= max) return;
          if (skip.has(e.name)) continue;
          const full = resolve(dir, e.name);
          if (e.isDirectory()) {
            await walk(full);
          } else if (e.isFile()) {
            try {
              const s = await stat(full);
              if (s.size > MAX_FILE_BYTES) continue;
              const text = await readFile(full, "utf8");
              const lines = text.split(/\r?\n/);
              for (let i = 0; i < lines.length; i++) {
                if (re.test(lines[i]!)) {
                  results.push(
                    `${relative(config.cwd, full)}:${i + 1}: ${lines[i]}`,
                  );
                  if (results.length >= max) break;
                }
              }
            } catch {
              // binary or unreadable, skip
            }
          }
        }
      }

      await walk(root);
      return results.length ? clip(results.join("\n")) : "(no matches)";
    },
  };

  const createDirTool: Tool = {
    requiresConfirmation: false,
    definition: {
      type: "function",
      function: {
        name: "create_dir",
        description: "Create a directory (and parent directories if needed).",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "Directory path to create, relative to cwd." },
          },
          required: ["path"],
        },
      },
    },
    run: async (args) => {
      const target = resolveInsideCwd(config, String(args.path ?? ""));
      await mkdir(target, { recursive: true });
      return `Created directory: ${args.path}`;
    },
  };

  const webSearchTool: Tool = {
    requiresConfirmation: false,
    definition: {
      type: "function",
      function: {
        name: "web_search",
        description: "Search the web using DuckDuckGo. Returns top results with titles, URLs, and snippets. Use when you need current information, documentation, or answers not in the project.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query" },
            max_results: { type: "number", description: "Max results to return (default 5)" },
          },
          required: ["query"],
        },
      },
    },
    run: async (args) => {
      const query = String(args.query ?? "");
      const max = Number(args.max_results ?? 5);
      if (!query) return "No query provided";
      try {
        const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
        const res = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; openvibe/0.2)" },
        });
        const html = await res.text();
        // Parse results from DDG HTML
        const results: string[] = [];
        const regex = /<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>(.*?)<\/a>/gi;
        let match;
        while ((match = regex.exec(html)) !== null && results.length < max) {
          const href = match[1]?.replace(/\/\/duckduckgo\.com\/l\/\?uddg=/, "").split("&")[0];
          const title = match[2]?.replace(/<[^>]*>/g, "").trim();
          const snippet = match[3]?.replace(/<[^>]*>/g, "").trim();
          if (href && title) {
            const decodedUrl = decodeURIComponent(href ?? "");
            results.push(`${title}\n${decodedUrl}\n${snippet ?? ""}\n`);
          }
        }
        if (results.length === 0) return "No results found.";
        return results.join("\n---\n");
      } catch (err) {
        return `Search failed: ${(err as Error).message}`;
      }
    },
  };

  return [readFileTool, writeFileTool, editFileTool, listDirTool, bashTool, grepTool, createDirTool, webSearchTool];
}
