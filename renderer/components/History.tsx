import React, { useEffect, useMemo, useRef } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { marked } from "marked";

export interface AttachmentView {
  id: string;
  kind: "file" | "image";
  name: string;
  path?: string;
  dataUrl?: string;
}

export interface HistoryItem {
  id: string;
  kind: "user" | "assistant" | "tool" | "info" | "error" | "model-picker";
  text: string;
  toolName?: string;
  toolArgs?: unknown;
  ok?: boolean;
  attachments?: AttachmentView[];
  models?: Array<{ id: string; name: string }>;
  currentModel?: string;
}

function formatArgs(args: unknown): string {
  try {
    const s = JSON.stringify(args);
    return s.length > 200 ? s.slice(0, 200) + "…" : s;
  } catch {
    return "";
  }
}

interface FileBadgeInfo {
  name: string;
  ext: string;
  cls: string;
}

const EXT_COLORS: Record<string, string> = {
  ts: "ts",
  tsx: "ts",
  js: "js",
  jsx: "js",
  mjs: "js",
  cjs: "js",
  json: "json",
  md: "md",
  py: "py",
  rs: "rs",
  go: "go",
  java: "java",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  hpp: "cpp",
  cs: "cs",
  rb: "rb",
  php: "php",
  html: "html",
  htm: "html",
  css: "css",
  scss: "css",
  sh: "sh",
  bash: "sh",
  ps1: "sh",
  yaml: "yaml",
  yml: "yaml",
  toml: "ini",
  ini: "ini",
  xml: "xml",
  sql: "sql",
};

function basename(p: string): string {
  const m = /[\\/]([^\\/]+)$/.exec(p);
  return m?.[1] ?? p;
}

function pickFile(args: unknown): FileBadgeInfo | null {
  if (!args || typeof args !== "object") return null;
  const a = args as Record<string, unknown>;
  const raw =
    typeof a.path === "string"
      ? a.path
      : typeof a.file === "string"
        ? a.file
        : null;
  if (!raw) return null;
  const name = basename(raw);
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
  return { name, ext, cls: EXT_COLORS[ext] ?? "" };
}

function describe(item: HistoryItem): { verb: string; file: FileBadgeInfo | null; suffix: string } {
  const file = pickFile(item.toolArgs);
  switch (item.toolName) {
    case "read_file":
      return { verb: "Read", file, suffix: "" };
    case "write_file":
      return {
        verb: item.ok === false ? "Failed to write" : "Created",
        file,
        suffix: "",
      };
    case "edit_file":
      return {
        verb: item.ok === false ? "Failed to edit" : "Edited",
        file,
        suffix: "",
      };
    case "list_dir": {
      const args = item.toolArgs as { path?: string } | undefined;
      const path = args?.path ?? ".";
      return {
        verb: "Listed",
        file: { name: basename(path) || path, ext: "", cls: "dir" },
        suffix: "",
      };
    }
    case "create_dir": {
      const args = item.toolArgs as { path?: string } | undefined;
      const path = args?.path ?? "";
      return {
        verb: "Created",
        file: { name: basename(path) || path, ext: "", cls: "dir" },
        suffix: "",
      };
    }
    case "grep": {
      const args = item.toolArgs as { pattern?: string } | undefined;
      return {
        verb: "Searched",
        file: null,
        suffix: args?.pattern ? `"${args.pattern}"` : "",
      };
    }
    case "bash": {
      const args = item.toolArgs as { command?: string } | undefined;
      return {
        verb: "Ran",
        file: null,
        suffix: args?.command ?? "",
      };
    }
    case "web_search": {
      const args = item.toolArgs as { query?: string } | undefined;
      return {
        verb: "Searched web",
        file: null,
        suffix: args?.query ? `"${args.query}"` : "",
      };
    }
    default:
      return { verb: item.toolName ?? "Tool", file, suffix: "" };
  }
}

