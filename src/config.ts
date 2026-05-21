import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Config } from "./types.js";

/** Load .env-style file (KEY=VALUE per line) into process.env without overriding. */
function loadDotenv(path: string): void {
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

export function loadConfig(opts: { autoApprove: boolean }): Config {
  // Project .env first, then user-level ~/.vibe/config
  loadDotenv(join(process.cwd(), ".env"));
  loadDotenv(join(homedir(), ".vibe", "config"));

  // Provider auto-detection priority: VIBE_* > OPENAI_* > GOOGLE_AI_KEY > GROQ_API_KEY
  let apiKey = process.env.VIBE_API_KEY ?? process.env.OPENAI_API_KEY ?? "";
  let baseUrl =
    process.env.VIBE_BASE_URL ?? process.env.OPENAI_BASE_URL ?? "";
  let model = process.env.VIBE_MODEL ?? "";

  if (!apiKey && process.env.GOOGLE_AI_KEY) {
    apiKey = process.env.GOOGLE_AI_KEY;
    if (!baseUrl) baseUrl = "https://generativelanguage.googleapis.com/v1beta/openai";
    if (!model) model = "gemini-2.0-flash";
  }

  if (!apiKey && process.env.GROQ_API_KEY) {
    apiKey = process.env.GROQ_API_KEY;
    if (!baseUrl) baseUrl = "https://api.groq.com/openai/v1";
    if (!model) model = "llama-3.1-8b-instant";
  }

  if (!baseUrl) baseUrl = "https://api.openai.com/v1";
  if (!model) model = "gpt-4o-mini";

  if (!apiKey) {
    // No key configured — app will start but agent won't work until
    // user connects a provider through Settings UI.
    return {
      apiKey: "",
      baseUrl: baseUrl || "https://api.openai.com/v1",
      model: model || "none",
      cwd: process.cwd(),
      autoApprove: opts.autoApprove,
    };
  }

  return {
    apiKey,
    baseUrl: baseUrl.replace(/\/+$/, ""),
    model,
    cwd: process.cwd(),
    autoApprove: opts.autoApprove,
  };
}
