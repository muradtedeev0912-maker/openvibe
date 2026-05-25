import React, { useEffect, useRef, useState } from "react";
import { useT } from "../i18n.js";
import type { HistoryItem } from "./History.js";

interface Props {
  items: HistoryItem[];
  workspace?: string;
  onClose: () => void;
  onResolve?: (id: string) => void;
}

interface Change {
  id: string;
  kind: "edit" | "write";
  path: string;
  oldStr?: string;
  newStr?: string;
  content?: string;
  previousContent?: string;
}

interface DiffLine {
  kind: "ctx" | "del" | "add";
  text: string;
  oldNum?: number;
  newNum?: number;
}

function basename(p: string): string {
  const m = /[\\/]([^\\/]+)$/.exec(p);
  return m?.[1] ?? p;
}

/** Build a unified diff with context, like git diff but full file. */
function buildFullDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");

  // LCS-based diff (O(n*m)) — fine for files under a few thousand lines.
  const m = oldLines.length;
  const n = newLines.length;
  // Use a sparse approach for very large files
  if (m * n > 2_000_000) {
    return [
      ...oldLines.map<DiffLine>((t, i) => ({ kind: "del", text: t, oldNum: i + 1 })),
      ...newLines.map<DiffLine>((t, i) => ({ kind: "add", text: t, newNum: i + 1 })),
    ];
  }
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (oldLines[i] === newLines[j]) dp[i]![j] = dp[i + 1]![j + 1]! + 1;
      else dp[i]![j] = Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  let oldNum = 0;
  let newNum = 0;
  while (i < m && j < n) {
    if (oldLines[i] === newLines[j]) {
      oldNum++; newNum++;
      out.push({ kind: "ctx", text: oldLines[i]!, oldNum, newNum });
      i++; j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      oldNum++;
      out.push({ kind: "del", text: oldLines[i]!, oldNum });
      i++;
    } else {
      newNum++;
      out.push({ kind: "add", text: newLines[j]!, newNum });
      j++;
    }
  }
  while (i < m) { oldNum++; out.push({ kind: "del", text: oldLines[i++]!, oldNum }); }
  while (j < n) { newNum++; out.push({ kind: "add", text: newLines[j++]!, newNum }); }
  return out;
}

function countAddRemove(diff: DiffLine[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const l of diff) {
    if (l.kind === "add") added++;
    else if (l.kind === "del") removed++;
  }
  return { added, removed };
}

