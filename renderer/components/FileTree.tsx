import React, { useCallback, useEffect, useRef, useState } from "react";
import type { FsEntry } from "../types.js";
import { ContextMenu, type MenuItem } from "./ContextMenu.js";
import { FileIcon, FolderIcon } from "./icons.js";

interface NodeState {
  open: boolean;
  loading: boolean;
  error?: string;
  children?: FsEntry[];
}

interface CtxState {
  x: number;
  y: number;
  /** Right-clicked entry, or null if right-click on empty space (root). */
  entry: FsEntry | null;
  parent: string;
}

interface RootProps {
  cwd: string;
  onPickFolder: () => void;
  onOpenFile: (path: string) => void;
  activeFile: string | null;
}

function basename(path: string): string {
  const m = /[\\/]([^\\/]+)[\\/]?$/.exec(path);
  return m?.[1] ?? path;
}

function dirnameOf(path: string): string {
  const m = /^(.*)[\\/][^\\/]+$/.exec(path);
  return m?.[1] ?? path;
}

interface NodeProps {
  entry: FsEntry;
  depth: number;
  parent: string;
  states: Map<string, NodeState>;
  setStates: React.Dispatch<React.SetStateAction<Map<string, NodeState>>>;
  onOpenFile: (path: string) => void;
  activeFile: string | null;
  renamingPath: string | null;
  onCommitRename: (oldPath: string, newName: string) => void;
  onCancelRename: () => void;
  onContext: (state: CtxState) => void;
  cutPath: string | null;
  refreshAll: () => Promise<void>;
}

function FileNode(props: NodeProps): React.ReactElement {
  const {
    entry,
    depth,
    parent,
    states,
    setStates,
    onOpenFile,
    activeFile,
    renamingPath,
    onCommitRename,
    onCancelRename,
    onContext,
    cutPath,
    refreshAll,
  } = props;

  const state = states.get(entry.path);
  const open = state?.open ?? false;

  async function expand(force = false): Promise<void> {
    const cur = states.get(entry.path);
    if (cur?.open && !force) {
      setStates((prev) => {
        const map = new Map(prev);
        const c = map.get(entry.path);
        if (c) map.set(entry.path, { ...c, open: false });
        return map;
      });
      return;
    }
    if (cur?.children && !force) {
      setStates((prev) => {
        const map = new Map(prev);
        const c = map.get(entry.path);
        if (c) map.set(entry.path, { ...c, open: true });
        return map;
      });
      return;
    }
    setStates((prev) => {
      const map = new Map(prev);
      map.set(entry.path, { open: true, loading: true });
      return map;
    });
    const res = await window.vibe.fs.list(entry.path);
    setStates((prev) => {
      const map = new Map(prev);
      if (!res.ok) {
        map.set(entry.path, { open: true, loading: false, error: res.error });
      } else {
        map.set(entry.path, {
          open: true,
          loading: false,
          children: res.entries,
        });
      }
      return map;
    });
  }

  function onClick(): void {
    if (entry.isDir) expand();
    else onOpenFile(entry.path);
  }

  function onContextMenu(e: React.MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();
    onContext({ x: e.clientX, y: e.clientY, entry, parent });
  }

  const isActive = !entry.isDir && entry.path === activeFile;
  const isCut = entry.path === cutPath;
  const isRenaming = entry.path === renamingPath;
  const [dropOver, setDropOver] = useState(false);

  function onDragStart(e: React.DragEvent<HTMLDivElement>): void {
    e.dataTransfer.setData("text/plain", entry.path);
    e.dataTransfer.setData("application/x-vibe-path", entry.path);
    e.dataTransfer.setData("application/x-vibe-name", entry.name);
    e.dataTransfer.effectAllowed = "copyMove";
  }

  function onDragOver(e: React.DragEvent<HTMLDivElement>): void {
    if (!entry.isDir) return;
    if (!e.dataTransfer.types.includes("application/x-vibe-path")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropOver(true);
  }

  function onDragLeave(): void {
    setDropOver(false);
  }

  async function onDrop(e: React.DragEvent<HTMLDivElement>): Promise<void> {
    setDropOver(false);
    if (!entry.isDir) return;
    const srcPath = e.dataTransfer.getData("application/x-vibe-path");
    if (!srcPath || srcPath === entry.path) return;
    e.preventDefault();
    // Move: rename srcPath → entry.path/basename
    const srcName = srcPath.split(/[\\/]/).pop() ?? srcPath;
    const sep = srcPath.includes("\\") ? "\\" : "/";
    const destPath = entry.path + sep + srcName;
    if (srcPath === destPath) return;
    const res = await window.vibe.fs.rename(srcPath, destPath);
    if (res.ok) {
      // Refresh both source parent and destination
      const srcParent = srcPath.slice(0, srcPath.length - srcName.length - 1);
      await refreshAll();
    }
  }

  return (
    <>
      <div
        className={
          "ftree__row" +
          (isActive ? " ftree__row--active" : "") +
          (isCut ? " ftree__row--cut" : "") +
          (dropOver ? " ftree__row--dropover" : "")
        }
        style={{ paddingLeft: 8 + depth * 12 }}
        onClick={onClick}
        onContextMenu={onContextMenu}
        draggable={!isRenaming}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        title={entry.path}
      >
        <span className="ftree__chev">
          {entry.isDir ? (open ? "▾" : "▸") : ""}
        </span>
        {entry.isDir ? <FolderIcon open={open} /> : <FileIcon name={entry.name} />}
        {isRenaming ? (
          <RenameInput
            initial={entry.name}
            onCommit={(name) => onCommitRename(entry.path, name)}
            onCancel={onCancelRename}
          />
        ) : (
          <span
            className={
              "ftree__name" + (entry.isDir ? " ftree__name--dir" : "")
            }
          >
            {entry.name}
          </span>
        )}
      </div>
      {open && state?.loading ? (
        <div
          className="ftree__loading"
          style={{ paddingLeft: 8 + (depth + 1) * 12 }}
        >
          loading…
        </div>
      ) : null}
      {open && state?.error ? (
        <div
          className="ftree__error"
          style={{ paddingLeft: 8 + (depth + 1) * 12 }}
        >
          {state.error}
        </div>
      ) : null}
      {open && state?.children
        ? state.children.map((c) => (
            <FileNode
              key={c.path}
              entry={c}
              depth={depth + 1}
              parent={entry.path}
              states={states}
              setStates={setStates}
              onOpenFile={onOpenFile}
              activeFile={activeFile}
              renamingPath={renamingPath}
              onCommitRename={onCommitRename}
              onCancelRename={onCancelRename}
              onContext={onContext}
              cutPath={cutPath}
              refreshAll={refreshAll}
            />
          ))
        : null}
    </>
  );
}

function RenameInput({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string;
  onCommit: (name: string) => void;
  onCancel: () => void;
}): React.ReactElement {
  const [value, setValue] = useState(initial);
  const ref = React.useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const dot = initial.lastIndexOf(".");
    el.setSelectionRange(0, dot > 0 ? dot : initial.length);
  }, [initial]);

  return (
    <input
      ref={ref}
      className="ftree__rename"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          if (value.trim() && value !== initial) onCommit(value.trim());
          else onCancel();
        } else if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
      onBlur={() => {
        if (value.trim() && value !== initial) onCommit(value.trim());
        else onCancel();
      }}
      spellCheck={false}
    />
  );
}

