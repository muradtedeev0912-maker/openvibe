import React, { useEffect, useMemo, useRef, useState } from "react";
import type { ContentPart, FileMatch } from "../types.js";
import { useT } from "../i18n.js";
import { useAgentMode, type AgentMode } from "../agentMode.js";
import { FileIcon } from "./icons.js";
import stoppedSfx from "../stoped.mp3";

export interface SlashCommand {
  name: string;
  description: string;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { name: "/new", description: "Create project from template" },
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
  inject?: string | null;
  onInjected?: () => void;
  currentModel?: string;
  onPickModel?: (model: string, apiKey: string, baseUrl: string) => void;
  planModel?: string;
  onPickPlanModel?: (model: string) => void;
  /** True when a plan task already exists with unfinished steps. Disables
   *  re-running the planner prompt on follow-up messages. */
  planActive?: boolean;
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
  inject,
  onInjected,
  currentModel,
  onPickModel,
  planModel,
  onPickPlanModel,
  planActive,
}: Props): React.ReactElement {
  const t = useT();
  const [agentMode, setAgentMode] = useAgentMode();
  const [modePickerOpen, setModePickerOpen] = useState(false);
  const modePickerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!modePickerOpen) return;
    function onDocClick(e: MouseEvent): void {
      if (modePickerRef.current && !modePickerRef.current.contains(e.target as Node)) {
        setModePickerOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [modePickerOpen]);

  const SLASH_COMMANDS_LOCALIZED = useMemo<SlashCommand[]>(() => [
    { name: "/new", description: t("slash.cmd.new") },
    { name: "/skills", description: t("slash.cmd.skills") },
    { name: "/exit", description: t("slash.cmd.exit") },
  ], [t]);

  const [value, setValue] = useState("");
  const [slashSelected, setSlashSelected] = useState(0);
  const [focused, setFocused] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [skillsTag, setSkillsTag] = useState(false);
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
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [modelPickerClosing, setModelPickerClosing] = useState(false);
  const [modelPickerRender, setModelPickerRender] = useState(false);
  const modelPickerRef = useRef<HTMLDivElement | null>(null);
  const [availableModels, setAvailableModels] = useState<Array<{ id: string; name: string; model: string; apiKey: string; baseUrl: string }>>([]);

  // Drive open/close animation timeline
  useEffect(() => {
    if (modelPickerOpen) {
      setModelPickerRender(true);
      setModelPickerClosing(false);
    } else if (modelPickerRender) {
      setModelPickerClosing(true);
      const t = setTimeout(() => {
        setModelPickerRender(false);
        setModelPickerClosing(false);
      }, 180);
      return () => clearTimeout(t);
    }
  }, [modelPickerOpen]);

  // Load connected providers on mount and whenever the picker opens
  useEffect(() => {
    function loadProviders(): void {
      try {
        const saved = localStorage.getItem("vibe_providers");
        if (!saved) { setAvailableModels([]); return; }
        const list = JSON.parse(saved) as Array<{
          id: string; name: string; model: string; apiKey: string; baseUrl: string; connected: boolean;
        }>;
        setAvailableModels(
          list.filter((p) => p.connected && p.model).map((p) => ({
            id: p.id, name: p.name, model: p.model, apiKey: p.apiKey, baseUrl: p.baseUrl,
          })),
        );
      } catch { setAvailableModels([]); }
    }
    loadProviders();
    window.addEventListener("storage", loadProviders);
    return () => window.removeEventListener("storage", loadProviders);
  }, [modelPickerOpen]);

  // Close picker on outside click
  useEffect(() => {
    if (!modelPickerOpen) return;
    function onDocClick(e: MouseEvent): void {
      if (modelPickerRef.current && !modelPickerRef.current.contains(e.target as Node)) {
        setModelPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [modelPickerOpen]);

  const currentModelLabel = (() => {
    if (availableModels.length === 0) return t("composer.no_models_short");
    if (agentMode === "plan" && planModel) {
      return `${planModel} + ${currentModel || "?"}`;
    }
    const match = availableModels.find((m) => m.model === currentModel);
    return match ? match.model : currentModel || t("composer.no_models_short");
  })();
  const [hoverGroup, setHoverGroup] = useState<"plan" | "coding" | null>(null);

  // Animated placeholder — types each phrase, holds, deletes, moves on
  const PLACEHOLDER_PHRASES = useMemo(() => [
    t("composer.placeholder"),
    t("composer.placeholder.b"),
    t("composer.placeholder.c"),
  ], [t]);
  const [animPlaceholder, setAnimPlaceholder] = useState("");
  useEffect(() => {
    let phraseIdx = 0;
    let charIdx = 0;
    let mode: "type" | "hold" | "delete" = "type";
    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    function step(): void {
      if (cancelled) return;
      const phrase = PLACEHOLDER_PHRASES[phraseIdx]!;
      let nextDelay = 50;
      if (mode === "type") {
        charIdx++;
        setAnimPlaceholder(phrase.slice(0, charIdx));
        if (charIdx >= phrase.length) {
          mode = "hold";
          nextDelay = 2000;
        }
      } else if (mode === "hold") {
        mode = "delete";
        nextDelay = 30;
      } else {
        charIdx--;
        setAnimPlaceholder(phrase.slice(0, charIdx));
        if (charIdx <= 0) {
          mode = "type";
          phraseIdx = (phraseIdx + 1) % PLACEHOLDER_PHRASES.length;
          nextDelay = 250;
        } else {
          nextDelay = 25;
        }
      }
      timeout = setTimeout(step, nextDelay);
    }
    step();
    return () => {
      cancelled = true;
      if (timeout) clearTimeout(timeout);
    };
  }, [PLACEHOLDER_PHRASES]);

  // Handle inject from editor selection
  useEffect(() => {
    if (inject) {
      setValue((v) => v ? v + "\n" + inject : inject);
      onInjected?.();
      ref.current?.focus();
    }
  }, [inject]);

  const slashMatches = useMemo<SlashCommand[]>(() => {
    if (mention.active) return [];
    if (!value.startsWith("/")) return [];
    const q = value.slice(1).toLowerCase();
    return SLASH_COMMANDS_LOCALIZED.filter((c) =>
      c.name.slice(1).toLowerCase().startsWith(q),
    );
  }, [value, mention.active, SLASH_COMMANDS_LOCALIZED]);

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
        // For text files dropped from the OS we have a path on Electron via
        // .path (legacy) or webUtils.getPathForFile (Electron 32+).
        const anyFile = file as File & { path?: string };
        const path = anyFile.path || window.vibe.getPathForFile(file) || undefined;
        addAttachment({
          id: newAttachId(),
          kind: "file",
          path,
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

    // Drop from editor (text/plain with @file:lines format)
    const plainText = dt.getData("text/plain");
    if (plainText && plainText.startsWith("@")) {
      setValue((prev) => {
        const sep = prev && !prev.endsWith(" ") && !prev.endsWith("\n") ? " " : "";
        return prev + sep + plainText + " ";
      });
      ref.current?.focus();
      return;
    }

    // Drop from OS (files/images)
    if (dt.files && dt.files.length > 0) {
      handleFiles(dt.files);
    }
  }

  function submit(): void {
    const v = value.trim();
    if (!v && attachments.length === 0 && !skillsTag) return;

    if (v.startsWith("/")) {
      onSubmit({ slash: v });
      setValue("");
      return;
    }

    const parts: ContentPart[] = [];
    if (v) {
      // Plan mode prompt: ask the model to act as a senior architect and produce
      // a complete strategy with explicit, copy-pastable sub-prompts for the
      // executor model. No code, no tool calls that modify files.
      const planPrompt = [
        "═══════════════════════════════════════════════════════════════",
        " STRATEGIC PLANNING MODE — deep reasoning, no code, no edits.",
        "═══════════════════════════════════════════════════════════════",
        "",
        "You are the PLANNER. A separate, faster EXECUTOR will run your plan",
        "step by step. The quality of your plan determines the quality of",
        "everything the executor does next. Think slowly and deeply.",
        "",
        "## Your mission",
        "Produce the most thoughtful, concrete, and verifiable plan",
        "possible for the user's request. Better than what Cursor or",
        "Claude Code would produce. The plan must be so clear that a",
        "junior model could execute it without asking questions.",
        "",
        "## Hard rules",
        "- DO NOT execute. No write_file, edit_file, run_terminal_cmd,",
        "  create_dir, move_file, or any tool that mutates state.",
        "- READ-ONLY tools (read_file, list_dir, grep, search) are not",
        "  just allowed — they are EXPECTED. Use them to ground every",
        "  assumption. A plan written without reading the code is a guess.",
        "- DO NOT write final source code. Pseudocode is allowed inside",
        "  Strategy steps when the algorithm needs to be specified.",
        "- NO filler, no apologies, no questions to the user. If something",
        "  is ambiguous, state your assumption explicitly and proceed.",
        "- Reply in the SAME language the user wrote in.",
        "",
        "## Process you must follow internally (do not output the labels)",
        "1. DISCOVERY — Map the relevant area of the codebase. Identify",
        "   files, modules, frameworks, conventions, and existing patterns.",
        "   Read enough source to know what's actually there.",
        "2. ANALYSIS — Decompose the request into the smallest meaningful",
        "   units of change. Surface hidden complexity, edge cases, and",
        "   dependencies between units.",
        "3. STRATEGY — Order the units into a sequence the executor can",
        "   run mechanically. Each step must be self-contained and have",
        "   a clear, observable outcome.",
        "4. RISK REVIEW — For each step, ask 'how could this break?' and",
        "   bake the answer into Done criteria.",
        "",
        "## Output format (Markdown, sections in this exact order)",
        "Begin directly with `## Goal`. ALL sections are mandatory.",
        "",
        "## Goal",
        "One short paragraph: what the user actually wants and why it",
        "matters. Distinguish stated request from underlying intent.",
        "",
        "## Context (what I read)",
        "- bullet list of files / folders / docs you inspected with",
        "  read_file or list_dir, and the one fact each one gave you",
        "- if you didn't read anything, say so explicitly and explain",
        "  why the request didn't require code grounding",
        "",
        "## Assumptions & risks",
        "- bullet list. Be specific. 'Project uses Vite' beats 'modern",
        "  build tool'. For each risk, name the mitigation in the plan.",
        "",
        "## Strategy",
        "An ORDERED Markdown list (`1.`, `2.`, ...) of concrete top-level",
        "steps. Each step is one actionable task the executor will",
        "perform in a single run. Use 2-space indented `-` sub-steps for",
        "finer detail. Be specific: name files, functions, libraries,",
        "commands. Aim for 5–15 top-level steps; split anything that",
        "feels like 'and then' into two steps.",
        "",
        "Each top-level step MUST follow this micro-format:",
        "",
        "  N. <imperative verb phrase — what changes>",
        "     - File(s): `path/to/file` (and others if needed)",
        "     - Why: one sentence linking it back to the Goal",
        "     - Done when: a verifiable condition (build passes, this",
        "       symbol exists, this command returns 0, this test green)",
        "",
        "## Files to touch",
        "- `path/to/file` — what changes and why",
        "  Include NEW files explicitly. Mark anything you'd remove.",
        "",
        "## Done criteria",
        "- bullet list of verifiable conditions for the WHOLE task. The",
        "  executor must be able to mechanically check each one.",
        "",
        "## Open questions",
        "- bullets, only if a critical decision was made on assumption.",
        "  Flag them so the user can correct course before you execute.",
        "  If there are none, write `- none`.",
        "",
        "Begin your response directly with `## Goal`. Nothing before it.",
        "",
        "User request:",
      ].join("\n");
      const text = agentMode === "plan" && !planActive
        ? `${planPrompt}\n${v}`
        : v;
      parts.push({ type: "text", text });
    }
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
    onSubmit({ parts, display: skillsTag ? `#skills ${v}` : v, attachments: attachments.slice() });
    setValue("");
    setAttachments([]);
    setSkillsTag(false);
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
    let text = e.target.value;
    // When user types `#skills ` (with trailing space), promote it to a chip
    // and strip the token from the textarea. Idempotent — only fires once.
    const re = /(?:^|\s)#skills(\s)/i;
    const m = re.exec(text);
    if (m) {
      const start = m.index + (m[0].startsWith("#") ? 0 : 1);
      text = text.slice(0, start) + text.slice(start + "#skills".length + 1);
      setSkillsTag(true);
    }
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
            <div className="popup__empty">{t("common.searching")}</div>
          ) : null}
          {!mention.loading && mention.matches.length === 0 ? (
            <div className="popup__empty">{t("common.no_matches")}</div>
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

      {attachments.length > 0 || skillsTag ? (
        <div className="composer__chips">
          {skillsTag ? (
            <div className="chip chip--skill" title="#skills">
              <span className="chip__icon" aria-hidden>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                  <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                  <line x1="12" y1="22.08" x2="12" y2="12" />
                </svg>
              </span>
              <span className="chip__name">Skill</span>
              <button
                className="chip__remove"
                onClick={() => setSkillsTag(false)}
                aria-label={t("composer.remove")}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          ) : null}
          {attachments.map((a) => (
            <div
              key={a.id}
              className={"chip chip--" + a.kind}
              title={a.path ?? a.name}
            >
              {a.kind === "image" ? (
                <img className="chip__thumb" src={a.dataUrl} alt="" />
              ) : (
                <span className="chip__icon"><FileIcon name={a.name} /></span>
              )}
              <span className="chip__name">{a.name}</span>
              <button
                className="chip__remove"
                onClick={() => removeAttachment(a.id)}
                aria-label={t("composer.remove")}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
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
        onMouseDown={(e) => {
          // Click anywhere inside the box (that isn't a button or the textarea itself)
          // should focus the textarea so the cursor never gets stuck after popups/dialogs.
          const target = e.target as HTMLElement;
          if (
            target === e.currentTarget ||
            target.tagName === "DIV" ||
            target.tagName === "SPAN"
          ) {
            e.preventDefault();
            ref.current?.focus();
          }
        }}
      >
        <span className="composer__caret">›</span>
        <div className="composer__input-wrap">
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
            placeholder={disabled ? "" : animPlaceholder}
            spellCheck={false}
          />
        </div>
        {disabled && !value ? (
          <div className="composer__thinking" aria-hidden="true">
            <span className="grid-icon">
              <span /><span /><span />
              <span /><span /><span />
              <span /><span /><span />
            </span>
            <span className="composer__thinking-text">{t("composer.placeholder_thinking")}</span>
          </div>
        ) : null}
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
          title={t("composer.attach_image")}
          aria-label={t("composer.attach_image")}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
        </button>
        <div className="composer__bottom-left">
          <div
            className={"composer__model" + (modelPickerOpen ? " composer__model--open" : "")}
            ref={modelPickerRef}
          >
          <button
            type="button"
            className="composer__model-trigger"
            onClick={() => setModelPickerOpen((o) => !o)}
            disabled={availableModels.length === 0}
            title={availableModels.length === 0 ? t("composer.no_models") : t("composer.model")}
          >
            <span className="composer__model-label">{currentModelLabel}</span>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {modelPickerRender && availableModels.length > 0 ? (
            <div className={"composer__model-menu" + (modelPickerClosing ? " composer__model-menu--closing" : "")}>
              {agentMode === "plan" ? (
                <>
                  <div
                    className={"composer__group" + (hoverGroup === "plan" ? " composer__group--active" : "")}
                    onMouseEnter={() => setHoverGroup("plan")}
                  >
                    <div className="composer__group-label">
                      <span>{t("composer.group.plan")}</span>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                    </div>
                    {hoverGroup === "plan" ? (
                      <div className="composer__submenu">
                        {availableModels.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            className={"composer__model-option" + (m.model === planModel ? " composer__model-option--active" : "")}
                            onClick={() => {
                              onPickPlanModel?.(m.model);
                              setModelPickerOpen(false);
                            }}
                          >
                            <span className="composer__model-option-id">{m.model}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div
                    className={"composer__group" + (hoverGroup === "coding" ? " composer__group--active" : "")}
                    onMouseEnter={() => setHoverGroup("coding")}
                  >
                    <div className="composer__group-label">
                      <span>{t("composer.group.coding")}</span>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                    </div>
                    {hoverGroup === "coding" ? (
                      <div className="composer__submenu">
                        {availableModels.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            className={"composer__model-option" + (m.model === currentModel ? " composer__model-option--active" : "")}
                            onClick={() => {
                              onPickModel?.(m.model, m.apiKey, m.baseUrl);
                              setModelPickerOpen(false);
                            }}
                          >
                            <span className="composer__model-option-id">{m.model}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </>
              ) : (
                availableModels.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={
                      "composer__model-option" +
                      (m.model === currentModel ? " composer__model-option--active" : "")
                    }
                    onClick={() => {
                      onPickModel?.(m.model, m.apiKey, m.baseUrl);
                      setModelPickerOpen(false);
                    }}
                  >
                    <span className="composer__model-option-id">{m.model}</span>
                  </button>
                ))
              )}
            </div>
          ) : null}
        </div>

        <div
          className={"composer__model composer__mode" + (modePickerOpen ? " composer__model--open" : "")}
          ref={modePickerRef}
          style={{ marginLeft: 4 }}
        >
          <button
            type="button"
            className="composer__model-trigger"
            onClick={() => setModePickerOpen((o) => !o)}
            title={t("composer.mode")}
          >
            <span className="composer__model-label">{agentMode === "plan" ? t("composer.mode.plan") : t("composer.mode.vibe")}</span>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {modePickerOpen ? (
            <div className="composer__model-menu">
              {(["vibe", "plan"] as AgentMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  className={
                    "composer__model-option" +
                    (m === agentMode ? " composer__model-option--active" : "")
                  }
                  onClick={() => {
                    setAgentMode(m);
                    setModePickerOpen(false);
                  }}
                >
                  <span className="composer__model-option-id">{m === "plan" ? t("composer.mode.plan") : t("composer.mode.vibe")}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        </div>
        {disabled ? (
          <button
            type="button"
            className="composer__icon composer__icon--stop"
            onClick={() => { (window as any).__vibeAborted = true; window.vibe.abort(); const a = new Audio(stoppedSfx); a.volume = 0.5; a.play().catch(() => {}); }}
            title={t("composer.stop")}
            aria-label={t("composer.stop")}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
              <rect x="3" y="3" width="10" height="10" rx="2" />
            </svg>
          </button>
        ) : (
          <button
            type="button"
            className="composer__icon composer__icon--send"
            disabled={!value.trim() && attachments.length === 0 && !skillsTag}
            onClick={() => submit()}
            title={t("composer.send")}
            aria-label={t("composer.send")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <line x1="12" y1="19" x2="12" y2="5" />
              <polyline points="5 12 12 5 19 12" />
            </svg>
          </button>
        )}
      </div>
      <div className="composer__hint">
        {t("composer.hint")}
      </div>
    </div>
  );
}
