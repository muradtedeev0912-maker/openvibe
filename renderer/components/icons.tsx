import React from "react";

const STROKE = "#888888";
const FILL = "#222222";
const ACCENT = "#c084fc";

export function FolderIcon({ open, name }: { open: boolean; name?: string }): React.ReactElement {
  const icon = name ? getFolderIcon(name, open) : null;
  if (icon) {
    return (
      <img
        className="ftree__img"
        src={`./floder/${icon}`}
        alt=""
        aria-hidden="true"
        draggable={false}
      />
    );
  }
  return (
    <img
      className="ftree__img"
      src={open ? "./floder/folder-open.svg" : "./floder/folder.svg"}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
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
  // JavaScript / TypeScript
  js: "js.svg",
  mjs: "js.svg",
  cjs: "js.svg",
  jsx: "react.svg",
  ts: "ts.svg",
  mts: "ts.svg",
  cts: "ts.svg",
  tsx: "react-ts.svg",
  "d.ts": "ts-types.svg",

  // Web
  html: "code-orange.svg",
  htm: "code-orange.svg",
  css: "code-blue.svg",
  scss: "sass.svg",
  sass: "sass.svg",
  less: "code-purple.svg",
  styl: "stylus.svg",
  stylus: "stylus.svg",

  // Data / Config
  json: "brackets-yellow.svg",
  jsonc: "brackets-yellow.svg",
  json5: "brackets-yellow.svg",
  yaml: "yaml.svg",
  yml: "yaml.svg",
  toml: "gear.svg",
  xml: "xml.svg",
  csv: "csv.svg",
  ini: "gear.svg",
  env: "gear.svg",

  // Markdown / Docs
  md: "markdown.svg",
  mdx: "mdx.svg",
  txt: "text.svg",
  pdf: "pdf.svg",
  doc: "document.svg",
  docx: "document.svg",
  tex: "tex.svg",
  rst: "text.svg",

  // Python
  py: "python.svg",
  pyw: "python.svg",
  pyx: "python.svg",
  pyi: "python.svg",
  ipynb: "notebook.svg",

  // C / C++
  c: "c.svg",
  h: "h.svg",
  cpp: "cplus.svg",
  cc: "cplus.svg",
  cxx: "cplus.svg",
  hpp: "cplus.svg",
  hh: "cplus.svg",

  // C#
  cs: "csharp.svg",
  csx: "csharp.svg",

  // Java / Kotlin / Scala
  java: "java.svg",
  kt: "kotlin.svg",
  kts: "kotlin.svg",
  scala: "scala.svg",
  sbt: "sbt.svg",
  gradle: "gradle.svg",

  // Go
  go: "go.svg",

  // Rust
  rs: "rust.svg",

  // Ruby
  rb: "ruby.svg",
  erb: "ruby.svg",
  gemspec: "ruby.svg",

  // PHP
  php: "php.svg",
  blade: "laravel.svg",

  // Swift / Objective-C
  swift: "swift.svg",
  m: "code-blue.svg",

  // Dart / Flutter
  dart: "dart.svg",

  // Shell
  sh: "shell.svg",
  bash: "shell.svg",
  zsh: "shell.svg",
  fish: "shell.svg",
  ps1: "shell.svg",
  psm1: "shell.svg",
  bat: "shell.svg",
  cmd: "shell.svg",

  // Lua
  lua: "lua.svg",
  luau: "luau.svg",

  // Haskell / Elixir / Erlang / Clojure
  hs: "haskell.svg",
  lhs: "haskell.svg",
  ex: "elixir.svg",
  exs: "elixir.svg",
  erl: "erlang.svg",
  clj: "clojure.svg",
  cljs: "clojure.svg",

  // F# / OCaml
  fs: "fsharp.svg",
  fsx: "fsharp.svg",
  ml: "ocaml.svg",
  mli: "ocaml.svg",

  // Zig / Nim / V / Crystal / D
  zig: "zig.svg",
  nim: "nim.svg",
  v: "v.svg",
  cr: "crystal.svg",
  d: "d.svg",

  // Julia
  jl: "julia.svg",

  // R
  r: "r.svg",
  R: "r.svg",

  // Perl
  pl: "perl.svg",
  pm: "perl.svg",

  // Fortran
  f90: "fortran.svg",
  f95: "fortran.svg",
  f03: "fortran.svg",

  // Solidity
  sol: "solidity.svg",

  // Assembly
  asm: "assembly.svg",
  s: "assembly.svg",

  // CUDA
  cu: "cuda.svg",
  cuh: "cuda.svg",

  // Svelte / Vue / Astro
  svelte: "svelte.svg",
  vue: "vue.svg",
  astro: "astro.svg",

  // Template engines
  pug: "pug.svg",
  haml: "haml.svg",
  njk: "nunjucks.svg",
  twig: "twig.svg",
  liquid: "liquid.svg",

  // GraphQL / Proto
  graphql: "graphql.svg",
  gql: "graphql.svg",
  proto: "proto.svg",

  // Docker
  dockerfile: "docker.svg",

  // Terraform / Nix
  tf: "terraform.svg",
  nix: "nix.svg",

  // SQL / DB
  sql: "database.svg",
  db: "database.svg",
  sqlite: "database.svg",

  // Images
  png: "image.svg",
  jpg: "image.svg",
  jpeg: "image.svg",
  webp: "image.svg",
  bmp: "image.svg",
  ico: "image.svg",
  gif: "gif.svg",
  svg: "svg.svg",

  // Fonts
  ttf: "font.svg",
  otf: "font.svg",
  woff: "font.svg",
  woff2: "font.svg",

  // Audio / Video
  mp3: "audio.svg",
  wav: "audio.svg",
  ogg: "audio.svg",
  flac: "audio.svg",
  mp4: "video.svg",
  mkv: "video.svg",
  avi: "video.svg",
  mov: "video.svg",
  webm: "video.svg",

  // Archives / Executables
  exe: "exe.svg",
  dll: "exe.svg",
  so: "exe.svg",
  lock: "lock.svg",
  patch: "patch.svg",

  // Misc config
  prisma: "prisma.svg",
  http: "http.svg",
  rest: "http.svg",

  // CoffeeScript
  coffee: "coffeescript.svg",

  // Razor
  cshtml: "razor.svg",
  razor: "razor.svg",

  // Pkl
  pkl: "pkl.svg",

  // Rescript
  res: "rescript.svg",
  resi: "rescript-interface.svg",
};

/** Special full-filename matches (case-insensitive) */
const FILENAME_MAP: Record<string, string> = {
  "dockerfile": "docker.svg",
  "docker-compose.yml": "docker.svg",
  "docker-compose.yaml": "docker.svg",
  ".dockerignore": "docker.svg",
  ".gitignore": "git.svg",
  ".gitattributes": "git.svg",
  ".gitmodules": "git.svg",
  "package.json": "node.svg",
  "package-lock.json": "npm.svg",
  "yarn.lock": "yarn.svg",
  "pnpm-lock.yaml": "pnpm.svg",
  "bun.lockb": "bun.svg",
  "tsconfig.json": "tsconfig.svg",
  "jsconfig.json": "tsconfig.svg",
  ".eslintrc": "eslint.svg",
  ".eslintrc.js": "eslint.svg",
  ".eslintrc.json": "eslint.svg",
  "eslint.config.js": "eslint.svg",
  "eslint.config.mjs": "eslint.svg",
  "eslint.config.ts": "eslint.svg",
  ".prettierrc": "prettier.svg",
  ".prettierrc.json": "prettier.svg",
  "prettier.config.js": "prettier.svg",
  "prettier.config.mjs": "prettier.svg",
  "vite.config.ts": "vite.svg",
  "vite.config.js": "vite.svg",
  "vitest.config.ts": "vitest.svg",
  "vitest.config.js": "vitest.svg",
  "webpack.config.js": "webpack.svg",
  "webpack.config.ts": "webpack.svg",
  "next.config.js": "next.svg",
  "next.config.mjs": "next.svg",
  "next.config.ts": "next.svg",
  "nuxt.config.ts": "nuxt.svg",
  "svelte.config.js": "svelte.svg",
  "tailwind.config.js": "tailwind.svg",
  "tailwind.config.ts": "tailwind.svg",
  "postcss.config.js": "postcss.svg",
  "postcss.config.mjs": "postcss.svg",
  ".editorconfig": "editorconfig.svg",
  "license": "license.svg",
  "license.md": "license.svg",
  "licence": "license.svg",
  "licence.md": "license.svg",
  ".babelrc": "babel.svg",
  "babel.config.js": "babel.svg",
  "jest.config.js": "jest.svg",
  "jest.config.ts": "jest.svg",
  ".env": "gear.svg",
  ".env.local": "gear.svg",
  ".env.development": "gear.svg",
  ".env.production": "gear.svg",
  "vercel.json": "vercel.svg",
  "netlify.toml": "netlify.svg",
  "firebase.json": "firebase.svg",
  ".firebaserc": "firebase.svg",
  "nx.json": "nx.svg",
  "turbo.json": "turborepo.svg",
  "biome.json": "biome.svg",
  "deno.json": "deno.svg",
  "deno.jsonc": "deno.svg",
};

function getFileIcon(filename: string): string | null {
  const lower = filename.toLowerCase();

  // Check full filename first
  if (FILENAME_MAP[lower]) return FILENAME_MAP[lower];

  // Check d.ts special case
  if (lower.endsWith(".d.ts")) return ICON_MAP["d.ts"]!;

  // Check test files
  if (/\.(test|spec)\.(ts|tsx)$/i.test(filename)) return "ts-test.svg";
  if (/\.(test|spec)\.(js|jsx)$/i.test(filename)) return "js-test.svg";

  // Check extension
  const dot = filename.lastIndexOf(".");
  if (dot <= 0) return null;
  const ext = filename.slice(dot + 1).toLowerCase();
  return ICON_MAP[ext] ?? null;
}

/** Folder name → icon mapping */
const FOLDER_MAP: Record<string, string> = {
  "src": "folder-src.svg",
  "source": "folder-src.svg",
  "lib": "folder-purple-code.svg",
  "dist": "folder-orange-code.svg",
  "build": "folder-build.svg",
  "out": "folder-orange-code.svg",
  "output": "folder-orange-code.svg",
  "node_modules": "folder-node-modules.svg",
  "public": "folder-green.svg",
  "assets": "folder-assets.svg",
  "static": "folder-assets.svg",
  "images": "folder-images.svg",
  "img": "folder-images.svg",
  "icons": "folder-images.svg",
  "fonts": "folder-fonts.svg",
  "styles": "folder-blue-code.svg",
  "css": "folder-blue-code.svg",
  "scss": "folder-sass.svg",
  "sass": "folder-sass.svg",
  "components": "folder-react.svg",
  "pages": "folder-layout.svg",
  "views": "folder-layout.svg",
  "layouts": "folder-layout.svg",
  "hooks": "folder-hooks.svg",
  "utils": "folder-utils.svg",
  "helpers": "folder-helpers.svg",
  "services": "folder-services.svg",
  "api": "folder-sky-code.svg",
  "routes": "folder-router.svg",
  "router": "folder-router.svg",
  "middleware": "folder-middleware.svg",
  "middlewares": "folder-middleware.svg",
  "models": "folder-models.svg",
  "schemas": "folder-models.svg",
  "types": "folder-interfaces.svg",
  "interfaces": "folder-interfaces.svg",
  "config": "folder-config.svg",
  "configs": "folder-config.svg",
  "constants": "folder-constants.svg",
  "context": "folder-context.svg",
  "contexts": "folder-context.svg",
  "store": "folder-reducer.svg",
  "stores": "folder-reducer.svg",
  "redux": "folder-reducer.svg",
  "state": "folder-reducer.svg",
  "actions": "folder-actions.svg",
  "effects": "folder-effects.svg",
  "reducers": "folder-reducer.svg",
  "selectors": "folder-selector.svg",
  "facades": "folder-facade.svg",
  "providers": "folder-providers.svg",
  "interceptors": "folder-interceptors.svg",
  "guards": "folder-lock.svg",
  "pipes": "folder-pipes.svg",
  "modules": "folder-modules.svg",
  "shared": "folder-shared.svg",
  "common": "folder-shared.svg",
  "core": "folder-core.svg",
  "app": "folder-app.svg",
  "test": "folder-green-code.svg",
  "tests": "folder-green-code.svg",
  "__tests__": "folder-green-code.svg",
  "spec": "folder-green-code.svg",
  "specs": "folder-green-code.svg",
  "e2e": "folder-cypress.svg",
  "cypress": "folder-cypress.svg",
  "scripts": "folder-orange-code.svg",
  "tools": "folder-orange-code.svg",
  "docs": "folder-documents.svg",
  "documentation": "folder-documents.svg",
  "docker": "folder-docker.svg",
  ".docker": "folder-docker.svg",
  "database": "folder-database.svg",
  "db": "folder-database.svg",
  "migrations": "folder-database.svg",
  "seeds": "folder-database.svg",
  "prisma": "folder-prisma.svg",
  "drizzle": "folder-drizzle.svg",
  "graphql": "folder-graphql.svg",
  "i18n": "folder-i18n.svg",
  "locales": "folder-i18n.svg",
  "locale": "folder-i18n.svg",
  "translations": "folder-i18n.svg",
  "android": "folder-android.svg",
  "ios": "folder-ios.svg",
  ".github": "folder-github.svg",
  ".gitlab": "folder-gitlab.svg",
  ".vscode": "folder-vscode.svg",
  ".idea": "folder-purple.svg",
  "electron": "folder-blue-code.svg",
  "renderer": "folder-pink-code.svg",
  "server": "folder-green-code.svg",
  "client": "folder-sky-code.svg",
  "frontend": "folder-sky-code.svg",
  "backend": "folder-green-code.svg",
  "packages": "folder-purple-code.svg",
  "apps": "folder-app.svg",
  "vendor": "folder-gray.svg",
  "temp": "folder-gray.svg",
  "tmp": "folder-gray.svg",
  "cache": "folder-gray.svg",
  ".cache": "folder-gray.svg",
  "logs": "folder-gray.svg",
  "log": "folder-gray.svg",
  "target": "folder-target.svg",
  "release": "folder-orange.svg",
  "debug": "folder-red-code.svg",
  "bin": "folder-orange.svg",
  "obj": "folder-gray.svg",
  "firebase": "folder-firebase.svg",
  ".firebase": "folder-firebase.svg",
  "supabase": "folder-supabase.svg",
  "vercel": "folder-vercel.svg",
  ".vercel": "folder-vercel.svg",
  "nginx": "folder-nginx.svg",
  "aws": "folder-aws.svg",
  "azure": "folder-azure.svg",
  "gradle": "folder-gradle.svg",
  "mongo": "folder-mongo.svg",
  "redis": "folder-redis.svg",
  "mail": "folder-mail.svg",
  "emails": "folder-mail.svg",
  "tauri": "folder-tauri.svg",
  "expo": "folder-expo.svg",
  "storybook": "folder-pink-code.svg",
  ".storybook": "folder-pink-code.svg",
  "landing": "folder-layout.svg",
};

function getFolderIcon(name: string, open: boolean): string | null {
  const lower = name.toLowerCase();
  const icon = FOLDER_MAP[lower];
  if (!icon) return null;
  // Use open variant if available (folder-open.svg is generic, we just use the same icon)
  return icon;
}

export function SidebarToggleIcon(): React.ReactElement {
  return (
    <svg
      width="20"
      height="20"
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
