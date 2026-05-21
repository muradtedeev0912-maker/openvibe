import React, { useEffect, useState } from "react";
import "../styles/Settings.css";

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
  onProviderChanged?: (model: string, baseUrl: string) => void;
}

export function Settings({ open, onClose, onProviderChanged }: Props): React.ReactElement | null {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [editing, setEditing] = useState<{ template: typeof PROVIDER_TEMPLATES[0] | null; custom: boolean; editId?: string } | null>(null);
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

  function startEdit(p: Provider): void {
    setEditing({ template: null, custom: true, editId: p.id });
    setForm({ apiKey: p.apiKey, model: p.model, baseUrl: p.baseUrl, name: p.name });
  }

  function confirmConnect(): void {
    if (!form.apiKey.trim()) return;

    // Editing existing provider
    if (editing?.editId) {
      const updated = providers.map((p) =>
        p.id === editing.editId
          ? { ...p, name: form.name || p.name, apiKey: form.apiKey, model: form.model, baseUrl: form.baseUrl }
          : p,
      );
      save(updated);
      const p = updated.find((x) => x.id === editing.editId)!;
      window.vibe.setProvider(p.apiKey, p.baseUrl, p.model);
      onProviderChanged?.(p.model, p.baseUrl);
      setEditing(null);
      return;
    }

    // New provider
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
    window.vibe.setProvider(newP.apiKey, newP.baseUrl, newP.model);
    onProviderChanged?.(newP.model, newP.baseUrl);
    setEditing(null);
  }

  function disconnect(id: string): void {
    save(providers.filter((p) => p.id !== id));
  }

  function activate(p: Provider): void {
    window.vibe.setProvider(p.apiKey, p.baseUrl, p.model);
    onProviderChanged?.(p.model, p.baseUrl);
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
              {editing.editId ? "Edit provider" : editing.custom ? "Custom provider" : `Connect ${editing.template?.name}`}
            </h3>
            {(editing.custom || editing.editId) ? (
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
              {editing.editId ? "Save" : "Connect"}
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
                      <button className="settings__edit" onClick={() => startEdit(p)} title="Edit">
                        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 2.5l2.5 2.5-8 8H3v-2.5l8-8z"/></svg>
                      </button>
                      <button className="settings__disconnect" onClick={() => disconnect(p.id)}>Disconnect</button>
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
