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
  expandToPath?: string | null;
  onExpandDone?: () => void;
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
  creating: { dir: string; kind: "file" | "dir" } | null;
  onCommitCreate: (name: string) => void;
  onCancelCreate: () => void;
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
    creating,
    onCommitCreate,
    onCancelCreate,
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
      // Refresh all and expand the target folder to show the moved item
      await refreshAll();
      // Force-expand the target folder
      const listRes = await window.vibe.fs.list(entry.path);
      if (listRes.ok) {
        setStates((prev) => {
          const map = new Map(prev);
          map.set(entry.path, { open: true, loading: false, children: listRes.entries });
          return map;
        });
      }
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
        <span className={"ftree__chev" + (entry.isDir && open ? " ftree__chev--open" : "")}>
          {entry.isDir ? "›" : ""}
        </span>
        {entry.isDir ? <FolderIcon open={open} name={entry.name} /> : <FileIcon name={entry.name} />}
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
        ? <>
            {creating && creating.dir === entry.path ? (
              <div className="ftree__row" style={{ paddingLeft: 8 + (depth + 1) * 12 }}>
                <span className="ftree__chev" />
                {creating.kind === "dir" ? <FolderIcon open={false} name="" /> : <FileIcon />}
                <RenameInput
                  initial=""
                  onCommit={onCommitCreate}
                  onCancel={onCancelCreate}
                />
              </div>
            ) : null}
            {state.children.map((c) => (
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
                creating={creating}
                onCommitCreate={onCommitCreate}
                onCancelCreate={onCancelCreate}
              />
            ))}
          </>
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
  expandToPath,
  onExpandDone,
}: RootProps): React.ReactElement {
  const [root, setRoot] = useState<FsEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [states, setStates] = useState<Map<string, NodeState>>(new Map());
  const [ctx, setCtx] = useState<CtxState | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [cutPath, setCutPath] = useState<string | null>(null);
  const [copyPath, setCopyPath] = useState<string | null>(null);
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

  // Expand to a specific path when requested from breadcrumb
  useEffect(() => {
    if (!expandToPath) return;
    (async () => {
      // Get relative path segments from cwd to expandToPath
      const rel = expandToPath.startsWith(cwd)
        ? expandToPath.slice(cwd.length).replace(/^[\\/]/, "")
        : "";
      if (!rel) { onExpandDone?.(); return; }
      const sep = expandToPath.includes("\\") ? "\\" : "/";
      const parts = rel.split(/[\\/]/).filter(Boolean);
      // Expand each folder in the path
      let current = cwd;
      for (const part of parts) {
        current = current + sep + part;
        const existing = states.get(current);
        if (!existing?.children) {
          const res = await window.vibe.fs.list(current);
          if (res.ok) {
            setStates((prev) => {
              const map = new Map(prev);
              map.set(current, { open: true, loading: false, children: res.entries });
              return map;
            });
          }
        } else {
          setStates((prev) => {
            const map = new Map(prev);
            map.set(current, { ...existing, open: true });
            return map;
          });
        }
      }
      onExpandDone?.();
    })();
  }, [expandToPath]);

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
        ...((cutPath || copyPath) ? [
          { label: "-", onClick: () => {} },
          {
            label: "Paste",
            shortcut: "Ctrl+V",
            onClick: async () => {
              const srcPath = cutPath || copyPath;
              if (!srcPath) return;
              const srcName = srcPath.split(/[\\/]/).pop() ?? srcPath;
              const sep = srcPath.includes("\\") ? "\\" : "/";
              let destPath = parent + sep + srcName;
              if (cutPath) {
                if (srcPath === destPath) return;
                const res = await window.vibe.fs.rename(srcPath, destPath);
                if (res.ok) { setCutPath(null); await refreshAll(); }
              } else {
                if (srcPath === destPath) {
                  const dot = srcName.lastIndexOf(".");
                  const name = dot > 0 ? srcName.slice(0, dot) : srcName;
                  const ext = dot > 0 ? srcName.slice(dot) : "";
                  destPath = parent + sep + name + " - Copy" + ext;
                }
                const res = await window.vibe.fs.copy(srcPath, destPath);
                if (res.ok) { setCopyPath(null); await refreshAll(); }
              }
            },
          },
        ] : []),
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
          ...((cutPath || copyPath) ? [{
            label: "Paste here",
            onClick: async () => {
              const srcPath = cutPath || copyPath;
              if (!srcPath) return;
              const srcName = srcPath.split(/[\\/]/).pop() ?? srcPath;
              const sep = srcPath.includes("\\") ? "\\" : "/";
              let destPath = entry.path + sep + srcName;
              if (cutPath) {
                if (srcPath === destPath) return;
                const res = await window.vibe.fs.rename(srcPath, destPath);
                if (res.ok) { setCutPath(null); await refreshAll(); }
              } else {
                // If pasting into same folder, add " - Copy" suffix
                if (srcPath === destPath) {
                  const dot = srcName.lastIndexOf(".");
                  const name = dot > 0 ? srcName.slice(0, dot) : srcName;
                  const ext = dot > 0 ? srcName.slice(dot) : "";
                  destPath = entry.path + sep + name + " - Copy" + ext;
                }
                const res = await window.vibe.fs.copy(srcPath, destPath);
                if (res.ok) { setCopyPath(null); await refreshAll(); }
              }
            },
          }] : []),
          { label: "-", onClick: () => {} },
        ]
      : [];

    return [
      ...dirItems,
      {
        label: "Cut",
        shortcut: "Ctrl+X",
        onClick: () => { setCutPath(entry.path); setCopyPath(null); },
      },
      {
        label: "Copy",
        shortcut: "Ctrl+C",
        onClick: () => { setCopyPath(entry.path); setCutPath(null); window.vibe.clipboard.writeText(entry.path); },
      },
      ...((cutPath || copyPath) ? [{
        label: "Paste",
        shortcut: "Ctrl+V",
        onClick: async () => {
          const srcPath = cutPath || copyPath;
          if (!srcPath) return;
          const srcName = srcPath.split(/[\\/]/).pop() ?? srcPath;
          const sep = srcPath.includes("\\") ? "\\" : "/";
          const destDir = entry.isDir ? entry.path : parent;
          let destPath = destDir + sep + srcName;
          if (cutPath) {
            if (srcPath === destPath) return;
            const res = await window.vibe.fs.rename(srcPath, destPath);
            if (res.ok) { setCutPath(null); await refreshAll(); }
          } else {
            if (srcPath === destPath) {
              const dot = srcName.lastIndexOf(".");
              const name = dot > 0 ? srcName.slice(0, dot) : srcName;
              const ext = dot > 0 ? srcName.slice(dot) : "";
              destPath = destDir + sep + name + " - Copy" + ext;
            }
            const res = await window.vibe.fs.copy(srcPath, destPath);
            if (res.ok) { setCopyPath(null); await refreshAll(); }
          }
        },
      }] : []),
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
      const cur = states.get(dir);
      if (!cur?.children) {
        // Load children first
        setStates((prev) => {
          const map = new Map(prev);
          map.set(dir, { open: true, loading: true });
          return map;
        });
        const res = await window.vibe.fs.list(dir);
        setStates((prev) => {
          const map = new Map(prev);
          if (res.ok) {
            map.set(dir, { open: true, loading: false, children: res.entries });
          } else {
            map.set(dir, { open: true, loading: false, error: res.error });
          }
          return map;
        });
      } else {
        setStates((prev) => {
          const map = new Map(prev);
          map.set(dir, { ...cur, open: true });
          return map;
        });
      }
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
        <div className="ftree__actions">
          <button className="ftree__action" title="New file" onClick={() => promptCreate(cwd, "file")}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 1.5H5a1.5 1.5 0 0 0-1.5 1.5v10A1.5 1.5 0 0 0 5 14.5h6A1.5 1.5 0 0 0 12.5 13V5L9 1.5z"/>
              <path d="M9 1.5V5h3.5"/>
              <circle cx="4.5" cy="12.5" r="2.5" fill="var(--bg)" strokeWidth="1"/>
              <path d="M4.5 11v3M3 12.5h3" strokeWidth="1.2"/>
            </svg>
          </button>
          <button className="ftree__action" title="New folder" onClick={() => promptCreate(cwd, "dir")}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1.5 4h4l1 1.5h6a1 1 0 0 1 1 1v5.5a1 1 0 0 1-1 1H5"/>
              <path d="M1.5 4v7a1 1 0 0 0 1 1h1"/>
              <circle cx="11.5" cy="12.5" r="2.5" fill="var(--bg)" strokeWidth="1"/>
              <path d="M11.5 11v3M10 12.5h3" strokeWidth="1.2"/>
            </svg>
          </button>
          <button className="ftree__action" title="Refresh" onClick={() => refreshAll()}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 3v3h-3"/>
              <path d="M3 8a5 5 0 0 1 8.5-3.5L13 6"/>
              <path d="M3 13v-3h3"/>
              <path d="M13 8a5 5 0 0 1-8.5 3.5L3 10"/>
            </svg>
          </button>
          <button className="ftree__action" title="Collapse all" onClick={() => setStates(new Map())}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 10h3v3"/>
              <path d="M12 6h-3V3"/>
              <path d="M9 6l5-5"/>
              <path d="M2 15l5-5"/>
            </svg>
          </button>
        </div>
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
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes("application/x-vibe-path")) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        }}
        onDrop={async (e) => {
          const srcPath = e.dataTransfer.getData("application/x-vibe-path");
          if (!srcPath) return;
          e.preventDefault();
          const srcName = srcPath.split(/[\\/]/).pop() ?? srcPath;
          const sep = srcPath.includes("\\") ? "\\" : "/";
          const destPath = cwd + sep + srcName;
          if (srcPath === destPath) return;
          const res = await window.vibe.fs.rename(srcPath, destPath);
          if (res.ok) await refreshAll();
        }}
      >
        {error ? <div className="ftree__error">{error}</div> : null}
        {root === null && !error ? (
          <div className="ftree__loading">loading…</div>
        ) : null}
        {creating && creating.dir === cwd ? (
          <div className="ftree__row" style={{ paddingLeft: 8 }}>
            <span className="ftree__chev" />
            {creating.kind === "dir" ? <FolderIcon open={false} name="" /> : <FileIcon />}
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
            creating={creating}
            onCommitCreate={commitCreate}
            onCancelCreate={() => setCreating(null)}
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
