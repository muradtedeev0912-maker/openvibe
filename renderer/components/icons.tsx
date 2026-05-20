import React from "react";

const STROKE = "#888888";
const FILL = "#222222";
const ACCENT = "#c084fc";

export function FolderIcon({ open }: { open: boolean }): React.ReactElement {
  if (open) {
    return (
      <svg
        className="ftree__svg"
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M1.5 4.5h4l1.5 1.5h7.5v7a1 1 0 0 1-1 1h-12a1 1 0 0 1-1-1v-8.5z"
          fill={FILL}
          stroke={STROKE}
          strokeLinejoin="round"
        />
        <path
          d="M2 14l2-6h11.5l-2 6z"
          fill={FILL}
          stroke={ACCENT}
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg
      className="ftree__svg"
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M1.5 4.5h4l1.5 1.5h7.5v7a1 1 0 0 1-1 1h-12a1 1 0 0 1-1-1v-8.5z"
        fill={FILL}
        stroke={ACCENT}
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function FileIcon({ name }: { name?: string }): React.ReactElement {
  const icon = name ? getFileIcon(name) : null;
  if (icon) {
    return (
      <img
        className="ftree__img"
        src={`./img/${icon}`}
        alt=""
        aria-hidden="true"
        draggable={false}
      />
    );
  }
  return (
    <svg
      className="ftree__svg"
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M3 1.5h6.5L13 5v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V2.5a1 1 0 0 1 1-1z"
        fill={FILL}
        stroke={STROKE}
        strokeLinejoin="round"
      />
      <path
        d="M9.5 1.5V5h3.5"
        stroke={STROKE}
        fill="none"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const ICON_MAP: Record<string, string> = {
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

function getFileIcon(filename: string): string | null {
  const dot = filename.lastIndexOf(".");
  if (dot <= 0) return null;
  const ext = filename.slice(dot + 1).toLowerCase();
  return ICON_MAP[ext] ?? null;
}

export function SidebarToggleIcon(): React.ReactElement {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <line x1="9" y1="5" x2="9" y2="19" />
    </svg>
  );
}