function FileBadge({ info }: { info: FileBadgeInfo }): React.ReactElement {
  const iconFile = info.ext ? ICON_MAP_HISTORY[info.ext] : null;
  return (
    <span className="fbadge">
      {iconFile ? (
        <img className="fbadge__icon" src={`./img/${iconFile}`} alt="" draggable={false} />
      ) : info.cls === "dir" ? (
        <img className="fbadge__icon" src="./floder/folder.svg" alt="" draggable={false} />
      ) : (
        <span className="fbadge__generic">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="#888" strokeWidth="1.3" strokeLinejoin="round">
            <path d="M3 1.5h6.5L13 5v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V2.5a1 1 0 0 1 1-1z" />
            <path d="M9.5 1.5V5h3.5" fill="none" />
          </svg>
        </span>
      )}
      <span className="fbadge__name">{info.name}</span>
    </span>
  );
}

const ICON_MAP_HISTORY: Record<string, string> = {
  ts: "ts.svg",
  tsx: "react-ts.svg",
  js: "js.svg",
  jsx: "react.svg",
  mjs: "js.svg",
  cjs: "js.svg",
  py: "python.svg",
  pyw: "python.svg",
  c: "c.svg",
  h: "h.svg",
  cpp: "cplus.svg",
  cc: "cplus.svg",
  cxx: "cplus.svg",
  hpp: "cplus.svg",
  cs: "csharp.svg",
  css: "code-blue.svg",
  scss: "sass.svg",
  less: "code-purple.svg",
  html: "code-orange.svg",
  htm: "code-orange.svg",
  php: "php.svg",
  ps1: "shell.svg",
  psm1: "shell.svg",
  json: "brackets-yellow.svg",
  yaml: "yaml.svg",
  yml: "yaml.svg",
  md: "markdown.svg",
  rs: "rust.svg",
  go: "go.svg",
  java: "java.svg",
  kt: "kotlin.svg",
  rb: "ruby.svg",
  swift: "swift.svg",
  dart: "dart.svg",
  sh: "shell.svg",
  bash: "shell.svg",
  sql: "database.svg",
  png: "image.svg",
  jpg: "image.svg",
  jpeg: "image.svg",
  gif: "gif.svg",
  webp: "image.svg",
  bmp: "image.svg",
  svg: "svg.svg",
  ico: "image.svg",
  toml: "gear.svg",
  ini: "gear.svg",
  xml: "xml.svg",
  vue: "vue.svg",
  svelte: "svelte.svg",
  astro: "astro.svg",
};

function CheckIcon(): React.ReactElement {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="8" cy="8" r="6.5" />
      <path d="M5 8.5l2 2 4-4.5" />
    </svg>
  );
}

function FailIcon(): React.ReactElement {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="8" cy="8" r="6.5" />
      <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" />
    </svg>
  );
}

function SpinIcon(): React.ReactElement {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden
      className="tool__spinner"
    >
      <circle cx="8" cy="8" r="6.5" opacity="0.25" />
      <path d="M14.5 8a6.5 6.5 0 0 0-6.5-6.5" strokeLinecap="round" />
    </svg>
  );
}

