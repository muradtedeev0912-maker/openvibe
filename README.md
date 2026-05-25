<div align="center">

![openvibe](renderer/public/canvas5.png)

<br />

<img src="assets/icon.png" width="72" alt="openvibe icon" />

# openvibe

Open-source agentic coding IDE. Bring your own AI model.

A desktop-native alternative to Cursor and Claude Code. Works with any OpenAI-compatible endpoint. MIT licensed. No telemetry, no account.

[Download](https://github.com/muradtedeev0912-maker/openvibe/releases) · [Website](https://openvibe-beta.vercel.app) · [Updates](https://openvibe-beta.vercel.app/updates.html)

</div>

---

## Quick start

```bash
git clone https://github.com/muradtedeev0912-maker/openvibe.git
cd openvibe
npm install && npm run build && npm start
```

Open Settings, connect a provider (OpenAI, Anthropic, Groq, DeepSeek, Gemini, Ollama, OpenRouter, LM Studio, vLLM, GitHub Models, or any OpenAI-compatible endpoint).

## Features

- Agentic AI that reads, writes, edits files and runs commands.
- Bring your own model. Any OpenAI-compatible API. Local models via Ollama and LM Studio.
- Plan mode with two-model orchestration: a heavy planner produces a structured plan, a fast executor implements each step.
- Project rules in `vibe/` and `.vibe/` auto-loaded as mandatory instructions for every conversation.
- Skills: per-project long-lived knowledge taught via `#skills` + attached `.md`/`.txt` files.
- MCP support (Model Context Protocol) for external tools — GitHub, databases, browsers.
- Monaco editor with file tabs, breadcrumbs, autosave, 230+ file icons.
- Integrated terminal with PowerShell, cmd, or bash. Multiple tabs.
- Multi-project workspace with isolated sessions and per-project chat history.
- Project templates: React, Next.js, Vue 3, Express, Flask, Electron, Telegram Bot.
- Project snapshots: one-click zip backup.
- Markdown and LaTeX rendering with KaTeX. Output sanitized against XSS.
- Web search tool for current documentation and information.

## What's new in 0.3.5

- Plan mode rebuilt around a Discovery → Analysis → Strategy → Risk-review process. Each step has explicit Done-criteria.
- Two-model orchestration: separate Plan and Coding models in the composer. The app switches to the planner for the strategy turn and back to the executor for code.
- Executor sees the full plan with each step marked done, pending, or current. No re-doing past work, no eating into future steps.
- `vibe/` and `.vibe/` rules auto-loaded with the same authority as the system prompt. Five-point injection (system, dedicated rule message, per-turn reminder, pre-user reminder, post-user final guard) so the model cannot ignore them.
- Skills system: send `#skills` with attached `.md`/`.txt` files to teach the AI long-lived per-project knowledge.
- Security: DOMPurify sanitization on rendered markdown, validated `openExternal`, strict navigation policy, blocked unauthorized popups.
- UI: serif typography for the empty-chat title, plan steps redesigned with a chevron run button and rounded hover state.

## Comparison

| Feature | openvibe | Cursor | Claude Code |
|---|---|---|---|
| Open source | MIT | No | No |
| Free | Yes | $20/mo | $20/mo |
| Bring your own model | Any | Limited | Claude only |
| Two-model Plan + Code | Yes | No | No |
| Local models (Ollama) | Yes | Limited | No |
| MCP support | Yes | Yes | Yes |
| Desktop app | Yes | Yes | CLI only |
| Integrated terminal | Yes | Yes | Yes |
| Monaco editor | Yes | Yes | No |
| Project templates | Yes | No | No |
| Snapshots | Yes | No | No |
| Project rules with hard authority | Yes | Limited | Limited |
| Skills (per-project knowledge) | Yes | No | No |
| Vendor lock-in | No | Yes | Yes |
| Telemetry | None | Yes | Yes |
| Account required | No | Yes | Yes |

## Models supported

Any OpenAI-compatible API. Verified with:

- OpenAI: GPT-4o, GPT-4o-mini, o1
- Anthropic Claude 3.5 Sonnet via proxy
- Google Gemini 1.5 Pro and Flash
- Groq: Llama 3.3, Mixtral
- DeepSeek-V3, DeepSeek-R1
- Ollama: Llama, Qwen, Mistral, and other local models
- LM Studio, vLLM, OpenRouter, GitHub Models

## Plan mode

A two-model workflow for non-trivial work. The planner thinks, the executor implements.

1. Toggle Plan in the composer.
2. Pick a Plan model (the deep reasoner) and a Coding model (the fast implementer) in the model picker.
3. Send the request. openvibe switches to the planner, receives a structured plan with discovery, assumptions, ordered steps, and Done-criteria, then switches back to the executor.
4. Open the Plan panel. Click the run arrow next to any step. The executor receives the full plan plus the current step and implements it end-to-end. Run steps individually or in sequence.

The planner cannot edit files. The executor cannot re-plan.

## Project rules (`vibe/` and `.vibe/`)

Any `.md` or `.txt` file in `vibe/` or `.vibe/` is auto-loaded into every conversation in that project as a mandatory rule.

```markdown
# Project Rules

- Use TypeScript only, no JavaScript
- camelCase for variables, PascalCase for classes
- async/await, no .then()
- Tailwind CSS, no CSS-in-JS
```

Rules are injected at five points in the model's context — system prompt, dedicated rule message, per-turn reminder, pre-user reminder, post-user final guard — so the model cannot ignore them in long sessions.

## Skills

Per-project long-lived knowledge. Send a chat message containing `#skills` with one or more `.md`/`.txt` files attached:

```
#skills
(attach: api-conventions.md, deployment.md)
```

The file contents become mandatory ground truth for the project. Toggle each skill on or off in the Skills panel. Skills persist across chats and sessions.

## Build from source

```bash
npm install
npm run build
npm start
```

Development mode with hot reload:

```bash
npm run dev
```

## Contributing

Pull requests welcome. Open an issue first for larger changes.

## License

MIT.

---

<div align="center">

Built by [Murad](https://github.com/muradtedeev0912-maker)

</div>
