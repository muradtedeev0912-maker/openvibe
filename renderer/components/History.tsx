import React, { useEffect, useRef } from "react";

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
        <span className="fbadge__dir">📁</span>
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
  ts: "js.png",
  tsx: "js.png",
  js: "js.png",
  jsx: "js.png",
  mjs: "js.png",
  cjs: "js.png",
  py: "py.png",
  pyw: "py.png",
  c: "c.png",
  h: "c.png",
  cpp: "c++.png",
  cc: "c++.png",
  cxx: "c++.png",
  hpp: "c++.png",
  cs: "c#.png",
  css: "css.png",
  scss: "css.png",
  less: "css.png",
  html: "html.png",
  htm: "html.png",
  php: "php.png",
  ps1: "ps1.png",
  psm1: "ps1.png",
  png: "image.png",
  jpg: "image.png",
  jpeg: "image.png",
  gif: "image.png",
  webp: "image.png",
  bmp: "image.png",
  svg: "image.png",
  ico: "image.png",
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

function ToolBlock({ item }: { item: HistoryItem }): React.ReactElement {
  const { verb, file, suffix } = describe(item);
  const stateCls =
    item.ok === undefined
      ? "tool--pending"
      : item.ok
        ? "tool--ok"
        : "tool--err";

  return (
    <div className={`tool ${stateCls}`}>
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
        <span className="tool__verb">{verb}</span>
        {file ? (
          <>
            {" "}
            <FileBadge info={file} />
          </>
        ) : null}
        {suffix ? <span className="tool__suffix"> {suffix}</span> : null}
      </span>
    </div>
  );
}

interface Props {
  items: HistoryItem[];
  onPickModel?: (id: string) => void;
  streamingId?: string | null;
}

export function History({ items, onPickModel, streamingId }: Props): React.ReactElement {
  const ref = useRef<HTMLDivElement | null>(null);

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
        if (item.kind === "tool") return <ToolBlock key={item.id} item={item} />;
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
                  {m.id === item.currentModel ? (
                    <span className="modelpicker__check">✓</span>
                  ) : null}
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
        return (
          <div key={item.id} className={cls}>
            {item.text}
            {item.kind === "assistant" && item.id === streamingId ? (
              <span className="msg__cursor" />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
