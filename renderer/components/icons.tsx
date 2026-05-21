import React from "react";

const STROKE = "#888888";
const FILL = "#222222";
const ACCENT = "#c084fc";

export function FolderIcon({
  open,
  name,
}: {
  open: boolean;
  name?: string;
}): React.ReactElement {
  const folderIcon = getFolderIcon(name, open);
  return (
    <img
      className="ftree__img"
      src={`icons/symbols/folders/${folderIcon}`}
      alt=""
      aria-hidden="true"
      draggable={false}
      style={{ width: 16, height: 16 }}
    />
  );
}

export function FileIcon({ name }: { name?: string }): React.ReactElement {
  const icon = name ? getFileIcon(name) : null;
  if (icon) {
    return (
      <img
        className="ftree__img"
        src={`icons/symbols/files/${icon}`}
        alt=""
        aria-hidden="true"
        draggable={false}
        style={{ width: 16, height: 16 }}
      />
    );
  }
  return (
    <img
      className="ftree__img"
      src="icons/symbols/files/document.svg"
      alt=""
      aria-hidden="true"
      draggable={false}
      style={{ width: 16, height: 16 }}
    />
  );
}

const ICON_MAP: Record<string, string> = {
  // Languages & Scripts
  js: "js.svg",
  jsx: "react.svg",
  ts: "ts.svg",
  tsx: "react-ts.svg",
  mjs: "js.svg",
  cjs: "js.svg",
  py: "python.svg",
  pyw: "python.svg",
  c: "c.svg",
  h: "h.svg",
  cpp: "cplus.svg",
  cc: "cplus.svg",
  cxx: "cplus.svg",
  hpp: "h.svg",
  cs: "csharp.svg",
  go: "go.svg",
  rs: "rust.svg",
  java: "java.svg",
  kt: "kotlin.svg",
  kts: "kotlin.svg",
  php: "php.svg",
  rb: "ruby.svg",
  lua: "lua.svg",
  sh: "shell.svg",
  bash: "shell.svg",
  ps1: "shell.svg",
  bat: "shell.svg",
  cmd: "shell.svg",
  zig: "zig.svg",
  nim: "nim.svg",
  swift: "swift.svg",
  dart: "dart.svg",
  scala: "scala.svg",
  elixir: "elixir.svg",
  ex: "elixir.svg",
  exs: "elixir.svg",
  erl: "erlang.svg",
  clj: "clojure.svg",
  cljs: "clojure.svg",
  pl: "perl.svg",
  pm: "perl.svg",
  r: "r.svg",
  sol: "solidity.svg",
  v: "v.svg",
  ocaml: "ocaml.svg",
  ml: "ocaml.svg",
  mli: "ocaml.svg",
  fs: "fsharp.svg",
  fsi: "fsharp.svg",
  fsx: "fsharp.svg",
  fsscript: "fsharp.svg",

  // Web Frameworks & Tools
  vue: "vue.svg",
  svelte: "svelte.svg",
  astro: "astro.svg",
  angular: "angular.svg",
  next: "next.svg",
  nuxt: "nuxt.svg",
  gatsby: "gatsby.svg",
  vite: "vite.svg",
  webpack: "webpack.svg",
  babel: "babel.svg",
  eslint: "eslint.svg",
  prettier: "prettier.svg",
  postcss: "postcss.svg",
  tailwind: "tailwind.svg",
  sass: "sass.svg",
  scss: "sass.svg",
  less: "sass.svg",
  styl: "stylus.svg",
  html: "html.svg",
  css: "css.svg",
  graphql: "graphql.svg",
  gql: "graphql.svg",

  // Data & Config
  json: "code-yellow.svg",
  json5: "code-yellow.svg",
  yaml: "yaml.svg",
  yml: "yaml.svg",
  xml: "xml.svg",
  toml: "gear.svg",
  ini: "gear.svg",
  conf: "gear.svg",
  config: "gear.svg",
  csv: "csv.svg",
  sql: "database.svg",
  prisma: "prisma.svg",
  db: "database.svg",
  sqlite: "database.svg",

  // Documentation
  md: "markdown.svg",
  mdx: "mdx.svg",
  txt: "document.svg",
  pdf: "pdf.svg",
  doc: "document.svg",
  docx: "document.svg",
  rtf: "document.svg",

  // Images & Media
  png: "image.svg",
  jpg: "image.svg",
  jpeg: "image.svg",
  gif: "image.svg",
  webp: "image.svg",
  svg: "svg.svg",
  ico: "image.svg",
  mp4: "video.svg",
  mov: "video.svg",
  avi: "video.svg",
  mp3: "audio.svg",
  wav: "audio.svg",
  flac: "audio.svg",

  // DevOps & Environment
  dockerfile: "docker.svg",
  dockerignore: "docker.svg",
  "docker-compose.yml": "docker.svg",
  "docker-compose.yaml": "docker.svg",
  gitignore: "git.svg",
  gitconfig: "git.svg",
  gitattributes: "git.svg",
  "package.json": "npm.svg",
  "package-lock.json": "npm.svg",
  "yarn.lock": "yarn.svg",
  "pnpm-lock.yaml": "pnpm.svg",
  "pnpm-workspace.yaml": "pnpm.svg",
  "tsconfig.json": "tsconfig.svg",
  "jsconfig.json": "tsconfig.svg",
  "vite.config.ts": "vite.svg",
  "vite.config.js": "vite.svg",
  "next.config.js": "next.svg",
  "next.config.mjs": "next.svg",
  "svelte.config.js": "svelte.svg",
  "tailwind.config.js": "tailwind.svg",
  "tailwind.config.ts": "tailwind.svg",
  "vue.config.js": "vue.svg",
  "webpack.config.js": "webpack.svg",
  "webpack.config.ts": "webpack.svg",
  ".env": "gear.svg",
  ".env.local": "gear.svg",
  ".env.development": "gear.svg",
  ".env.production": "gear.svg",
  ".editorconfig": "editorconfig.svg",
  "vercel.json": "vercel.svg",
  "netlify.toml": "netlify.svg",
  procfile: "gear.svg",

  // Misc
  exe: "exe.svg",
  bin: "exe.svg",
  patch: "patch.svg",
  diff: "patch.svg",
  lock: "lock.svg",
  license: "license.svg",
  copying: "license.svg",
};

