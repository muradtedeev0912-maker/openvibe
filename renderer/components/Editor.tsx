import { Editor as MonacoEditor, loader } from "@monaco-editor/react";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";
import * as monaco from "monaco-editor";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { FileIcon } from "./icons.js";
import { useT } from "../i18n.js";
import { useTheme } from "../theme.js";

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

// Editor themes — match the app palette so the editor blends in seamlessly
// in both light and dark modes.
const THEMES_DEFINED = { current: false };
function ensureThemes(m: typeof monaco): void {
  if (THEMES_DEFINED.current) return;
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
  m.editor.defineTheme("vibe-light", {
    base: "vs",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": "#ececec",
      "editor.foreground": "#1f2024",
      "editorLineNumber.foreground": "#80848d",
      "editorLineNumber.activeForeground": "#1f2024",
      "editor.lineHighlightBackground": "#e2e2e2",
      "editor.selectionBackground": "#bfbfbf",
      "editorCursor.foreground": "#1f2024",
      "editorIndentGuide.background": "#d6d6d6",
      "editorIndentGuide.activeBackground": "#b8b8b8",
      "editorWidget.background": "#e2e2e2",
      "editorWidget.border": "#cdcdcd",
      "scrollbarSlider.background": "#b8b8b855",
      "scrollbarSlider.hoverBackground": "#b8b8b899",
      "scrollbarSlider.activeBackground": "#80848dcc",
    },
  });
  m.editor.defineTheme("vibe-codex", {
    base: "vs-dark",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": "#000000",
      "editor.foreground": "#f5f5f5",
      "editorLineNumber.foreground": "#6b6b6b",
      "editorLineNumber.activeForeground": "#f5f5f5",
      "editor.lineHighlightBackground": "#0a0a0a",
      "editor.selectionBackground": "#262626",
      "editorCursor.foreground": "#ffffff",
      "editorIndentGuide.background": "#141414",
      "editorIndentGuide.activeBackground": "#262626",
      "editorWidget.background": "#0a0a0a",
      "editorWidget.border": "#1a1a1a",
      "scrollbarSlider.background": "#26262655",
      "scrollbarSlider.hoverBackground": "#26262699",
      "scrollbarSlider.activeBackground": "#262626cc",
    },
  });
  THEMES_DEFINED.current = true;
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

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "ico", "avif"]);
const VIDEO_EXTS = new Set(["mp4", "webm", "ogv", "mov"]);
const AUDIO_EXTS = new Set(["mp3", "wav", "ogg", "flac", "m4a"]);

function getMediaKind(path: string): "image" | "video" | "audio" | null {
  const m = /\.([a-zA-Z0-9]+)$/.exec(path);
  if (!m) return null;
  const ext = m[1]!.toLowerCase();
  if (IMAGE_EXTS.has(ext)) return "image";
  if (VIDEO_EXTS.has(ext)) return "video";
  if (AUDIO_EXTS.has(ext)) return "audio";
  return null;
}

interface Props {
  path: string;
  cwd: string;
  onClose: () => void;
  onNavigate?: (folderPath: string) => void;
  openTabs?: string[];
  activeTab?: string | null;
  onSwitchTab?: (path: string) => void;
  onCloseTab?: (path: string) => void;
  onSendToChat?: (context: string) => void;
}