export function FileTree({
  cwd,
  onPickFolder,
  onOpenFile,
  activeFile,
}: RootProps): React.ReactElement {
  const [root, setRoot] = useState<FsEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [states, setStates] = useState<Map<string, NodeState>>(new Map());
  const [ctx, setCtx] = useState<CtxState | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [cutPath, setCutPath] = useState<string | null>(null);
  const [creating, setCreating] = useState<{ dir: string; kind: "file" | "dir" } | null>(null);

  // Dirs whose children need to be re-fetched (after rename/delete inside them)
  async function refreshDir(dir: string): Promise<void> {
    if (dir === cwd) {
      const res = await window.vibe.fs.list(cwd);
      if (res.ok) setRoot(res.entries);
      return;
    }
    const res = await window.vibe.fs.list(dir);
    if (!res.ok) return;
    setStates((prev) => {
      const map = new Map(prev);
      const cur = map.get(dir);
      map.set(dir, {
        open: cur?.open ?? true,
        loading: false,
        children: res.entries,
      });
      return map;
    });
  }

  /** Refresh root + all currently-open directories. */
  async function refreshAll(): Promise<void> {
    const res = await window.vibe.fs.list(cwd);
    if (res.ok) setRoot(res.entries);
    // Refresh all open subdirectories
    const openDirs = [...states.entries()]
      .filter(([, s]) => s.open && s.children)
      .map(([dir]) => dir);
    for (const dir of openDirs) {
      const r = await window.vibe.fs.list(dir);
      if (!r.ok) continue;
      setStates((prev) => {
        const map = new Map(prev);
        const cur = map.get(dir);
        map.set(dir, {
          open: cur?.open ?? true,
          loading: false,
          children: r.entries,
        });
        return map;
      });
    }
  }

  // Auto-refresh when agent creates/edits/deletes files
  useEffect(() => {
    const off = window.vibe.onFsChanged(() => {
      refreshAll();
    });
    return off;
  });

  useEffect(() => {
    let cancelled = false;
    setRoot(null);
    setError(null);
    setStates(new Map());
    window.vibe.fs.list(cwd).then((res) => {
      if (cancelled) return;
      if (!res.ok) setError(res.error);
      else setRoot(res.entries);
    });
    return () => {
      cancelled = true;
    };
  }, [cwd]);

  function buildMenuItems(c: CtxState): MenuItem[] {
    const { entry, parent } = c;

    // Right-click on empty area or with no entry: only "New file/folder" in root
    if (!entry) {
      return [
        {
          label: "New file",
          onClick: () => promptCreate(parent, "file"),
        },
        {
          label: "New folder",
          onClick: () => promptCreate(parent, "dir"),
        },
        { label: "-", onClick: () => {} },
        {
          label: "Reveal in file explorer",
          onClick: () => window.vibe.fs.reveal(parent),
        },
      ];
    }

    const dirItems: MenuItem[] = entry.isDir
      ? [
          {
            label: "New file",
            onClick: () => promptCreate(entry.path, "file"),
          },
          {
            label: "New folder",
            onClick: () => promptCreate(entry.path, "dir"),
          },
          { label: "-", onClick: () => {} },
        ]
      : [];

    return [
      ...dirItems,
      {
        label: "Cut",
        shortcut: "Ctrl+X",
        onClick: () => setCutPath(entry.path),
      },
      {
        label: "Copy",
        shortcut: "Ctrl+C",
        onClick: () => window.vibe.clipboard.writeText(entry.path),
      },
      {
        label: "Copy path",
        onClick: () => window.vibe.clipboard.writeText(entry.path),
      },
      { label: "-", onClick: () => {} },
      {
        label: "Rename",
        shortcut: "F2",
        onClick: () => setRenaming(entry.path),
      },
      {
        label: "Delete",
        shortcut: "Del",
        danger: true,
        onClick: async () => {
          const ok = window.confirm(`Delete "${entry.name}"? This cannot be undone.`);
          if (!ok) return;
          const res = await window.vibe.fs.delete(entry.path);
          if (!res.ok) {
            window.alert(`Delete failed: ${res.error}`);
            return;
          }
          if (cutPath === entry.path) setCutPath(null);
          await refreshDir(parent);
        },
      },
      { label: "-", onClick: () => {} },
      {
        label: "Reveal in file explorer",
        onClick: () => window.vibe.fs.reveal(entry.path),
      },
    ];
  }

  async function promptCreate(
    dir: string,
    kind: "file" | "dir",
  ): Promise<void> {
    // Open the parent dir in the tree if it's not root
    if (dir !== cwd) {
      setStates((prev) => {
        const map = new Map(prev);
        const cur = map.get(dir);
        map.set(dir, { ...(cur ?? { loading: false }), open: true });
        return map;
      });
    }
    setCreating({ dir, kind });
  }

  async function commitCreate(name: string): Promise<void> {
    if (!creating) return;
    const { dir, kind } = creating;
    setCreating(null);
    const trimmed = name.trim();
    if (!trimmed) return;
    const res =
      kind === "file"
        ? await window.vibe.fs.createFile(dir, trimmed)
        : await window.vibe.fs.createDir(dir, trimmed);
    if (!res.ok) {
      // silently fail for now
      return;
    }
    await refreshDir(dir);
  }

  async function commitRename(oldPath: string, newName: string): Promise<void> {
    const parent = dirnameOf(oldPath);
    const newPath = parent + (oldPath.includes("\\") ? "\\" : "/") + newName;
    setRenaming(null);
    const res = await window.vibe.fs.rename(oldPath, newPath);
    if (!res.ok) {
      window.alert(`Rename failed: ${res.error}`);
      return;
    }
    await refreshDir(parent);
  }

  return (
    <div className="ftree">
      <div className="ftree__header">
        <span className="ftree__root" title={cwd}>
          {basename(cwd)}
        </span>
        <button
          className="ftree__pick"
          onClick={onPickFolder}
          title="Open another folder"
        >
          open…
        </button>
      </div>
      <div
        className="ftree__body"
        onContextMenu={(e) => {
          e.preventDefault();
          // Only fire when click landed on the body itself (empty area),
          // not bubbled up from a row.
          if (e.target === e.currentTarget) {
            setCtx({ x: e.clientX, y: e.clientY, entry: null, parent: cwd });
          }
        }}
      >
        {error ? <div className="ftree__error">{error}</div> : null}
        {root === null && !error ? (
          <div className="ftree__loading">loading…</div>
        ) : null}
        {creating && creating.dir === cwd ? (
          <div className="ftree__row" style={{ paddingLeft: 8 }}>
            <span className="ftree__chev" />
            {creating.kind === "dir" ? <FolderIcon open={false} /> : <FileIcon />}
            <RenameInput
              initial=""
              onCommit={commitCreate}
              onCancel={() => setCreating(null)}
            />
          </div>
        ) : null}
        {root?.map((e) => (
          <FileNode
            key={e.path}
            entry={e}
            depth={0}
            parent={cwd}
            states={states}
            setStates={setStates}
            onOpenFile={onOpenFile}
            activeFile={activeFile}
            renamingPath={renaming}
            onCommitRename={commitRename}
            onCancelRename={() => setRenaming(null)}
            onContext={setCtx}
            cutPath={cutPath}
            refreshAll={refreshAll}
          />
        ))}
      </div>
      {ctx ? (
        <ContextMenu
          x={ctx.x}
          y={ctx.y}
          items={buildMenuItems(ctx)}
          onClose={() => setCtx(null)}
        />
      ) : null}
    </div>
  );
}