function getFileIcon(filename: string): string | null {
  // Check full filename first (for package.json etc)
  if (ICON_MAP[filename.toLowerCase()]) return ICON_MAP[filename.toLowerCase()];

  const dot = filename.lastIndexOf(".");
  if (dot <= 0) return null;
  const ext = filename.slice(dot + 1).toLowerCase();
  return ICON_MAP[ext] ?? null;
}

const FOLDER_MAP: Record<string, string> = {
  // Common
  src: "folder-src.svg",
  public: "folder-assets.svg",
  assets: "folder-assets.svg",
  static: "folder-assets.svg",
  images: "folder-images.svg",
  img: "folder-images.svg",
  fonts: "folder-fonts.svg",
  icons: "folder-images.svg",

  // Development
  node_modules: "folder-node-modules.svg",
  components: "folder-app.svg",
  ui: "folder-app.svg",
  views: "folder-app.svg",
  pages: "folder-app.svg",
  layouts: "folder-layout.svg",
  utils: "folder-utils.svg",
  helpers: "folder-helpers.svg",
  hooks: "folder-hooks.svg",
  services: "folder-services.svg",
  api: "folder-core.svg",
  controllers: "folder-core.svg",
  models: "folder-models.svg",
  schemas: "folder-models.svg",
  types: "folder-interfaces.svg",
  interfaces: "folder-interfaces.svg",
  context: "folder-context.svg",
  providers: "folder-providers.svg",
  store: "folder-reducer.svg",
  redux: "folder-reducer.svg",
  actions: "folder-actions.svg",
  reducers: "folder-reducer.svg",
  selectors: "folder-selector.svg",
  effects: "folder-effects.svg",
  middleware: "folder-middleware.svg",
  interceptors: "folder-interceptors.svg",
  router: "folder-router.svg",
  routes: "folder-router.svg",

  // Styles
  styles: "folder-sass.svg",
  css: "folder-sass.svg",
  scss: "folder-sass.svg",
  sass: "folder-sass.svg",
  less: "folder-sass.svg",

  // Build & Config
  scripts: "folder-build.svg",
  dist: "folder-build.svg",
  build: "folder-build.svg",
  out: "folder-build.svg",
  target: "folder-target.svg",
  bin: "folder-build.svg",
  config: "folder-config.svg",
  configs: "folder-config.svg",
  settings: "folder-config.svg",
  ".vscode": "folder-vscode.svg",
  ".github": "folder-github.svg",
  ".git": "folder-github.svg",
  ".husky": "folder-config.svg",

  // Testing
  tests: "folder-cypress.svg",
  test: "folder-cypress.svg",
  __tests__: "folder-cypress.svg",
  spec: "folder-cypress.svg",
  specs: "folder-cypress.svg",
  cypress: "folder-cypress.svg",

  // Backend & Cloud
  database: "folder-database.svg",
  db: "folder-database.svg",
  sql: "folder-database.svg",
  prisma: "folder-prisma.svg",
  docker: "folder-docker.svg",
  aws: "folder-aws.svg",
  azure: "folder-azure.svg",
  vercel: "folder-vercel.svg",
  supabase: "folder-supabase.svg",
  firebase: "folder-firebase.svg",

  // Platforms
  android: "folder-android.svg",
  ios: "folder-ios.svg",
  app: "folder-app.svg",

  // Documentation
  docs: "folder-documents.svg",
  doc: "folder-documents.svg",
  markdown: "folder-documents.svg",

  // Misc
  temp: "folder-gray.svg",
  tmp: "folder-gray.svg",
  cache: "folder-gray.svg",
  logs: "folder-gray.svg",
  archive: "folder-gray.svg",
};