export function Editor({ path, cwd, onClose, onNavigate, openTabs, activeTab, onSwitchTab, onCloseTab, onSendToChat }: Props): React.ReactElement {
  const t = useT();
  const theme = useTheme();
  const [content, setContent] = useState<string | null>(null);
  const [original, setOriginal] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);

  const mediaKind = getMediaKind(path);
  const isMedia = mediaKind !== null;
  const [mediaSrc, setMediaSrc] = useState<string>("");

  useEffect(() => {
    if (!isMedia) {
      setMediaSrc("");
      return;
    }
    let cancelled = false;
    window.vibe.fs.readBinary(path).then((res) => {
      if (cancelled) return;
      if (res.ok) {
        const ext = path.toLowerCase().split(".").pop() || "";
        const mime =
          mediaKind === "image"
            ? ext === "svg" ? "image/svg+xml" : `image/${ext === "jpg" ? "jpeg" : ext}`
            : mediaKind === "video"
              ? `video/${ext === "mov" ? "quicktime" : ext}`
              : `audio/${ext === "m4a" ? "mp4" : ext}`;
        setMediaSrc(`data:${mime};base64,${res.base64}`);
      }
    });
    return () => { cancelled = true; };
  }, [path, isMedia, mediaKind]);

  useEffect(() => {
    let cancelled = false;
    setContent(null);
    setError(null);
    setSavedAt(null);
    if (isMedia) {
      // No text content for media files
      setContent("");
      setOriginal("");
      return;
    }
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
  }, [path, isMedia]);

  // Auto-reload when AI edits the file (real-time updates)
  useEffect(() => {
    const off = window.vibe.onFsChanged(() => {
      window.vibe.fs.read(path).then((res) => {
        if (!res.ok) return;
        // Update editor content if file changed on disk
        const ed = editorRef.current;
        if (ed) {
          const model = ed.getModel();
          const currentValue = model?.getValue() ?? "";
          if (res.content !== currentValue) {
            // Preserve cursor position
            const pos = ed.getPosition();
            model?.setValue(res.content);
            if (pos) ed.setPosition(pos);
            setContent(res.content);
            setOriginal(res.content);
          }
        } else {
          setContent(res.content);
          setOriginal(res.content);
        }
      });
    });
    return off;
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

  // Autosave after 2 seconds of inactivity
  useEffect(() => {
    if (!dirty || saving) return;
    const timer = setTimeout(() => { save(); }, 2000);
    return () => clearTimeout(timer);
  }, [content, dirty, saving, save]);

  // Build breadcrumb segments from relative path (relative to project root)
  const sep = path.includes("\\") ? "\\" : "/";
  const relativePath = path.startsWith(cwd) ? path.slice(cwd.length).replace(/^[\\/]/, "") : path;
  const segments = relativePath.split(/[\\/]/).filter(Boolean);
  const breadcrumbs: { name: string; fullPath: string }[] = [];
  for (let i = 0; i < segments.length; i++) {
    const fullPath = cwd + sep + segments.slice(0, i + 1).join(sep);
    breadcrumbs.push({ name: segments[i]!, fullPath });
  }

  return (
    <div className="editor">
      {openTabs && openTabs.length > 0 ? (
        <div className="editor__tabs">
          {openTabs.map((tab) => (
            <div
              key={tab}
              className={"editor__tab" + (tab === activeTab ? " editor__tab--active" : "")}
              onClick={() => onSwitchTab?.(tab)}
              title={tab}
            >
              <span className="editor__tab-icon"><FileIcon name={basename(tab)} /></span>
              <span className="editor__tab-name">{basename(tab)}</span>
              <button
                className="editor__tab-close"
                onClick={(e) => { e.stopPropagation(); onCloseTab?.(tab); }}
                title={t("editor.close_tab")}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      ) : null}
      <div className="editor__breadcrumb">
        {breadcrumbs.map((seg, i) => (
          <React.Fragment key={i}>
            {i > 0 ? <span className="editor__breadcrumb-sep">›</span> : null}
            <button
              className={"editor__breadcrumb-item" + (i === breadcrumbs.length - 1 ? " editor__breadcrumb-item--active" : "")}
              onClick={() => {
                if (i < breadcrumbs.length - 1 && onNavigate) {
                  onNavigate(seg.fullPath);
                }
              }}
              title={seg.fullPath}
            >
              {seg.name}
            </button>
          </React.Fragment>
        ))}
      </div>
      <div className="editor__header">
        <span className="editor__title" title={path}>
          {basename(path)}
          {dirty ? <span className="editor__dirty"> ●</span> : null}
        </span>
        <div className="editor__actions">
          {onSendToChat ? (
            <span
              className="editor__send-chat"
              draggable
              onDragStart={(e) => {
                const ed = editorRef.current;
                if (!ed) return;
                const sel = ed.getSelection();
                const fileName = basename(path);
                let context = `@${fileName}`;
                if (sel && !sel.isEmpty()) {
                  context = `@${fileName}:${sel.startLineNumber}-${sel.endLineNumber}`;
                }
                e.dataTransfer.setData("text/plain", context);
                e.dataTransfer.effectAllowed = "copy";
              }}
              title={t("editor.send_to_chat")}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
              </svg>
            </span>
          ) : null}
          {savedAt && !dirty ? (
            <span className="editor__saved">{t("editor.saved")}</span>
          ) : null}
          <button
            className="editor__save"
            disabled={!dirty || saving}
            onClick={save}
            title={t("editor.save_tooltip")}
          >
            {saving ? t("editor.saving") : t("editor.save")}
          </button>
        </div>
      </div>
      {error ? <div className="editor__error">{error}</div> : null}
      <div className="editor__body">
        {content === null && !error ? (
          <div className="editor__loading">{t("common.loading")}</div>
        ) : null}
        {isMedia ? (
          <div className="editor__media">
            {mediaKind === "image" ? (
              <img className="editor__media-img" src={mediaSrc} alt={basename(path)} />
            ) : mediaKind === "video" ? (
              <video className="editor__media-video" src={mediaSrc} controls />
            ) : mediaKind === "audio" ? (
              <audio className="editor__media-audio" src={mediaSrc} controls />
            ) : null}
          </div>
        ) : content !== null ? (
          <MonacoEditor
            height="100%"
            theme={theme === "light" ? "vibe-light" : theme === "codex" ? "vibe-codex" : "vibe-dark"}
            language={detectLanguage(path)}
            value={content}
            onChange={(v) => setContent(v ?? "")}
            beforeMount={(m) => ensureThemes(m)}
            onMount={(ed) => {
              editorRef.current = ed;
            }}
            options={{
              fontFamily: '"Geist Mono", ui-monospace, Menlo, Consolas, monospace',
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
