import * as nodePty from "node-pty";
import { existsSync } from "node:fs";

type IPty = ReturnType<typeof nodePty.spawn>;

function pickShell(): { file: string; args: string[] } {
  if (process.platform === "win32") {
    const pwsh = "C:\\Program Files\\PowerShell\\7\\pwsh.exe";
    if (existsSync(pwsh)) return { file: pwsh, args: ["-NoLogo"] };
    const winps = `${process.env.SystemRoot ?? "C:\\Windows"}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`;
    return { file: winps, args: ["-NoLogo"] };
  }
  return { file: process.env.SHELL ?? "/bin/bash", args: [] };
}

interface Session {
  pty: IPty;
  cwd: string;
}

/** Manages multiple PTY sessions keyed by id. */
export class TerminalManager {
  private sessions = new Map<string, Session>();

  constructor(private defaultCwd: string = process.cwd()) {}

  start(
    id: string,
    cols: number,
    rows: number,
    onData: (chunk: string) => void,
    onExit: (code: number) => void,
  ): void {
    if (this.sessions.has(id)) return;
    const { file, args } = pickShell();
    const pty = nodePty.spawn(file, args, {
      name: "xterm-256color",
      cols: Math.max(20, cols),
      rows: Math.max(5, rows),
      cwd: this.defaultCwd,
      env: process.env as Record<string, string>,
    });
    pty.onData(onData);
    pty.onExit(({ exitCode }) => {
      this.sessions.delete(id);
      onExit(exitCode);
    });
    this.sessions.set(id, { pty, cwd: this.defaultCwd });
  }

  write(id: string, data: string): void {
    this.sessions.get(id)?.pty.write(data);
  }

  resize(id: string, cols: number, rows: number): void {
    const s = this.sessions.get(id);
    if (!s) return;
    try {
      s.pty.resize(Math.max(20, cols), Math.max(5, rows));
    } catch {
      // pty may have just exited
    }
  }

  kill(id: string): void {
    const s = this.sessions.get(id);
    if (!s) return;
    try {
      s.pty.kill();
    } catch {
      // ignore
    }
    this.sessions.delete(id);
  }

  killAll(): void {
    for (const id of [...this.sessions.keys()]) this.kill(id);
  }
}
