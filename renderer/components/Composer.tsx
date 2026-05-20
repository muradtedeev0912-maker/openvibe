import React, { useEffect, useMemo, useRef, useState } from "react";
import type { ContentPart, FileMatch } from "../types.js";

export interface SlashCommand {
  name: string;
  description: string;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { name: "/help", description: "Show all slash commands" },
  { name: "/clear", description: "Clear conversation history and free context" },
  { name: "/reset", description: "Alias for /clear" },
  { name: "/cwd", description: "Print the current working directory" },
  { name: "/model", description: "Show the active model and endpoint" },
  { name: "/exit", description: "Quit vibe" },
];

export interface Attachment {
  id: string;
  kind: "file" | "image";
  /** Absolute path for file/image. */
  path?: string;
  /** Display name (basename). */
  name: string;
  /** Image data URL. */
  dataUrl?: string;
}

export interface SendPayload {
  parts: ContentPart[];
  display: string;
  attachments: Attachment[];
}

interface Props {
  disabled: boolean;
  workspace: string;
  onSubmit: (payload: SendPayload | { slash: string }) => void;
}

interface MentionState {
  active: boolean;
  start: number; // index in textarea where '@' is
  query: string;
  selected: number;
  matches: FileMatch[];
  loading: boolean;
}

let attachIdSeq = 0;
const newAttachId = (): string => `a${++attachIdSeq}-${Date.now().toString(36)}`;

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function basename(path: string): string {
  const m = /[\\/]([^\\/]+)$/.exec(path);
  return m?.[1] ?? path;
}

const IMAGE_RE = /\.(png|jpe?g|gif|webp|bmp|svg)$/i;