function getFolderIcon(name: string | undefined, open: boolean): string {
  if (open) return "folder-open.svg";
  if (!name) return "folder.svg";

  const lowerName = name.toLowerCase();
  return FOLDER_MAP[lowerName] ?? "folder.svg";
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

export function ChevronRightIcon({
  open,
  className,
}: {
  open?: boolean;
  className?: string;
}): React.ReactElement {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{
        transform: open ? "rotate(90deg)" : "rotate(0deg)",
        transition: "transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
      }}
      aria-hidden="true"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

export function CollapseAllIcon(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path fillRule="evenodd" clipRule="evenodd" d="M9 14H2V7h7v7zm-1-1V8H3v5h5zm6-5h-1V3H4V2h9.5l.5.5v5.5zM4 11h4v-1H4v1z"/>
    </svg>
  );
}

export function NewFileIcon(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path fillRule="evenodd" clipRule="evenodd" d="M9.5 1.1l3.4 3.5.1.4v9l-.5.5h-5v-1h4.5V6H8V1.5H3v5H2v-5l.5-.5h7zM9 2.2V5h2.8L9 2.2zM3 10H2v2H0v1h2v2h1v-2h2v-1H3v-2z" />
    </svg>
  );
}

export function NewFolderIcon(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path fillRule="evenodd" clipRule="evenodd" d="M14.5 4h-5.2l-1.7-1.7-.3-.3H2.5l-.5.5v5h1v-4.5h4.2l1.7 1.7.3.3h4.8v8H7v1h7.5l.5-.5v-9l-.5-.5zM3 10H2v2H0v1h2v2h1v-2h2v-1H3v-2z" />
    </svg>
  );
}

export function RefreshIcon(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path fillRule="evenodd" clipRule="evenodd" d="M12.936 4.02l-1.34-1.34.708-.707 2.121 2.121a.5.5 0 0 1 0 .707l-2.121 2.122-.708-.707 1.258-1.258a5.5 5.5 0 1 0 2.123 5.48h1a6.5 6.5 0 1 1-2.981-6.42l-.06-.002h.001z"/>
    </svg>
  );
}
