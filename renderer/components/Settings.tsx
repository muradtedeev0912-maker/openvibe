import React, { useEffect, useState } from "react";

interface Provider {
  id: string;
  name: string;
  description: string;
  baseUrl: string;
  connected: boolean;
  apiKey: string;
  model: string;
}

const PROVIDER_TEMPLATES = [
  { name: "Anthropic", description: "Claude models — Opus, Sonnet, Haiku", baseUrl: "https://api.anthropic.com/v1" },
  { name: "OpenAI", description: "GPT-4o, o1, o3", baseUrl: "https://api.openai.com/v1" },
  { name: "Google AI", description: "Gemini 2.5, 1M context", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai" },
  { name: "Groq", description: "Ultra-fast — Llama, Mixtral", baseUrl: "https://api.groq.com/openai/v1" },
  { name: "OpenRouter", description: "100+ models, free tier available", baseUrl: "https://openrouter.ai/api/v1" },
  { name: "DeepSeek", description: "V4 Flash, R1 reasoning", baseUrl: "https://api.deepseek.com/v1" },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function Settings({ open, onClose }: Props): React.ReactElement | null {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [editing, setEditing] = useState<{ template: typeof PROVIDER_TEMPLATES[0] | null; custom: boolean } | null>(null);
  const [form, setForm] = useState({ apiKey: "", model: "", baseUrl: "", name: "" });

  useEffect(() => {
    const saved = localStorage.getItem("vibe_providers");
    if (saved) {
      try { setProviders(JSON.parse(saved)); } catch { /* */ }
    }
  }, [open]);

  function save(updated: Provider[]): void {
    setProviders(updated);
    localStorage.setItem("vibe_providers", JSON.stringify(updated));
  }

  function startConnect(template: typeof PROVIDER_TEMPLATES[0]): void {
    setEditing({ template, custom: false });
    setForm({ apiKey: "", model: "", baseUrl: template.baseUrl, name: template.name });
  }

  function startCustom(): void {
    setEditing({ template: null, custom: true });
    setForm({ apiKey: "", model: "", baseUrl: "https://", name: "" });
  }

  function confirmConnect(): void {
    if (!form.apiKey.trim()) return;
    const id = `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const newP: Provider = {
      id,
      name: form.name || (editing?.template?.name ?? "Custom"),
      description: editing?.template?.description ?? form.baseUrl,
      baseUrl: form.baseUrl,
      connected: true,
      apiKey: form.apiKey,
      model: form.model,
    };
    const updated = [...providers, newP];
    save(updated);
    // Apply as active
    window.vibe.setProvider(newP.apiKey, newP.baseUrl, newP.model);
    setEditing(null);
  }

  function disconnect(id: string): void {
    save(providers.filter((p) => p.id !== id));
  }

  function activate(p: Provider): void {
    window.vibe.setProvider(p.apiKey, p.baseUrl, p.model);
  }

  if (!open) return null;

  const connected = providers.filter((p) => p.connected);

  return (
    <div className="settings__overlay" onClick={onClose}>
      <div className="settings" onClick={(e) => e.stopPropagation()}>
        <div className="settings__header">
          <h2>Settings</h2>
          <button className="settings__close" onClick={onClose}>×</button>
        </div>

        {editing ? (
          <div className="settings__form">
            <button className="settings__back" onClick={() => setEditing(null)}>← Back</button>
            <h3 className="settings__form-title">
              {editing.custom ? "Custom provider" : `Connect ${editing.template?.name}`}
            </h3>
            {editing.custom ? (
              <>
                <label className="settings__label">
                  Name
                  <input className="settings__input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="My provider" />
                </label>
                <label className="settings__label">
                  Base URL
                  <input className="settings__input" value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} placeholder="https://api.example.com/v1" />
                </label>
              </>
            ) : null}
            <label className="settings__label">
              API Key
              <input className="settings__input" type="password" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} placeholder="sk-..." />
            </label>
            <label className="settings__label">
              Model
              <input className="settings__input" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="model-id (e.g. gpt-4o)" />
              <span className="settings__hint">Required. This will appear in /model list.</span>
            </label>
            <button className="settings__save" onClick={confirmConnect} disabled={!form.apiKey.trim() || !form.model.trim()}>
              Connect
            </button>
          </div>
        ) : (
          <>
            {connected.length > 0 ? (
              <div className="settings__section">
                <h3 className="settings__section-title">Connected</h3>
                {connected.map((p) => (
                  <div key={p.id} className="settings__row">
                    <div className="settings__row-info">
                      <div className="settings__row-name">
                        {p.name}
                        <span className="settings__model-tag">{p.model}</span>
                      </div>
                      <div className="settings__row-desc">{p.baseUrl}</div>
                    </div>
                    <div className="settings__row-actions">
                      <button className="settings__use" onClick={() => activate(p)}>Use</button>
                      <button className="settings__disconnect" onClick={() => disconnect(p.id)}>×</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="settings__section">
              <h3 className="settings__section-title">Add provider</h3>
              {PROVIDER_TEMPLATES.map((t) => (
                <div key={t.name} className="settings__row">
                  <div className="settings__row-info">
                    <div className="settings__row-name">{t.name}</div>
                    <div className="settings__row-desc">{t.description}</div>
                  </div>
                  <button className="settings__connect" onClick={() => startConnect(t)}>+ Connect</button>
                </div>
              ))}
              <div className="settings__row settings__row--custom">
                <div className="settings__row-info">
                  <div className="settings__row-name">Custom provider</div>
                  <div className="settings__row-desc">Any OpenAI-compatible endpoint</div>
                </div>
                <button className="settings__connect" onClick={startCustom}>+ Connect</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
