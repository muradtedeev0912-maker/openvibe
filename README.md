<p align="center">
  <img src="assets/icon.png" width="80" alt="openvibe" />
</p>

<h1 align="center">openvibe</h1>

<p align="center">
  Agentic coding environment. Bring your own model.
</p>

<p align="center">
  <img src="landing/canvas.png" width="700" alt="screenshot" />
</p>

---

## About

openvibe is a desktop application that gives you an AI coding assistant, terminal, code editor, and file manager in one window. Connect any AI model — no vendor lock-in, no subscriptions, no telemetry.

---

## Install

```bash
git clone https://github.com/mttscode/openvibe.git
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

Launch the app → click ⚙ in the sidebar → connect a provider with your API key → done.

Supports: OpenAI, Anthropic, Groq, Google AI, DeepSeek, OpenRouter, Ollama, LM Studio, or any OpenAI-compatible endpoint.

---

## Features

| | |
|---|---|
| **AI Agent** | Reads, writes, edits files and runs commands |
| **Any Model** | OpenAI, Claude, Gemini, Llama, DeepSeek... |
| **Terminal** | Real PowerShell/bash with tabs |
| **Editor** | Monaco (VS Code engine) |
| **File Explorer** | Tree, drag & drop, icons, context menu |
| **Multi-project** | Isolated sessions per project |
| **@-mentions** | Attach files as context |
| **Images** | Paste/drop for vision models |
| **/model** | Switch models on the fly |

---

## Tech

Electron · React · Vite · TypeScript · Monaco · xterm.js · node-pty · JetBrains Mono

---

## License

Code is open for use and modification. UI design is proprietary.  
See [LICENSE](LICENSE).

---

<p align="center">
  mt-studio@bk.ru
</p>
