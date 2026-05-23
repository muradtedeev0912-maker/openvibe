import * as nodePty from "node-pty";
import { existsSync } from "node:fs";

type IPty = ReturnType<typeof nodePty.spawn>;

export type ShellKind = "powershell" | "cmd" | "bash";

function pickShell(kind: ShellKind): { file: string; args: string[] } {
  if (kind === "cmd") {
    if (process.platform === "win32") {
      const cmd = `${process.env.SystemRoot ?? "C:\\Windows"}\\System32\\cmd.exe`;
      return { file: cmd, args: [] };
    }
    // Non-windows: cmd.exe doesn't exist. Fall back to bash.
    return { file: process.env.SHELL ?? "/bin/bash", args: [] };
  }

  if (kind === "bash") {
    if (process.platform === "win32") {
      // Try common Git for Windows / WSL bash locations.
      const gitBash = "C:\\Program Files\\Git\\bin\\bash.exe";
      if (existsSync(gitBash)) return { file: gitBash, args: ["--login", "-i"] };
      const gitBash32 = "C:\\Program Files (x86)\\Git\\bin\\bash.exe";
      if (existsSync(gitBash32)) return { file: gitBash32, args: ["--login", "-i"] };
      const wsl = `${process.env.SystemRoot ?? "C:\\Windows"}\\System32\\wsl.exe`;
      if (existsSync(wsl)) return { file: wsl, args: [] };
      // Fall back to PowerShell if no bash is available.
      return pickShell("powershell");
    }
    return { file: "/bin/bash", args: [] };
  }

  // powershell (default)
  if (process.platform === "win32") {
    const pwsh = "C:\\Program Files\\PowerShell\\7\\pwsh.exe";
    if (existsSync(pwsh)) return { file: pwsh, args: ["-NoLogo"] };
    const winps = `${process.env.SystemRoot ?? "C:\\Windows"}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`;
    return { file: winps, args: ["-NoLogo"] };
  }
  // Non-windows: no PowerShell guarantee — use the user's shell.
  return { file: process.env.SHELL ?? "/bin/bash", args: [] };
}

interface Session {
  pty: IPty;
  cwd: string;
}

/** Manages multiple PTY sessions keyed by id. */
export class TerminalManager {
  private sessions = new Map<string, Session>();
  private shell: ShellKind;

  constructor(private defaultCwd: string = process.cwd(), shell: ShellKind = "powershell") {
    this.shell = shell;
  }

  /** Update the shell used for *new* terminals. Existing PTYs are unaffected. */
  setShell(shell: ShellKind): void {
    this.shell = shell;
  }

  getShell(): ShellKind {
    return this.shell;
  }

  start(
    id: string,
    cols: number,
    rows: number,
    onData: (chunk: string) => void,
    onExit: (code: number) => void,
  ): void {
    if (this.sessions.has(id)) return;
    const { file, args } = pickShell(this.shell);
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