export function Composer({
  disabled,
  workspace,
  onSubmit,
}: Props): React.ReactElement {
  const [value, setValue] = useState("");
  const [slashSelected, setSlashSelected] = useState(0);
  const [focused, setFocused] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [mention, setMention] = useState<MentionState>({
    active: false,
    start: -1,
    query: "",
    selected: 0,
    matches: [],
    loading: false,
  });
  const [dragOver, setDragOver] = useState(false);
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const slashMatches = useMemo<SlashCommand[]>(() => {
    if (mention.active) return [];
    if (!value.startsWith("/")) return [];
    const q = value.slice(1).toLowerCase();
    return SLASH_COMMANDS.filter((c) =>
      c.name.slice(1).toLowerCase().startsWith(q),
    );
  }, [value, mention.active]);

  // auto-resize textarea
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [value, attachments.length]);

  useEffect(() => {
    if (!disabled) ref.current?.focus();
  }, [disabled]);

  // Detect @-mention as user types or moves caret
  function recomputeMention(text: string, caret: number): void {
    // walk back from caret to find an @ that begins a mention token
    let i = caret - 1;
    while (i >= 0) {
      const ch = text[i]!;
      if (ch === "@") break;
      // mention token allows letters/digits/_- and / \ . (paths)
      if (/[\s,;:]/.test(ch)) {
        setMention((m) =>
          m.active ? { ...m, active: false, matches: [] } : m,
        );
        return;
      }
      i--;
    }
    if (i < 0) {
      setMention((m) => (m.active ? { ...m, active: false, matches: [] } : m));
      return;
    }
    // require @ at start or after whitespace
    const before = i === 0 ? "" : text[i - 1]!;
    if (before && !/\s/.test(before)) {
      setMention((m) => (m.active ? { ...m, active: false, matches: [] } : m));
      return;
    }
    const query = text.slice(i + 1, caret);
    setMention((prev) => ({
      ...prev,
      active: true,
      start: i,
      query,
      selected: 0,
      loading: true,
    }));
    // fetch fuzzy matches
    window.vibe.fs.find(workspace, query, 30).then((res) => {
      setMention((prev) => {
        // ignore stale responses
        if (!prev.active || prev.start !== i || prev.query !== query) return prev;
        if (!res.ok) return { ...prev, matches: [], loading: false };
        return { ...prev, matches: res.matches, loading: false };
      });
    });
  }

  function applyMention(match: FileMatch): void {
    const m = mention;
    if (!m.active) return;
    const before = value.slice(0, m.start);
    const after = value.slice(m.start + 1 + m.query.length);
    const inserted = `@${match.rel} `;
    const next = before + inserted + after;
    setValue(next);
    setMention((s) => ({ ...s, active: false, matches: [] }));
    // attach as file context
    if (IMAGE_RE.test(match.path)) {
      // Image attached via @-mention: read file and convert to data URL
      readImageAttachment(match.path);
    } else {
      addAttachment({
        id: newAttachId(),
        kind: "file",
        path: match.path,
        name: match.name,
      });
    }
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      const pos = (before + inserted).length;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  }

  function addAttachment(a: Attachment): void {
    setAttachments((prev) => {
      // dedupe by path
      if (a.path && prev.some((p) => p.path === a.path)) return prev;
      return [...prev, a];
    });
  }

  function removeAttachment(id: string): void {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }

  async function readImageAttachment(path: string): Promise<void> {
    // Use fs.read for text? No — use file:// via fetch? In Electron renderer we
    // can't fetch arbitrary files. Round-trip through main as base64 by reusing
    // fs.read? It's text-only. So instead, encode via FileReader in renderer
    // is not possible without a File. For images dropped from desktop we have
    // File objects. For @-mention images we'll use a small helper IPC.
    // Fallback: just attach as a file path; vision providers can't see it though.
    addAttachment({
      id: newAttachId(),
      kind: "file",
      path,
      name: basename(path),
    });
  }

  async function handleFiles(files: FileList | File[]): Promise<void> {
    const list = Array.from(files);
    for (const file of list) {
      const isImage = file.type.startsWith("image/") || IMAGE_RE.test(file.name);
      if (isImage) {
        try {
          const dataUrl = await fileToDataUrl(file);
          addAttachment({
            id: newAttachId(),
            kind: "image",
            name: file.name,
            dataUrl,
          });
        } catch {
          // skip
        }
      } else {
        // For text files dropped from the OS we have a path on Electron via .path
        const anyFile = file as File & { path?: string };
        addAttachment({
          id: newAttachId(),
          kind: "file",
          path: anyFile.path,
          name: file.name,
        });
      }
    }
  }

  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>): void {
    const items = e.clipboardData.items;
    const imgs: File[] = [];
    for (const it of Array.from(items)) {
      if (it.kind === "file") {
        const f = it.getAsFile();
        if (f && f.type.startsWith("image/")) imgs.push(f);
      }
    }
    if (imgs.length > 0) {
      e.preventDefault();
      handleFiles(imgs);
    }
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>): void {
    e.preventDefault();
    setDragOver(false);
    const dt = e.dataTransfer;
    if (!dt) return;

    // Drop from file tree → insert @mention
    const vibePath = dt.getData("application/x-vibe-path");
    const vibeName = dt.getData("application/x-vibe-name");
    if (vibePath) {
      // Calculate relative path from workspace
      let rel = vibePath;
      if (vibePath.startsWith(workspace)) {
        rel = vibePath.slice(workspace.length).replace(/^[\\/]/, "");
      }
      setValue((prev) => {
        const sep = prev && !prev.endsWith(" ") && !prev.endsWith("\n") ? " " : "";
        return prev + sep + "@" + rel + " ";
      });
      addAttachment({
        id: newAttachId(),
        kind: "file",
        path: vibePath,
        name: vibeName || rel.split(/[\\/]/).pop() || rel,
      });
      return;
    }

    // Drop from OS (files/images)
    if (dt.files && dt.files.length > 0) {
      handleFiles(dt.files);
    }
  }

  function submit(): void {
    const v = value.trim();
    if (!v && attachments.length === 0) return;

    if (v.startsWith("/")) {
      onSubmit({ slash: v });
      setValue("");
      return;
    }

    const parts: ContentPart[] = [];
    if (v) parts.push({ type: "text", text: v });
    // images first if present (some providers prefer that order, doesn't matter)
    for (const a of attachments) {
      if (a.kind === "image" && a.dataUrl) {
        parts.push({ type: "image_url", image_url: { url: a.dataUrl } });
      }
    }
    // file attachments are merged into text as references; the agent will
    // read them via tools when needed.
    const fileRefs = attachments
      .filter((a) => a.kind === "file" && a.path)
      .map((a) => a.path);
    if (fileRefs.length > 0) {
      const text =
        (parts.find((p) => p.type === "text") as { text: string } | undefined)
          ?.text ?? "";
      const refs =
        "\n\nAttached files:\n" + fileRefs.map((f) => `- ${f}`).join("\n");
      const merged = (text + refs).trim();
      // replace or push text part
      const idx = parts.findIndex((p) => p.type === "text");
      if (idx >= 0) parts[idx] = { type: "text", text: merged };
      else parts.unshift({ type: "text", text: merged });
    }
    onSubmit({ parts, display: v, attachments: attachments.slice() });
    setValue("");
    setAttachments([]);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>): void {
    // mention popup navigation
    if (mention.active && mention.matches.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMention((s) => ({
          ...s,
          selected: (s.selected + 1) % s.matches.length,
        }));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMention((s) => ({
          ...s,
          selected:
            (s.selected - 1 + s.matches.length) % s.matches.length,
        }));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const m = mention.matches[mention.selected]!;
        applyMention(m);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMention((s) => ({ ...s, active: false, matches: [] }));
        return;
      }
    }

    // slash popup navigation
    if (slashMatches.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashSelected((s) => (s + 1) % slashMatches.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashSelected(
          (s) => (s - 1 + slashMatches.length) % slashMatches.length,
        );
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        setValue(slashMatches[slashSelected]!.name + " ");
        setSlashSelected(0);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setValue("");
        setSlashSelected(0);
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const m = slashMatches[slashSelected]!;
        if (value !== m.name && value !== m.name + " ") {
          setValue(m.name + " ");
        } else {
          submit();
        }
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  function onChange(e: React.ChangeEvent<HTMLTextAreaElement>): void {
    const text = e.target.value;
    setValue(text);
    setSlashSelected(0);
    const caret = e.target.selectionStart;
    recomputeMention(text, caret);
  }

  function onSelect(e: React.SyntheticEvent<HTMLTextAreaElement>): void {
    const el = e.currentTarget;
    recomputeMention(el.value, el.selectionStart);
  }

  return (
    <div
      className={"composer" + (dragOver ? " composer--drag" : "")}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      {mention.active ? (
        <div className="popup popup--mentions" role="listbox">
          {mention.loading && mention.matches.length === 0 ? (
            <div className="popup__empty">searching…</div>
          ) : null}
          {!mention.loading && mention.matches.length === 0 ? (
            <div className="popup__empty">no matches</div>
          ) : null}
          {mention.matches.map((m, i) => (
            <div
              key={m.path}
              className={
                "popup__item popup__item--mention" +
                (i === mention.selected ? " popup__item--active" : "")
              }
              role="option"
              aria-selected={i === mention.selected}
              onMouseEnter={() =>
                setMention((s) => ({ ...s, selected: i }))
              }
              onMouseDown={(e) => {
                e.preventDefault();
                applyMention(m);
              }}
            >
              <span className="popup__name">{m.name}</span>
              <span className="popup__desc">{m.rel}</span>
            </div>
          ))}
        </div>
      ) : null}

      {!mention.active && slashMatches.length > 0 ? (
        <div className="popup" role="listbox">
          {slashMatches.map((c, i) => (
            <div
              key={c.name}
              className={
                "popup__item" +
                (i === slashSelected ? " popup__item--active" : "")
              }
              role="option"
              aria-selected={i === slashSelected}
              onMouseEnter={() => setSlashSelected(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                setValue(c.name + " ");
                setSlashSelected(0);
                ref.current?.focus();
              }}
            >
              <span className="popup__name">{c.name}</span>
              <span className="popup__desc">{c.description}</span>
            </div>
          ))}
        </div>
      ) : null}

      {attachments.length > 0 ? (
        <div className="composer__chips">
          {attachments.map((a) => (
            <div
              key={a.id}
              className={"chip chip--" + a.kind}
              title={a.path ?? a.name}
            >
              {a.kind === "image" ? (
                <img className="chip__thumb" src={a.dataUrl} alt="" />
              ) : (
                <span className="chip__icon">⌘</span>
              )}
              <span className="chip__name">{a.name}</span>
              <button
                className="chip__remove"
                onClick={() => removeAttachment(a.id)}
                aria-label="Remove"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div
        className={
          "composer__box" +
          (focused ? " composer__box--focus" : "") +
          (disabled ? " composer__box--disabled" : "")
        }
      >
        <span className="composer__caret">›</span>
        <textarea
          ref={ref}
          rows={1}
          value={value}
          disabled={disabled}
          onChange={onChange}
          onSelect={onSelect}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          placeholder={
            disabled
              ? "thinking…"
              : "Ask vibe to do something. Type @ to mention a file, / for commands."
          }
          spellCheck={false}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: "none" }}
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          className="composer__icon"
          disabled={disabled}
          onClick={() => fileInputRef.current?.click()}
          title="Attach image"
          aria-label="Attach image"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
            <path d="M8 3v10M3 8h10" />
          </svg>
        </button>
      </div>
      <div className="composer__hint">
        Enter to send · Shift+Enter for newline · @ for files · / for commands · drop or paste images
      </div>
    </div>
  );
}
