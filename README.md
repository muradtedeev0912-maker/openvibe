<p align="center">
  <img src="assets/icon.png" width="80" alt="openvibe" />
</p>

<h1 align="center">openvibe</h1>

<p align="center">
  Open-source agentic coding environment. Bring your own AI model.
</p>

<p align="center">
  <a href="https://openvibe-beta.vercel.app">Website</a> · <a href="https://github.com/muradtedeev0912-maker/openvibe/releases">Download</a> · <a href="https://openvibe-beta.vercel.app/updates.html">Changelog</a>
</p>

---

## About

openvibe is a desktop IDE with a built-in AI agent. It combines a code editor, terminal, file manager, and AI assistant in one window. Connect any model — no vendor lock-in, no subscriptions, no telemetry.

---

## Install

```bash
git clone https://github.com/muradtedeev0912-maker/openvibe.git
cd openvibe
npm install
```

---

## Run

```bash
# Development (hot reload)
node scripts/dev.js

# Production
npm run build
npm start
```

---

## Setup

Launch the app → click the gear icon in the sidebar → connect a provider with your API key → done.

Supports: OpenAI, Anthropic, Groq, Google AI, DeepSeek, OpenRouter, Ollama, LM Studio, or any OpenAI-compatible endpoint.

---

## Features

### AI Agent
- Reads, writes, edits files and runs commands autonomously
- Web search — AI can look up information online
- Style learning — adapts to your coding patterns over time
- Auto project context — reads package.json and README on startup
- Smart detection — distinguishes coding tasks from conversational questions
- Stop button to abort mid-generation
- Response time and token usage tracking

### MCP (Model Context Protocol)
- Connect external tools: GitHub, databases, browsers, and more
- Add/remove/connect servers from the UI
- Environment variable support for auth tokens
- Tools auto-register with the agent

### Project Templates
- `/new` command scaffolds full projects from built-in templates
- React+Vite, Next.js, Express, Flask, Electron, Telegram Bot, Discord Bot, Vue 3

### Editor
- Monaco (VS Code engine) with syntax highlighting
- Multiple file tabs
- Breadcrumb path navigation
- Autosave (2 second debounce)
- Resizable panel with drag divider

### File Explorer
- 230+ file icons, 100+ folder icons
- Drag & drop between folders
- Copy/paste files
- Context menu: new file, new folder, rename, delete
- Header actions: new file, new folder, refresh, collapse all

### Terminal
- Real PowerShell/bash PTY with multiple tabs
- Works simultaneously with the editor
- Resizable height

### Chat
- Full Markdown rendering (headers, lists, code blocks, tables)
- LaTeX math rendering with KaTeX
- Diff view for file edits (red/green)
- Revert button to undo AI changes
- Click to copy any message
- Expandable tool output

### Multi-project
- Isolated sessions, terminal, and editor per project
- Per-project state persistence (tabs, sizes, visibility)
- Unlimited projects

### Project Snapshots
- One-click zip backup of the entire project
- Excludes node_modules, .git, dist
- List and access snapshots from any project

### Other
- App launches maximized
- @-mentions for files and folders
- Image paste/drop for vision models
- `/model` to switch models on the fly
- Toast notifications
- Animated thinking indicator

---

## Tech Stack

Electron · React 18 · Vite · TypeScript · Monaco Editor · xterm.js · node-pty · KaTeX · marked · JetBrains Mono

---

## Slash Commands

| Command | Description |
|---------|-------------|
| `/help` | Show all commands |
| `/clear` | Clear conversation |
| `/model` | Switch AI model |
| `/new` | Create project from template |
| `/cwd` | Print working directory |
| `/exit` | Quit |

---

## License

Code is open for use and modification. UI design is proprietary.  
See [LICENSE](LICENSE).

---

<p align="center">
  mt-studio@bk.ru · <a href="https://t.me/xmxqb">Telegram</a>
</p>