export function Changes({ items, workspace, onClose, onResolve }: Props): React.ReactElement {
  const t = useT();
  const [fileContents, setFileContents] = useState<Map<string, string>>(new Map());
  const fetchedRef = useRef<Set<string>>(new Set());

  // Build change list from history
  const all: Change[] = [];
  for (const it of items) {
    if (it.kind !== "tool") continue;
    if (it.toolName === "edit_file") {
      const a = it.toolArgs as { path?: string; old_str?: string; new_str?: string } | undefined;
      if (!a?.path || a.old_str == null || a.new_str == null) continue;
      all.push({ id: it.id, kind: "edit", path: a.path, oldStr: a.old_str, newStr: a.new_str });
    } else if (it.toolName === "write_file") {
      const a = it.toolArgs as { path?: string; content?: string } | undefined;
      if (!a?.path) continue;
      let prev: string | undefined;
      try {
        const parsed = JSON.parse(it.text);
        prev = parsed.previousContent ?? undefined;
      } catch { /* ignore */ }
      all.push({ id: it.id, kind: "write", path: a.path, content: a.content, previousContent: prev });
    }
  }
  const changes = all;

  function resolvePath(p: string): string {
    const isAbsolute = /^[A-Za-z]:[\\/]/.test(p) || p.startsWith("/");
    if (isAbsolute || !workspace) return p;
    const sep = workspace.includes("\\") ? "\\" : "/";
    return workspace + sep + p;
  }

  // For edit_file changes we need the full current file content to show full-file diff.
  // We fetch each path lazily once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const c of changes) {
        if (c.kind !== "edit") continue;
        const abs = resolvePath(c.path);
        if (fetchedRef.current.has(abs)) continue;
        fetchedRef.current.add(abs);
        const r = await window.vibe.fs.read(abs);
        if (cancelled) return;
        if (r.ok) {
          setFileContents((m) => {
            const next = new Map(m);
            next.set(abs, r.content);
            return next;
          });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [changes.length, workspace]);

  async function reject(c: Change): Promise<void> {
    const abs = resolvePath(c.path);
    if (c.kind === "edit" && c.oldStr != null && c.newStr != null) {
      const r = await window.vibe.fs.read(abs);
      if (!r.ok) return;
      const reverted = r.content.replace(c.newStr, c.oldStr);
      await window.vibe.fs.write(abs, reverted);
    } else if (c.kind === "write") {
      await window.vibe.fs.write(abs, c.previousContent ?? "");
    }
    onResolve?.(c.id);
  }

  function accept(c: Change): void {
    onResolve?.(c.id);
  }

  async function rejectAll(): Promise<void> {
    for (const c of changes) {
      // eslint-disable-next-line no-await-in-loop
      await reject(c);
    }
  }

  function acceptAll(): void {
    for (const c of changes) onResolve?.(c.id);
  }

  function buildDiffForChange(c: Change): DiffLine[] {
    if (c.kind === "write") {
      return buildFullDiff(c.previousContent ?? "", c.content ?? "");
    }
    // edit_file: reconstruct full old/new file content using current file
    const abs = resolvePath(c.path);
    const current = fileContents.get(abs);
    if (current == null) return [];
    const newText = current; // current state (after the edit applied)
    const oldText = c.oldStr != null && c.newStr != null
      ? current.replace(c.newStr, c.oldStr)
      : current;
    return buildFullDiff(oldText, newText);
  }

  // Compute global stats
  let totalAdded = 0;
  let totalRemoved = 0;
  const computed = changes.map((c) => {
    const d = buildDiffForChange(c);
    const { added, removed } = countAddRemove(d);
    totalAdded += added;
    totalRemoved += removed;
    return { c, d, added, removed };
  });

  return (
    <div className="changes-panel">
      <div className="changes-panel__head">
        <div className="changes-panel__title">
          <span>
            {changes.length} {changes.length === 1 ? t("changes.file_changed") : t("changes.files_changed")}
          </span>
          <span className="changes__stat changes__stat--add">+{totalAdded}</span>
          <span className="changes__stat changes__stat--del">-{totalRemoved}</span>
        </div>
        <div className="changes-panel__actions">
          {changes.length > 0 ? (
            <>
              <button className="changes__big-btn changes__big-btn--reject" onClick={rejectAll} title={t("changes.reject_all")}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
              <button className="changes__big-btn changes__big-btn--accept" onClick={acceptAll} title={t("changes.accept_all")}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </button>
            </>
          ) : null}
          <button className="changes__close" onClick={onClose} aria-label={t("common.close")}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      <div className="changes-panel__body">
        {changes.length === 0 ? (
          <div className="changes-panel__empty">{t("changes.none")}</div>
        ) : (
          computed.map(({ c, d, added, removed }) => (
            <div key={c.id} className="changes-file">
              <div className="changes-file__head">
                <span className="changes-file__name" title={c.path}>{basename(c.path)}</span>
                <span className="changes-file__path">{c.path}</span>
                <span className="changes__stat changes__stat--add">+{added}</span>
                <span className="changes__stat changes__stat--del">-{removed}</span>
                <div className="changes-file__actions">
                  <button className="changes__big-btn changes__big-btn--reject" onClick={() => reject(c)} title={t("changes.reject")}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                  <button className="changes__big-btn changes__big-btn--accept" onClick={() => accept(c)} title={t("changes.accept")}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="changes-file__diff">
                {d.length === 0 ? (
                  <div className="changes-file__loading">{t("common.loading")}</div>
                ) : d.map((ln, i) => (
                  <div key={i} className={"changes-line changes-line--" + ln.kind}>
                    <span className="changes-line__num changes-line__num--old">{ln.oldNum ?? ""}</span>
                    <span className="changes-line__num changes-line__num--new">{ln.newNum ?? ""}</span>
                    <span className="changes-line__sign">{ln.kind === "add" ? "+" : ln.kind === "del" ? "-" : " "}</span>
                    <span className="changes-line__text">{ln.text || " "}</span>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