function ToolBlock({ item, onShowTerminal, onOpenFile }: { item: HistoryItem; onShowTerminal?: () => void; onOpenFile?: (path: string) => void }): React.ReactElement {
  const { verb, file, suffix } = describe(item);
  const [expanded, setExpanded] = React.useState(false);
  const [reverted, setReverted] = React.useState(false);
  const hasOutput = !!item.text;
  const isEdit = item.toolName === "edit_file";
  const isWrite = item.toolName === "write_file";
  const editArgs = isEdit ? (item.toolArgs as { old_str?: string; new_str?: string; path?: string } | undefined) : null;
  const writeArgs = isWrite ? (item.toolArgs as { path?: string; content?: string } | undefined) : null;
  const hasDiff = isEdit && editArgs?.old_str != null && editArgs?.new_str != null;
  const canRevert = (hasDiff || isWrite) && item.ok === true && !reverted;
  const canExpand = hasOutput || hasDiff;
  const stateCls =
    item.ok === undefined
      ? "tool--pending"
      : item.ok
        ? "tool--ok"
        : "tool--err";

  async function handleRevert(): Promise<void> {
    if (isEdit && editArgs?.path && editArgs.old_str != null && editArgs.new_str != null) {
      // Read current file, replace new_str back with old_str
      const readRes = await window.vibe.fs.read(editArgs.path);
      if (!readRes.ok) return;
      const content = readRes.content.replace(editArgs.new_str, editArgs.old_str);
      const writeRes = await window.vibe.fs.write(editArgs.path, content);
      if (writeRes.ok) setReverted(true);
    } else if (isWrite && writeArgs?.path) {
      // Delete the created file
      const res = await window.vibe.fs.delete(writeArgs.path);
      if (res.ok) setReverted(true);
    }
  }

  return (
    <div className="tool-wrap">
      <div className={`tool ${stateCls}${reverted ? " tool--reverted" : ""}`} onClick={() => canExpand && setExpanded(!expanded)} style={canExpand ? { cursor: "pointer" } : undefined}>
        <span className="tool__icon">
          {item.ok === undefined ? (
            <SpinIcon />
          ) : item.ok ? (
            <CheckIcon />
          ) : (
            <FailIcon />
          )}
        </span>
        <span className="tool__line">
          <span className="tool__verb">{reverted ? `${verb} (reverted)` : verb}</span>
          {file ? (
            <>
              {" "}
              <span className="tool__file-link" onClick={(e) => {
                e.stopPropagation();
                const args = item.toolArgs as Record<string, unknown> | undefined;
                const fp = (args?.path ?? args?.file) as string | undefined;
                if (fp && onOpenFile) onOpenFile(fp);
              }}>
                <FileBadge info={file} />
              </span>
            </>
          ) : null}
          {suffix ? <span className="tool__suffix"> {suffix}</span> : null}
        </span>
        {canRevert ? (
          <button
            className="tool__revert"
            onClick={(e) => { e.stopPropagation(); handleRevert(); }}
            title="Revert changes"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1 4 1 10 7 10"/>
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
            </svg>
          </button>
        ) : null}
        {canExpand ? (
          <span className={"tool__chevron" + (expanded ? " tool__chevron--open" : "")}>›</span>
        ) : null}
      </div>
      {expanded && hasDiff ? (
        <DiffView oldStr={editArgs!.old_str!} newStr={editArgs!.new_str!} />
      ) : expanded && item.text ? (
        <pre className="tool__output">{item.text}</pre>
      ) : null}
    </div>
  );
}

