import { Editor as MonacoEditor, loader } from "@monaco-editor/react";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";
import * as monaco from "monaco-editor";
import React, { useCallback, useEffect, useRef, useState } from "react";
import "../styles/Editor.css";

// Wire up Monaco workers for Vite (one-time, module scope is fine)
self.MonacoEnvironment = {
  getWorker(_moduleId: string, label: string) {
    if (label === "json") return new jsonWorker();
    if (label === "css" || label === "scss" || label === "less") return new cssWorker();
    if (label === "html" || label === "handlebars" || label === "razor") return new htmlWorker();
    if (label === "typescript" || label === "javascript") return new tsWorker();
    return new editorWorker();
  },
};
loader.config({ monaco });

// Simple dark theme matching the app
const THEME_DEFINED = { current: false };
function ensureTheme(m: typeof monaco): void {
  if (THEME_DEFINED.current) return;
  m.editor.defineTheme("vibe-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": "#161616",
      "editor.foreground": "#e6e6e6",
      "editorLineNumber.foreground": "#555555",
      "editorLineNumber.activeForeground": "#e6e6e6",
      "editor.lineHighlightBackground": "#1c1c1c",
      "editor.selectionBackground": "#3a3a3a",
      "editorCursor.foreground": "#e6e6e6",
      "editorIndentGuide.background": "#222222",
      "editorIndentGuide.activeBackground": "#3a3a3a",
      "editorWidget.background": "#1c1c1c",
      "editorWidget.border": "#2a2a2a",
      "scrollbarSlider.background": "#3a3a3a55",
      "scrollbarSlider.hoverBackground": "#3a3a3a99",
      "scrollbarSlider.activeBackground": "#3a3a3acc",
    },
  });
  THEME_DEFINED.current = true;
}

const LANG_MAP: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  json: "json",
  jsonc: "json",
  md: "markdown",
  markdown: "markdown",
  html: "html",
  htm: "html",
  css: "css",
  scss: "scss",
  less: "less",
  py: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  hpp: "cpp",
  cs: "csharp",
  php: "php",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  ps1: "powershell",
  yaml: "yaml",
  yml: "yaml",
  toml: "ini",
  ini: "ini",
  xml: "xml",
  sql: "sql",
};

function detectLanguage(path: string): string {
  const m = /\.([a-zA-Z0-9]+)$/.exec(path);
  if (!m) return "plaintext";
  return LANG_MAP[m[1]!.toLowerCase()] ?? "plaintext";
}

function basename(path: string): string {
  const m = /[\\/]([^\\/]+)$/.exec(path);
  return m?.[1] ?? path;
}

interface Props {
  path: string;
  onClose: () => void;
}

export function Editor({ path, onClose }: Props): React.ReactElement {
  const [content, setContent] = useState<string | null>(null);
  const [original, setOriginal] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);

  useEffect(() => {
    let cancelled = false;
    setContent(null);
    setError(null);
    setSavedAt(null);
    window.vibe.fs.read(path).then((res) => {
      if (cancelled) return;
      if (!res.ok) setError(res.error);
      else {
        setContent(res.content);
        setOriginal(res.content);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [path]);

  const dirty = content !== null && content !== original;

  const save = useCallback(async () => {
    if (content === null || saving || !dirty) return;
    setSaving(true);
    const res = await window.vibe.fs.write(path, content);
    setSaving(false);
    if (!res.ok) setError(res.error);
    else {
      setOriginal(content);
      setSavedAt(Date.now());
    }
  }, [content, dirty, path, saving]);

  // Ctrl/Cmd+S
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        save();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  return (
    <div className="editor">
      <div className="editor__header">
        <span className="editor__title" title={path}>
          {basename(path)}
          {dirty ? <span className="editor__dirty"> ●</span> : null}
        </span>
        <span className="editor__path">{path}</span>
        <div className="editor__actions">
          {savedAt && !dirty ? (
            <span className="editor__saved">saved</span>
          ) : null}
          <button
            className="editor__save"
            disabled={!dirty || saving}
            onClick={save}
            title="Save (Ctrl+S)"
          >
            {saving ? "saving…" : "save"}
          </button>
          <button className="editor__close" onClick={onClose} title="Close">
            ×
          </button>
        </div>
      </div>
      {error ? <div className="editor__error">{error}</div> : null}
      <div className="editor__body">
        {content === null && !error ? (
          <div className="editor__loading">loading…</div>
        ) : null}
        {content !== null ? (
          <MonacoEditor
            height="100%"
            theme="vibe-dark"
            language={detectLanguage(path)}
            value={content}
            onChange={(v) => setContent(v ?? "")}
            beforeMount={(m) => ensureTheme(m)}
            onMount={(ed) => {
              editorRef.current = ed;
            }}
            options={{
              fontFamily: '"JetBrains Mono", ui-monospace, Menlo, Consolas, monospace',
              fontSize: 13,
              fontLigatures: true,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              renderLineHighlight: "line",
              smoothScrolling: true,
              cursorBlinking: "smooth",
              automaticLayout: true,
              tabSize: 2,
              wordWrap: "on",
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
