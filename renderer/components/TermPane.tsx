import { FitAddon } from "@xterm/addon-fit";
import { Terminal as XTerm } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import React, { useEffect, useRef } from "react";
import { useTheme } from "../theme.js";

interface Props {
  id: string;
  visible: boolean;
}

const DARK_THEME = {
  background: "#161616",
  foreground: "#e6e6e6",
  cursor: "#e6e6e6",
  cursorAccent: "#161616",
  selectionBackground: "#3a3a3a",
  black: "#161616",
  brightBlack: "#555555",
  white: "#e6e6e6",
  brightWhite: "#ffffff",
  red: "#f87171",
  brightRed: "#f87171",
  green: "#86efac",
  brightGreen: "#86efac",
  yellow: "#fbbf24",
  brightYellow: "#fbbf24",
  blue: "#7dd3fc",
  brightBlue: "#7dd3fc",
  magenta: "#c084fc",
  brightMagenta: "#c084fc",
  cyan: "#67e8f9",
  brightCyan: "#67e8f9",
};

const LIGHT_THEME = {
  background: "#ececec",
  foreground: "#1f2024",
  cursor: "#1f2024",
  cursorAccent: "#ececec",
  selectionBackground: "#bfbfbf",
  black: "#1f2024",
  brightBlack: "#4a4d54",
  white: "#1f2024",
  brightWhite: "#000000",
  red: "#dc2626",
  brightRed: "#b91c1c",
  green: "#16a34a",
  brightGreen: "#15803d",
  yellow: "#ca8a04",
  brightYellow: "#a16207",
  blue: "#2563eb",
  brightBlue: "#1d4ed8",
  magenta: "#7c3aed",
  brightMagenta: "#6d28d9",
  cyan: "#0891b2",
  brightCyan: "#0e7490",
};

export function TermPane({ id, visible }: Props): React.ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const theme = useTheme();

  // Mount xterm + start PTY once per pane
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const term = new XTerm({
      fontFamily: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      fontSize: 13,
      cursorBlink: true,
      cursorStyle: "block",
      allowProposedApi: true,
      scrollback: 5000,
      theme: theme === "light" ? LIGHT_THEME : DARK_THEME,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);
    try {
      fit.fit();
    } catch {
      // not laid out yet, will fit when visible
    }
    termRef.current = term;
    fitRef.current = fit;

    const inputDisp = term.onData((data) => {
      window.vibe.term.write(id, data);
    });
    const offData = window.vibe.term.onData((p) => {
      if (p.id === id) term.write(p.chunk);
    });
    const offExit = window.vibe.term.onExit((p) => {
      if (p.id !== id) return;
      term.writeln(`\r\n\x1b[2m[shell exited with code ${p.code}]\x1b[0m`);
    });

    window.vibe.term.start(id, term.cols, term.rows);

    const resize = (): void => {
      if (!termRef.current || !fitRef.current) return;
      try {
        fitRef.current.fit();
      } catch {
        // ignore
      }
      window.vibe.term.resize(id, termRef.current.cols, termRef.current.rows);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    window.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);
      ro.disconnect();
      inputDisp.dispose();
      offData();
      offExit();
      window.vibe.term.kill(id);
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [id]);

  // Update terminal theme when the app theme changes (without remounting)
  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.theme = theme === "light" ? LIGHT_THEME : DARK_THEME;
    }
  }, [theme]);

  // Refit and focus when becoming visible
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => {
      try {
        fitRef.current?.fit();
        const t = termRef.current;
        if (t) {
          window.vibe.term.resize(id, t.cols, t.rows);
          t.focus();
        }
      } catch {
        // ignore
      }
    }, 0);
    return () => clearTimeout(t);
  }, [visible, id]);

  return (
    <div
      className="termpane"
      style={{ display: visible ? "flex" : "none" }}
    >
      <div className="termpane__xterm" ref={containerRef} />
    </div>
  );
}