function DiffView({ oldStr, newStr }: { oldStr: string; newStr: string }): React.ReactElement {
  const oldLines = oldStr.split("\n");
  const newLines = newStr.split("\n");

  return (
    <div className="tool__diff">
      {oldLines.length > 0 ? (
        <div className="tool__diff-section">
          {oldLines.map((line, i) => (
            <div key={`old-${i}`} className="tool__diff-line tool__diff-line--removed">
              <span className="tool__diff-num">{i + 1}</span>
              <span className="tool__diff-sign">−</span>
              <span className="tool__diff-text">{line || " "}</span>
            </div>
          ))}
        </div>
      ) : null}
      {newLines.length > 0 ? (
        <div className="tool__diff-section">
          {newLines.map((line, i) => (
            <div key={`new-${i}`} className="tool__diff-line tool__diff-line--added">
              <span className="tool__diff-num">{i + 1}</span>
              <span className="tool__diff-sign">+</span>
              <span className="tool__diff-text">{line || " "}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Renders text with LaTeX math and full Markdown formatting */
function FormattedText({ text }: { text: string }): React.ReactElement {
  const html = useMemo(() => {
    let input = text;

    // Protect LaTeX blocks from Markdown parser by replacing with placeholders
    const mathBlocks: string[] = [];
    const mathInlines: string[] = [];

    // Display math: \[ ... \] or $$ ... $$
    input = input.replace(/\\\[([\s\S]*?)\\\]/g, (_m, math) => {
      const idx = mathBlocks.length;
      try {
        mathBlocks.push(`<div class="math-block">${katex.renderToString(math.trim(), { displayMode: true, throwOnError: false })}</div>`);
      } catch { mathBlocks.push(`<div class="math-block">${math}</div>`); }
      return `%%MATHBLOCK${idx}%%`;
    });
    input = input.replace(/\$\$([\s\S]*?)\$\$/g, (_m, math) => {
      const idx = mathBlocks.length;
      try {
        mathBlocks.push(`<div class="math-block">${katex.renderToString(math.trim(), { displayMode: true, throwOnError: false })}</div>`);
      } catch { mathBlocks.push(`<div class="math-block">${math}</div>`); }
      return `%%MATHBLOCK${idx}%%`;
    });

    // Inline math: \( ... \) or $ ... $
    input = input.replace(/\\\((.*?)\\\)/g, (_m, math) => {
      const idx = mathInlines.length;
      try {
        mathInlines.push(katex.renderToString(math.trim(), { displayMode: false, throwOnError: false }));
      } catch { mathInlines.push(math); }
      return `%%MATHINLINE${idx}%%`;
    });
    input = input.replace(/(?<!\$)\$(?!\$)(.+?)(?<!\$)\$(?!\$)/g, (_m, math) => {
      const idx = mathInlines.length;
      try {
        mathInlines.push(katex.renderToString(math.trim(), { displayMode: false, throwOnError: false }));
      } catch { mathInlines.push(math); }
      return `%%MATHINLINE${idx}%%`;
    });

    // Parse Markdown
    let result = marked.parse(input, { async: false, breaks: true }) as string;

    // Restore LaTeX placeholders
    result = result.replace(/%%MATHBLOCK(\d+)%%/g, (_m, idx) => mathBlocks[Number(idx)] ?? "");
    result = result.replace(/%%MATHINLINE(\d+)%%/g, (_m, idx) => mathInlines[Number(idx)] ?? "");

    return result;
  }, [text]);

  return <div className="msg__md" dangerouslySetInnerHTML={{ __html: html }} />;
}

interface Props {
  items: HistoryItem[];
  onPickModel?: (id: string) => void;
  streamingId?: string | null;
  onShowTerminal?: () => void;
  onOpenFile?: (path: string) => void;
}

export function History({ items, onPickModel, streamingId, onShowTerminal, onOpenFile }: Props): React.ReactElement {
  const ref = useRef<HTMLDivElement | null>(null);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  function showCopied(id: string): void {
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // auto-scroll only if user is already near the bottom
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [items]);

  return (
    <div className="history" ref={ref}>
      {items.map((item) => {
        if (item.kind === "tool") return <ToolBlock key={item.id} item={item} onShowTerminal={onShowTerminal} onOpenFile={onOpenFile} />;
        if (item.kind === "model-picker" && item.models) {
          return (
            <div key={item.id} className="modelpicker">
              <div className="modelpicker__title">Select a model:</div>
              {item.models.map((m) => (
                <button
                  key={m.id}
                  className={
                    "modelpicker__item" +
                    (m.id === item.currentModel ? " modelpicker__item--active" : "")
                  }
                  onClick={() => onPickModel?.(m.id)}
                >
                  <span className="modelpicker__name">{m.name}</span>
                  <span className="modelpicker__id">{m.id}</span>
                  <span className="modelpicker__check">✓</span>
                </button>
              ))}
            </div>
          );
        }
        if (item.kind === "user") {
          return (
            <div key={item.id} className="msg msg--user-wrap">
              <div className="msg msg--user">{item.text}</div>
              {item.attachments && item.attachments.length > 0 ? (
                <div className="msg__attachments">
                  {item.attachments.map((a) =>
                    a.kind === "image" && a.dataUrl ? (
                      <img
                        key={a.id}
                        className="msg__image"
                        src={a.dataUrl}
                        alt={a.name}
                        title={a.name}
                      />
                    ) : (
                      <span
                        key={a.id}
                        className="msg__file"
                        title={a.path ?? a.name}
                      >
                        <span className="msg__file-icon">⌘</span>
                        {a.name}
                      </span>
                    ),
                  )}
                </div>
              ) : null}
            </div>
          );
        }
        const cls = `msg msg--${item.kind}`;
        if (item.kind === "assistant") {
          return (
            <div key={item.id} className={cls} onClick={() => {
              navigator.clipboard.writeText(item.text);
              showCopied(item.id);
            }} title="Click to copy">
              <FormattedText text={item.text} />
              {item.id === streamingId ? (
                <span className="msg__cursor" />
              ) : null}
              {copiedId === item.id ? <span className="msg__copied">copied</span> : null}
            </div>
          );
        }
        return (
          <div key={item.id} className={cls}>
            {item.text}
          </div>
        );
      })}
    </div>
  );
}
