import React from "react";
import type { VibeConfig } from "../types.js";

function detectProvider(baseUrl: string): string {
  if (baseUrl.includes("openrouter.ai")) return "OpenRouter";
  if (baseUrl.includes("groq.com")) return "Groq";
  if (baseUrl.includes("deepseek.com")) return "DeepSeek";
  if (baseUrl.includes("openai.com")) return "OpenAI";
  if (baseUrl.includes("anthropic.com")) return "Anthropic";
  if (baseUrl.includes("localhost") || baseUrl.includes("127.0.0.1"))
    return "Local";
  try {
    return new URL(baseUrl).hostname;
  } catch {
    return "custom";
  }
}

function username(cwd: string): string {
  // crude but cross-platform: pull the user folder name from the cwd if possible
  const m = /[\\/](?:Users|home)[\\/]([^\\/]+)/i.exec(cwd);
  return m?.[1] ?? "friend";
}

function AsciiLogo(): React.ReactElement {
  return (
    <pre className="banner__ascii" aria-hidden="true">{
`█▀▀█ █▀▀█ █▀▀ █▀▀▄ ▀█ █▀ ▀█▀ █▀▀▄ █▀▀
█  █ █  █ █▀▀ █  █  █▄█  █  █▀▀▄ █▀▀
▀▀▀▀ █▀▀▀ ▀▀▀ ▀  ▀   ▀  ▀▀▀ ▀▀▀  ▀▀▀`
    }</pre>
  );
}

// Pixel grid for the mug. '#' = white, 'o' = orange, '.' = empty.
const MUG = [
  "###############...",
  "#.............#...",
  "#.oo..ooo.o.o.#...",
  "#.o.o.o...o.o.####",
  "#.o.o.ooo.o.o.#..#",
  "#.o.o.o...o.o.####",
  "#.oo..ooo..o..#...",
  "#.............#...",
  "###############...",
];

function classFor(ch: string): string {
  if (ch === "#") return "mc";
  if (ch === "o") return "mo";
  return "me";
}

function Mascot(): React.ReactElement {
  return (
    <div className="banner__mascot" aria-hidden="true">
      {MUG.flatMap((row, r) =>
        Array.from(row).map((ch, c) => (
          <span key={`${r}-${c}`} className={classFor(ch)} />
        )),
      )}
    </div>
  );
}

export function Banner({ config }: { config: VibeConfig }): React.ReactElement {
  const [collapsed, setCollapsed] = React.useState(false);

  return (
    <div className="banner-wrap">
      <div className={"banner" + (collapsed ? " banner--collapsed" : "")}>
        <div className="banner__left">
          <div className="banner__title">
            <span className="banner__title-name">vibe</span>
            <span className="banner__title-version">v0.1.0</span>
          </div>
          <div className="banner__welcome">
            Welcome back, <strong>{username(config.cwd)}</strong>!
          </div>
          <AsciiLogo />
          <div className="banner__model">
            {config.model && config.model !== "none" && config.apiKey ? (
              <>
                {config.model}
                <em>·</em>
                {detectProvider(config.baseUrl)}
              </>
            ) : (
              <span style={{ color: "var(--fg-muted)" }}>No model · No provider</span>
            )}
          </div>
          <div className="banner__cwd" title={config.cwd}>
            {config.cwd}
          </div>
        </div>
      <div className="banner__right">
        <div className="banner__section">Tips for getting started</div>
        <div>
          Type <code>/help</code> to see all slash commands
        </div>
        <div>
          Type <code>/</code> to open the command picker
        </div>
        <div>
          Press <code>Shift+Enter</code> for a new line, <code>Enter</code> to send
        </div>
        <div className="banner__section">Recent activity</div>
        <div className="banner__activity">No recent activity</div>
      </div>
    </div>
      <button
        className={"banner__toggle" + (collapsed ? " banner__toggle--up" : "")}
        onClick={() => setCollapsed(!collapsed)}
        title={collapsed ? "Show banner" : "Hide banner"}
        aria-label="Toggle banner"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M2 8L6 4L10 8" />
        </svg>
      </button>
    </div>
  );
}
