import React, { useEffect, useState } from "react";
import { setCurrentLanguage, useT, type Language } from "../i18n.js";
import { getCurrentTheme, setCurrentTheme, type Theme } from "../theme.js";
import { getCurrentAvatarShape, setCurrentAvatarShape, type AvatarShape } from "../avatarShape.js";
import { getCurrentComposerStyle, setCurrentComposerStyle, type ComposerStyle } from "../composerStyle.js";

interface Provider {
  id: string;
  name: string;
  description: string;
  baseUrl: string;
  connected: boolean;
  apiKey: string;
  model: string;
}

interface DropdownOption {
  value: string;
  label: string;
}

function Dropdown({ value, options, onChange }: { value: string; options: DropdownOption[]; onChange: (v: string) => void }): React.ReactElement {
  const [open, setOpen] = useState(false);
  const ref = React.useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const current = options.find((o) => o.value === value);

  return (
    <div className={"dropdown" + (open ? " dropdown--open" : "")} ref={ref}>
      <button className="dropdown__trigger" onClick={() => setOpen((o) => !o)}>
        <span className="dropdown__value">{current?.label ?? value}</span>
        <svg className="dropdown__chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open ? (
        <div className="dropdown__menu">
          {options.map((opt) => (
            <button
              key={opt.value}
              className={"dropdown__option" + (opt.value === value ? " dropdown__option--active" : "")}
              onClick={() => { onChange(opt.value); setOpen(false); }}
            >
              {opt.label}
              {opt.value === value ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const PROVIDER_TEMPLATES = [
  { name: "Anthropic", description: "Claude models — Opus, Sonnet, Haiku", baseUrl: "https://api.anthropic.com/v1", icon: "claude.png" },
  { name: "OpenAI", description: "GPT-4o, o1, o3", baseUrl: "https://api.openai.com/v1", icon: "openai.png" },
  { name: "Google AI", description: "Gemini 2.5, 1M context", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", icon: "gemini.png" },
  { name: "Groq", description: "Ultra-fast — Llama, Mixtral", baseUrl: "https://api.groq.com/openai/v1", icon: "groq.png" },
  { name: "OpenRouter", description: "100+ models, free tier available", baseUrl: "https://openrouter.ai/api/v1", icon: "openrouter.png" },
  { name: "DeepSeek", description: "V4 Flash, R1 reasoning", baseUrl: "https://api.deepseek.com/v1", icon: "deepseek.png" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  onProviderChanged?: (model: string, baseUrl: string) => void;
}

type SettingsTab = "general" | "providers";

export function Settings({ open, onClose, onProviderChanged }: Props): React.ReactElement | null {
  const t = useT();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [editing, setEditing] = useState<{ template: typeof PROVIDER_TEMPLATES[0] | null; custom: boolean; editId?: string } | null>(null);
  const [form, setForm] = useState({ apiKey: "", model: "", baseUrl: "", name: "" });
  const [closing, setClosing] = useState(false);
  const [shouldRender, setShouldRender] = useState(open);
  const [tab, setTab] = useState<SettingsTab>("general");

  // General settings
  const [language, setLanguage] = useState<string>(() => localStorage.getItem("vibe_language") || "English");
  const [terminalShell, setTerminalShell] = useState<string>("powershell");
  const [theme, setTheme] = useState<Theme>(getCurrentTheme);
  const [avatarShape, setAvatarShape] = useState<AvatarShape>(getCurrentAvatarShape);
  const [composerStyle, setComposerStyle] = useState<ComposerStyle>(getCurrentComposerStyle);

  // Load shell preference from main process
  useEffect(() => {
    if (!open) return;
    window.vibe.terminal.getShell().then((s) => {
      if (s === "powershell" || s === "cmd" || s === "bash") setTerminalShell(s);
    });
  }, [open]);

  useEffect(() => {
    if (open) {
      setShouldRender(true);
      setClosing(false);
    } else if (shouldRender) {
      setClosing(true);
      const t = setTimeout(() => {
        setShouldRender(false);
        setClosing(false);
      }, 200);
      return () => clearTimeout(t);
    }
  }, [open]);

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

  function handleLangChange(value: string): void {
    setLanguage(value);
    setCurrentLanguage(value as Language);
  }

  function handleShellChange(value: string): void {
    setTerminalShell(value);
    window.vibe.terminal.setShell(value);
  }

  function handleThemeChange(value: string): void {
    const t: Theme = value === "light" ? "light" : "dark";
    setTheme(t);
    setCurrentTheme(t);
  }

  function handleAvatarShapeChange(value: string): void {
    const s: AvatarShape = value === "round" ? "round" : "square";
    setAvatarShape(s);
    setCurrentAvatarShape(s);
  }

  function handleComposerStyleChange(value: string): void {
    const s: ComposerStyle = value === "expanded" ? "expanded" : "compact";
    setComposerStyle(s);
    setCurrentComposerStyle(s);
  }

  if (!shouldRender) return null;

  const connected = providers.filter((p) => p.connected);

  return (
    <>
      <div className={"settings__overlay" + (closing ? " settings__overlay--closing" : "")} onClick={onClose}>
        <div className={"settings settings--wide" + (closing ? " settings--closing" : "")} onClick={(e) => e.stopPropagation()}>
          <div className="settings__layout">
            <aside className="settings__sidebar">
              <button
                className={"settings__sidebar-item" + (tab === "general" ? " settings__sidebar-item--active" : "")}
                onClick={() => setTab("general")}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
                <span>{t("settings.general")}</span>
              </button>
              <button
                className={"settings__sidebar-item" + (tab === "providers" ? " settings__sidebar-item--active" : "")}
                onClick={() => setTab("providers")}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="2" width="20" height="8" rx="2" />
                  <rect x="2" y="14" width="20" height="8" rx="2" />
                  <circle cx="6" cy="6" r="1" fill="currentColor" stroke="none" />
                  <circle cx="6" cy="18" r="1" fill="currentColor" stroke="none" />
                </svg>
                <span>{t("settings.providers")}</span>
              </button>

              <div className="settings__sidebar-footer">
                <div className="settings__sidebar-version">OpenVibe v0.2.7</div>
                <button
                  className="settings__sidebar-link"
                  onClick={() => window.vibe.openExternal("https://github.com/muradtedeev0912-maker/openvibe")}
                >
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"/>
                  </svg>
                  <span>GitHub</span>
                </button>
                <button
                  className="settings__sidebar-link"
                  onClick={() => window.vibe.openExternal("https://openvibe-beta.vercel.app/")}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="2" y1="12" x2="22" y2="12" />
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                  </svg>
                  <span>Website</span>
                </button>
              </div>
            </aside>

            <div className="settings__content">
              <div className="settings__content-header">
                <h2>{tab === "general" ? t("settings.general") : t("settings.providers")}</h2>
                <button className="settings__close" onClick={onClose} aria-label={t("common.close")}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              {tab === "general" ? (
                <div className="settings__panel">
                  <div className="settings__row">
                    <div className="settings__row-info">
                      <div className="settings__row-name">{t("settings.language")}</div>
                      <div className="settings__row-desc">{t("settings.language_desc")}</div>
                    </div>
                    <Dropdown
                      value={language}
                      onChange={handleLangChange}
                      options={[
                        { value: "English", label: "English" },
                        { value: "Русский", label: "Русский" },
                        { value: "Español", label: "Español" },
                        { value: "Deutsch", label: "Deutsch" },
                        { value: "Français", label: "Français" },
                        { value: "中文", label: "中文" },
                      ]}
                    />
                  </div>
                  <div className="settings__row">
                    <div className="settings__row-info">
                      <div className="settings__row-name">{t("settings.theme")}</div>
                      <div className="settings__row-desc">{t("settings.theme_desc")}</div>
                    </div>
                    <Dropdown
                      value={theme}
                      onChange={handleThemeChange}
                      options={[
                        { value: "dark", label: t("settings.theme.dark") },
                        { value: "light", label: t("settings.theme.light") },
                      ]}
                    />
                  </div>
                  <div className="settings__row">
                    <div className="settings__row-info">
                      <div className="settings__row-name">{t("settings.avatar_shape")}</div>
                      <div className="settings__row-desc">{t("settings.avatar_shape_desc")}</div>
                    </div>
                    <Dropdown
                      value={avatarShape}
                      onChange={handleAvatarShapeChange}
                      options={[
                        { value: "square", label: t("settings.avatar_shape.square") },
                        { value: "round", label: t("settings.avatar_shape.round") },
                      ]}
                    />
                  </div>
                  <div className="settings__row">
                    <div className="settings__row-info">
                      <div className="settings__row-name">{t("settings.composer_style")}</div>
                      <div className="settings__row-desc">{t("settings.composer_style_desc")}</div>
                    </div>
                    <Dropdown
                      value={composerStyle}
                      onChange={handleComposerStyleChange}
                      options={[
                        { value: "compact", label: t("settings.composer_style.compact") },
                        { value: "expanded", label: t("settings.composer_style.expanded") },
                      ]}
                    />
                  </div>
                  <div className="settings__row">
                    <div className="settings__row-info">
                      <div className="settings__row-name">{t("settings.terminal_shell")}</div>
                      <div className="settings__row-desc">{t("settings.terminal_shell_desc")}</div>
                    </div>
                    <Dropdown
                      value={terminalShell}
                      onChange={handleShellChange}
                      options={[
                        { value: "powershell", label: t("settings.shell.powershell") },
                        { value: "cmd", label: t("settings.shell.cmd") },
                        { value: "bash", label: t("settings.shell.bash") },
                      ]}
                    />
                  </div>
                </div>
              ) : (
                <div className="settings__panel">
                  {connected.length > 0 ? (
                    <div className="settings__section">
                      <h3 className="settings__section-title">{t("settings.connected")}</h3>
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
                            <button className="settings__edit" onClick={() => startEdit(p)} title={t("common.edit")}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 20h9" />
                                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                              </svg>
                            </button>
                            <button className="settings__disconnect" onClick={() => disconnect(p.id)}>{t("common.disconnect")}</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className="settings__section">
                    <h3 className="settings__section-title">{t("settings.add_provider")}</h3>
                    {PROVIDER_TEMPLATES.map((tpl) => (
                      <div key={tpl.name} className="settings__row">
                        <img className="settings__row-icon" src={`./providers/${tpl.icon}`} alt="" />
                        <div className="settings__row-info">
                          <div className="settings__row-name">{tpl.name}</div>
                          <div className="settings__row-desc">{tpl.description}</div>
                        </div>
                        <button className="settings__connect" onClick={() => startConnect(tpl)}>{t("common.connect")}</button>
                      </div>
                    ))}
                    <div className="settings__row settings__row--custom">
                      <div className="settings__row-info">
                        <div className="settings__row-name">{t("settings.custom_provider")}</div>
                        <div className="settings__row-desc">{t("settings.custom_provider_desc")}</div>
                      </div>
                      <button className="settings__connect" onClick={startCustom}>{t("common.connect")}</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {editing ? (
        <div className="settings__overlay settings__overlay--nested" onClick={() => setEditing(null)}>
          <div className="settings settings--form" onClick={(e) => e.stopPropagation()}>
            <div className="settings__form-nav">
              <button className="settings__back" onClick={() => setEditing(null)} aria-label={t("common.back")}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="19" y1="12" x2="5" y2="12" />
                  <polyline points="12 19 5 12 12 5" />
                </svg>
              </button>
              <button className="settings__close" onClick={() => setEditing(null)} aria-label={t("common.close")}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <h3 className="settings__form-title">
              {editing.editId
                ? t("settings.edit_provider")
                : editing.custom
                  ? t("settings.custom_provider")
                  : t("settings.connect_to", { name: editing.template?.name ?? "" })}
            </h3>
            {(editing.custom || editing.editId) ? (
              <>
                <label className="settings__label">
                  {t("settings.name")}
                  <input className="settings__input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t("settings.name_placeholder")} />
                </label>
                <label className="settings__label">
                  {t("settings.base_url")}
                  <input className="settings__input" value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} placeholder="https://api.example.com/v1" />
                </label>
              </>
            ) : null}
            <label className="settings__label">
              {t("settings.api_key")}
              <input className="settings__input" type="password" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} placeholder="sk-..." />
            </label>
            <label className="settings__label">
              {t("settings.model")}
              <input className="settings__input" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder={t("settings.model_placeholder")} />
              <span className="settings__hint">{t("settings.model_hint")}</span>
            </label>
            <button className="settings__save" onClick={confirmConnect} disabled={!form.apiKey.trim() || !form.model.trim()}>
              {editing.editId ? t("common.save") : t("common.connect")}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
