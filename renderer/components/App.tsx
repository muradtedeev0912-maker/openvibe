import React, { useCallback, useEffect, useRef, useState } from "react";
import type {
  ChatRecord,
  ChatSummary,
  ConfirmPayload,
  ContentPart,
  Project,
  VibeConfig,
  VibeEvent,
} from "../types.js";
import { ChatRail } from "./ChatRail.js";
import { ChatSidebar } from "./ChatSidebar.js";
import { Composer, type SendPayload } from "./Composer.js";
import { Confirm } from "./Confirm.js";
import { Editor } from "./Editor.js";
import { FileTree } from "./FileTree.js";
import { History, type HistoryItem } from "./History.js";
import { Settings } from "./Settings.js";
import { Changes } from "./Changes.js";
import { Plan } from "./Plan.js";
import { Terminals } from "./Terminals.js";
import { Titlebar } from "./Titlebar.js";
import { useT } from "../i18n.js";
import { useAgentMode } from "../agentMode.js";
import { addTask, extractSteps, setStepsForLastTask, getLatestTask, markStepDone, usePlans, type PlanStep } from "../planStore.js";
import { loadSkills, addSkill, removeSkill, pushSkillsToAgent, setSkillEnabled, onSkillsChange, type Skill } from "../skills.js";
import successSfx from "../succes.mp3";

function playSound(src: string): void {
  const audio = new Audio(src);
  audio.volume = 0.5;
  audio.play().catch(() => {});
}

type FatalState = { kind: "ok" } | { kind: "fatal"; error: string };

let nextLocalId = 0;
const localId = (): string => `l${++nextLocalId}`;

function stripAttachedFiles(text: string): string {
  return text.replace(/\n*Attached files:\n(?:- .*\n?)+/g, "").trim();
}

/** Strip the [PLAN MODE …] system prompt from previously saved user messages */
function stripPlanPrompt(text: string): string {
  // Cut everything from "[PLAN MODE" up to and including the "User request:" line
  return text
    .replace(/\[PLAN MODE[\s\S]*?User request:\s*/i, "")
    .replace(/^\[\[VIBE_INTERNAL\]\][\s\S]*$/i, "")
    .trim();
}

/** Convert a saved ChatRecord into UI history items (best-effort, lossy). */
function recordToItems(record: ChatRecord): HistoryItem[] {
  const out: HistoryItem[] = [];
  for (const msg of record.messages) {
    if (msg.role === "system") continue;
    if (msg.role === "user") {
      const text =
        typeof msg.content === "string"
          ? msg.content
          : Array.isArray(msg.content)
            ? msg.content
                .map((p) => (p.type === "text" ? p.text : "[image]"))
                .join(" ")
            : "";
      const cleanText = stripPlanPrompt(stripAttachedFiles(text));
      // Skip messages that became empty after stripping internal prompts
      if (cleanText) {
        out.push({ id: localId(), kind: "user", text: cleanText });
      }
    } else if (msg.role === "assistant") {
      const text =
        typeof msg.content === "string"
          ? msg.content
          : Array.isArray(msg.content)
            ? msg.content
                .map((p) => (p.type === "text" ? p.text : ""))
                .join("")
            : "";
      if (text) out.push({ id: localId(), kind: "assistant", text });
      for (const tc of msg.tool_calls ?? []) {
        let parsed: unknown = {};
        try {
          parsed = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
        } catch {
          parsed = tc.function.arguments;
        }
        out.push({
          id: tc.id,
          kind: "tool",
          text: "",
          toolName: tc.function.name,
          toolArgs: parsed,
        });
      }
    } else if (msg.role === "tool") {
      const idx = out.findIndex(
        (it) => it.kind === "tool" && it.id === msg.tool_call_id,
      );
      if (idx >= 0) {
        const text =
          typeof msg.content === "string"
            ? msg.content
            : Array.isArray(msg.content)
              ? msg.content
                  .map((p) => (p.type === "text" ? p.text : ""))
                  .join("")
              : "";
        out[idx] = { ...out[idx]!, text, ok: true };
      }
    }
  }
  return out;
}

export function App(): React.ReactElement {
  const t = useT();
  const [state, setState] = useState<FatalState>({ kind: "ok" });
  const [config, setConfig] = useState<VibeConfig | null>(null);
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [agentMode] = useAgentMode();
  const [planOpen, setPlanOpen] = useState(false);
  const [planWidth, setPlanWidth] = useState<number>(() => {
    const v = parseInt(localStorage.getItem("vibe_plan_width") || "320", 10);
    return Number.isFinite(v) ? v : 320;
  });
  const [planModel, setPlanModel] = useState<string>(() => localStorage.getItem("vibe_plan_model") || "");
  const [planPickerOpen, setPlanPickerOpen] = useState(false);
  const [planAvailable, setPlanAvailable] = useState<Array<{ id: string; model: string }>>([]);
  const planPickerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function load(): void {
      try {
        const saved = localStorage.getItem("vibe_providers");
        if (!saved) { setPlanAvailable([]); return; }
        const list = JSON.parse(saved) as Array<{ id: string; model: string; connected: boolean }>;
        setPlanAvailable(list.filter((p) => p.connected && p.model).map((p) => ({ id: p.id, model: p.model })));
      } catch { setPlanAvailable([]); }
    }
    load();
    window.addEventListener("storage", load);
    return () => window.removeEventListener("storage", load);
  }, [planPickerOpen, agentMode]);

  useEffect(() => {
    if (!planPickerOpen) return;
    function onDoc(e: MouseEvent): void {
      if (planPickerRef.current && !planPickerRef.current.contains(e.target as Node)) {
        setPlanPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [planPickerOpen]);

  function handlePickPlanModel(model: string): void {
    setPlanModel(model);
    localStorage.setItem("vibe_plan_model", model);
  }

  /** Look up provider creds (apiKey, baseUrl) for a given model id. */
  function getProviderForModel(modelId: string): { apiKey: string; baseUrl: string; model: string } | null {
    try {
      const saved = localStorage.getItem("vibe_providers");
      if (!saved) return null;
      const list = JSON.parse(saved) as Array<{ model: string; apiKey: string; baseUrl: string; connected: boolean }>;
      const p = list.find((x) => x.model === modelId && x.connected);
      return p ? { apiKey: p.apiKey, baseUrl: p.baseUrl, model: p.model } : null;
    } catch { return null; }
  }

  /** Switch the active LLM connection to `modelId` if it differs from current
   *  config and we have credentials for it. Returns true if a switch happened. */
  async function switchToModel(modelId: string): Promise<boolean> {
    if (!modelId || !configRef.current) return false;
    if (configRef.current.model === modelId) return false;
    const p = getProviderForModel(modelId);
    if (!p) return false;
    await window.vibe.setProvider(p.apiKey, p.baseUrl, p.model);
    setConfig((c) => (c ? { ...c, apiKey: "***", baseUrl: p.baseUrl, model: p.model } : c));
    return true;
  }
  const [pending, setPending] = useState<ConfirmPayload | null>(null);
  const [termVisible, setTermVisible] = useState(false);
  const [editorVisible, setEditorVisible] = useState(false);
  const [folder, setFolder] = useState<string | null>(null);
  const [editorPath, setEditorPath] = useState<string | null>(null);
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [chatSideOpen, setChatSideOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mcpOpen, setMcpOpen] = useState(false);
  const [snapshotOpen, setSnapshotOpen] = useState(false);
  const [changesOpen, setChangesOpen] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [expandToPath, setExpandToPath] = useState<string | null>(null);
  const [chatInject, setChatInject] = useState<string | null>(null);
  const [termHeight, setTermHeight] = useState(220);
  const [termClosing, setTermClosing] = useState(false);
  const [termRender, setTermRender] = useState(false);
  const [editorClosing, setEditorClosing] = useState(false);
  const [editorRender, setEditorRender] = useState(false);
  const [changesClosing, setChangesClosing] = useState(false);
  const [changesRender, setChangesRender] = useState(false);
  const [editorWidth, setEditorWidth] = useState(420);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<string | null>(null);
  const [projectChanges, setProjectChanges] = useState<HistoryItem[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const streamingId = useRef<string | null>(null);
  const [streamingNow, setStreamingNow] = useState<string | null>(null);
  const pendingAttachments = useRef<HistoryItem["attachments"]>(undefined);
  /** "planner" | "executor" | null — phase of the current auto plan-execute flow */
  const autoPlanPhase = useRef<"planner" | "executor" | null>(null);
  /** Model id to restore after the planner finishes its turn. */
  const executorModelToRestore = useRef<string | null>(null);
  /** The step the user manually launched, if any. Cleared after the agent answers. */
  const runningStep = useRef<{ id: string; text: string } | null>(null);
  const [runningStepId, setRunningStepId] = useState<string | null>(null);
  /** Queue of executor prompts to send one after another for the current task */
  const executorQueue = useRef<Array<{ id: string; text: string; index: number; total: number }>>([]);
  const executorTaskTitle = useRef<string>("");

  /* ---- Streaming typewriter ---------------------------------------------
   * Incoming text is buffered per-message and revealed character-by-character
   * on a RAF tick. Speed adapts: a target rate (~80 ch/s) when caught up,
   * up to ~400 ch/s when the buffer grows long, so we never fall behind.
   * `assistant-end` is queued via `pendingFinalizeIds`; the actual finalize
   * runs only after the buffer for that id drains, which keeps the typing
   * animation visually complete before plan/executor follow-ups fire. */
  const streamBuffer = useRef<Map<string, string>>(new Map());
  const pendingFinalizeIds = useRef<Set<string>>(new Set());
  const tickerActive = useRef<boolean>(false);
  const lastTickAt = useRef<number>(0);
  const finalizeRef = useRef<(id: string) => void>(() => {});

  function ensureTicker(): void {
    if (tickerActive.current) return;
    tickerActive.current = true;
    lastTickAt.current = performance.now();
    const tick = (now: number): void => {
      const dt = Math.min(64, now - lastTickAt.current);
      lastTickAt.current = now;
      if (streamBuffer.current.size === 0) {
        tickerActive.current = false;
        return;
      }

      // Decide how many chars to flush from each buffer this frame.
      // Base rate ~80 ch/s; if a buffer is long, accelerate up to 400 ch/s.
      let touched = false;
      setItems((prev) => {
        let next = prev;
        for (const [id, queued] of streamBuffer.current.entries()) {
          if (!queued) continue;
          const lenBoost = Math.min(5, queued.length / 40);
          const charsPerSec = 80 + lenBoost * 64; // ~80 → ~400
          const want = Math.max(1, Math.round((charsPerSec * dt) / 1000));
          const out = queued.slice(0, want);
          const rest = queued.slice(want);
          if (rest) {
            streamBuffer.current.set(id, rest);
          } else {
            streamBuffer.current.delete(id);
          }
          // Mutate items immutably
          if (!touched) {
            touched = true;
            next = prev.map((it) => (it.id === id ? { ...it, text: it.text + out } : it));
          } else {
            next = next.map((it) => (it.id === id ? { ...it, text: it.text + out } : it));
          }
        }
        return touched ? next : prev;
      });

      // Run finalize for any id whose buffer has fully drained
      for (const id of Array.from(pendingFinalizeIds.current)) {
        if (!streamBuffer.current.has(id)) {
          pendingFinalizeIds.current.delete(id);
          finalizeRef.current(id);
        }
      }

      if (streamBuffer.current.size === 0 && pendingFinalizeIds.current.size === 0) {
        tickerActive.current = false;
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // Mirror state into refs so the persistent vibe event subscription
  // (registered once with [] deps) always reads the latest values.
  const agentModeRef = useRef(agentMode);
  const activeProjectRef = useRef(activeProject);
  const configRef = useRef(config);
  const planModelRef = useRef(planModel);
  useEffect(() => { agentModeRef.current = agentMode; }, [agentMode]);
  useEffect(() => { activeProjectRef.current = activeProject; }, [activeProject]);
  useEffect(() => { configRef.current = config; }, [config]);
  useEffect(() => { planModelRef.current = planModel; }, [planModel]);

  // Reactive plan state for the current project — lets the composer know
  // whether to wrap the user's message in the planner prompt or treat it
  // as a follow-up against the existing plan.
  const plans = usePlans(activeProject);
  const planActive = plans.length > 0 && plans[0]!.steps.some(function open(s): boolean {
    if (!s.done) return true;
    return (s.children ?? []).some(open);
  });

  // Sync user-taught skills to the agent whenever the active project changes
  // so the AI gets exactly that project's skill set on the next turn.
  useEffect(() => {
    const list = loadSkills(activeProject);
    setSkills(list);
    pushSkillsToAgent(list);
  }, [activeProject]);

  // Sync the chosen UI language to the agent. The renderer stores the language
  // in localStorage; whenever it changes (or on first mount), tell the agent
  // so it pins replies to that language for the next turn.
  useEffect(() => {
    const send = (): void => {
      const lang = localStorage.getItem("vibe_language") || "English";
      window.vibe.setLanguage(lang).catch(() => {});
    };
    send();
    window.addEventListener("vibe-lang-change", send);
    return () => window.removeEventListener("vibe-lang-change", send);
  }, []);

  // Refresh the local skills list whenever it changes externally (added via
  // chat #skills, toggled in the picker, etc.) so the in-chat picker stays
  // in sync with localStorage.
  useEffect(() => {
    return onSkillsChange((pid) => {
      if (pid === (activeProject ?? "global")) {
        setSkills(loadSkills(activeProject));
      }
    });
  }, [activeProject]);

  // Install the assistant-stream finalizer once. It runs the plan/executor
  // bookkeeping and removes empty assistant bubbles AFTER the typewriter
  // animation has fully revealed the message. All inputs come from refs so
  // we don't need to recreate the function on every render.
  useEffect(() => {
    finalizeRef.current = (id: string) => {
      // Now that the typewriter is done, clear the streaming UI state.
      setStreamingNow(null);
      // Compute final state inside the updater so we read fresh items.
      setItems((prev) => {
        const finalMsg = prev.find((it) => it.id === id);
        const endMode = agentModeRef.current;
        const endProj = activeProjectRef.current;

        if (
          autoPlanPhase.current === "planner" &&
          endMode === "plan" &&
          endProj &&
          finalMsg?.text
        ) {
          // Planner finished — make sure the parsed steps are saved (we also
          // parse incrementally during streaming, but this handles the final
          // version in case anything was added at the very end). Then we
          // STOP. The user picks which step to run via the play button.
          const parsedSteps = extractSteps(finalMsg.text);
          if (parsedSteps.length > 0) {
            setStepsForLastTask(endProj, parsedSteps);
          }
          autoPlanPhase.current = null;
          // Restore the executor model now that the heavy planner turn is over.
          if (executorModelToRestore.current) {
            const restoreTo = executorModelToRestore.current;
            executorModelToRestore.current = null;
            void switchToModel(restoreTo);
          }
        } else if (runningStep.current && endProj) {
          // The agent just finished executing a single step the user kicked
          // off via the play button. Mark it done and clear the running flag.
          markStepDone(endProj, runningStep.current.id);
          runningStep.current = null;
          setRunningStepId(null);
        }

        return prev.filter((it) => it.id !== id || it.text.length > 0);
      });
    };
  }, []);

  /** Send the agent a prompt to execute a single plan step. Called from the
   *  Plan panel's play button. The matching auto-tick happens in finalizeRef. */
  function runPlanStep(stepId: string, stepText: string): void {
    if (runningStep.current) return;
    runningStep.current = { id: stepId, text: stepText };
    setRunningStepId(stepId);

    // Make sure the EXECUTOR model is active. If a separate planner model
    // was used and we never switched back (e.g. user manually toggled
    // something), restore now. The executor is whatever the user has
    // selected as the chat model — that's where we want code-writing to run.
    if (executorModelToRestore.current) {
      const restoreTo = executorModelToRestore.current;
      executorModelToRestore.current = null;
      void switchToModel(restoreTo);
    }

    const proj = activeProjectRef.current;
    const task = proj ? getLatestTask(proj) : null;
    const goal = task?.title ?? "";

    // Build the full plan context: list every step with its status and mark
    // the current one. The executor needs to see what came before (to avoid
    // redoing it) and what comes after (to not eat into future steps).
    let planContext = "";
    let stepNumber = 0;
    let totalSteps = 0;
    if (task) {
      const lines: string[] = [];
      let n = 0;
      function walk(steps: PlanStep[], depth: number): void {
        for (const s of steps) {
          n += 1;
          totalSteps += 1;
          const indent = "  ".repeat(depth);
          const marker = s.id === stepId ? "▶" : s.done ? "✓" : "○";
          if (s.id === stepId) stepNumber = n;
          lines.push(`${indent}${marker} ${n}. ${s.text}`);
          if (s.children && s.children.length > 0) walk(s.children, depth + 1);
        }
      }
      walk(task.steps, 0);
      planContext = lines.join("\n");
    }

    const promptText = [
      "[[VIBE_INTERNAL]]",
      "═══════════════════════════════════════════════════════════════",
      " EXECUTOR MODE — implement exactly ONE step from the plan.",
      "═══════════════════════════════════════════════════════════════",
      "",
      "You are the EXECUTOR for an autonomous coding session. A separate",
      "planner has already produced the plan below. Your job is to make",
      "the current step (▶) real in the codebase — nothing more, nothing",
      "less. Trust the plan; do not redesign it.",
      "",
      goal ? `## Goal of the whole task\n${goal}` : "",
      "",
      "## Full plan (✓ done · ○ pending · ▶ this step)",
      planContext || "(plan unavailable)",
      "",
      `## Your step (${stepNumber}${totalSteps ? `/${totalSteps}` : ""})`,
      stepText,
      "",
      "## Operating rules",
      "1. INVESTIGATE FIRST. Before editing, read the files you'll touch",
      "   (read_file) and understand the surrounding code. Match its",
      "   style, indentation, naming, and conventions exactly.",
      "2. STAY IN SCOPE. Implement only this step. Do NOT do work that",
      "   belongs to a later step. Do NOT 'helpfully' refactor adjacent",
      "   code unless the step explicitly asks for it.",
      "3. NO REPLANNING. Do not output a new plan, numbered list, or",
      "   'next steps' section. The plan already exists.",
      "4. USE THE RIGHT TOOL. edit_file for existing files, write_file",
      "   only for new ones. Run commands via the terminal tool when",
      "   the step requires installing, generating, or verifying.",
      "5. PRODUCTION-GRADE CODE. Handle errors, validate inputs, use",
      "   proper types, follow language idioms. No TODOs left behind.",
      "6. SELF-VERIFY. If the step has a verifiable outcome (build,",
      "   test, lint, file exists), run it and confirm before stopping.",
      "   If verification fails, fix and re-verify.",
      "7. NO PREAMBLE. Don't say 'I'll now do X.' Just do it. No",
      "   apologies, no motivation, no recap of the step.",
      "",
      "## When you finish",
      "Write ONE short paragraph (1–3 sentences) describing what",
      "actually changed (files, functions, key decisions). Then stop.",
      "Do not ask the user a question; do not propose follow-ups.",
    ].filter(Boolean).join("\n");
    window.vibe.send(promptText);
  }

  /** Save current project's UI state to localStorage */
  function saveProjectState(projectId: string | null): void {
    if (!projectId) return;
    const state = {
      openTabs,
      editorPath,
      editorVisible,
      termVisible,
      editorWidth,
      termHeight,
    };
    localStorage.setItem(`vibe_project_ui_${projectId}`, JSON.stringify(state));
  }

  /** Restore a project's UI state from localStorage */
  function restoreProjectState(projectId: string): void {
    const raw = localStorage.getItem(`vibe_project_ui_${projectId}`);
    if (!raw) {
      setEditorPath(null);
      setOpenTabs([]);
      setEditorVisible(false);
      setTermVisible(false);
      setEditorWidth(420);
      setTermHeight(220);
      return;
    }
    try {
      const state = JSON.parse(raw) as {
        openTabs?: string[];
        editorPath?: string | null;
        editorVisible?: boolean;
        termVisible?: boolean;
        editorWidth?: number;
        termHeight?: number;
      };
      setOpenTabs(state.openTabs ?? []);
      setEditorPath(state.editorPath ?? null);
      setEditorVisible(state.editorVisible ?? false);
      setTermVisible(state.termVisible ?? false);
      setEditorWidth(state.editorWidth ?? 420);
      setTermHeight(state.termHeight ?? 220);
    } catch {
      setEditorPath(null);
      setOpenTabs([]);
      setEditorVisible(false);
      setTermVisible(false);
      setEditorWidth(420);
      setTermHeight(220);
    }
  }

  /** Load persisted unresolved file changes for a project */
  function loadProjectChanges(projectId: string): HistoryItem[] {
    const raw = localStorage.getItem(`vibe_project_changes_${projectId}`);
    if (!raw) return [];
    try {
      return JSON.parse(raw) as HistoryItem[];
    } catch { return []; }
  }

  /** Persist unresolved file changes for a project */
  function saveProjectChanges(projectId: string | null, changes: HistoryItem[]): void {
    if (!projectId) return;
    localStorage.setItem(`vibe_project_changes_${projectId}`, JSON.stringify(changes));
  }

  // Init agent on mount
  useEffect(() => {
    let cancelled = false;
    window.vibe.init().then(async (res) => {
      if (cancelled) return;
      if (!res.ok) {
        setState({ kind: "fatal", error: res.error });
        return;
      }
      setConfig(res.config);
      setFolder(res.config.cwd);
      setState({ kind: "ok" });

      // Restore saved provider from Settings (overrides .env)
      const savedProviders = localStorage.getItem("vibe_providers");
      if (savedProviders) {
        try {
          const list = JSON.parse(savedProviders) as Array<{
            connected: boolean;
            apiKey: string;
            baseUrl: string;
            model: string;
            id: string;
          }>;
          const active = list.find((p) => p.connected && p.apiKey);
          if (active) {
            const model = active.model || "";
            window.vibe.setProvider(active.apiKey, active.baseUrl, model);
            setConfig((c) => c ? { ...c, model, baseUrl: active.baseUrl, apiKey: "***" } : c);
          }
        } catch { /* ignore */ }
      }

      const projectList = await window.vibe.projects.list();
      const active = await window.vibe.projects.active();
      if (cancelled) return;
      setProjects(projectList);
      if (!active) {
        // No project selected — show welcome screen
        return;
      }
      setActiveProject(active.id);
      setFolder(active.path);
      setProjectChanges(loadProjectChanges(active.id));

      // Restore chat list and open the most recent (or create one)
      const list = await window.vibe.chats.list();
      if (cancelled) return;
      if (list.length === 0) {
        const fresh = await window.vibe.chats.new();
        if (fresh) {
          setChats([fresh]);
          setActiveChat(fresh.id);
        }
      } else {
        setChats(list);
        const top = list[0]!;
        const record = await window.vibe.chats.open(top.id);
        if (cancelled) return;
        setActiveChat(top.id);
        if (record) setItems(recordToItems(record));
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Terminal smooth open/close
  useEffect(() => {
    if (termVisible) {
      setTermRender(true);
      setTermClosing(false);
    } else if (termRender) {
      setTermClosing(true);
      const t = setTimeout(() => {
        setTermRender(false);
        setTermClosing(false);
      }, 220);
      return () => clearTimeout(t);
    }
  }, [termVisible]);

  // Editor smooth open/close
  useEffect(() => {
    const wantOpen = editorVisible && !!editorPath;
    if (wantOpen) {
      setEditorRender(true);
      setEditorClosing(false);
    } else if (editorRender) {
      setEditorClosing(true);
      const t = setTimeout(() => {
        setEditorRender(false);
        setEditorClosing(false);
      }, 220);
      return () => clearTimeout(t);
    }
  }, [editorVisible, editorPath]);

  // Changes smooth open/close
  useEffect(() => {
    if (changesOpen) {
      setChangesRender(true);
      setChangesClosing(false);
    } else if (changesRender) {
      setChangesClosing(true);
      const t = setTimeout(() => {
        setChangesRender(false);
        setChangesClosing(false);
      }, 220);
      return () => clearTimeout(t);
    }
  }, [changesOpen]);

  // Save project UI state on window close
  useEffect(() => {
    const onBeforeUnload = () => saveProjectState(activeProject);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  });

  // Subscribe to events
  useEffect(() => {
    const offEvent = window.vibe.onEvent((e: VibeEvent) => {
      setItems((prev) => {
        switch (e.kind) {
          case "user": {
            const atts = pendingAttachments.current;
            pendingAttachments.current = undefined;
            // Internal silent prompts (from auto plan-execute pipeline) — don't render
            if (e.text.startsWith("[[VIBE_INTERNAL]]")) {
              return prev;
            }
            // In plan mode: record this user request as a new task — but
            // ONLY if there's no in-progress plan with unfinished steps.
            // If a plan already has incomplete work, treat the user's
            // message as a follow-up question/comment, not a new request,
            // so the agent doesn't blow away the existing plan.
            const mode = agentModeRef.current;
            const proj = activeProjectRef.current;
            if (mode === "plan" && proj && e.text.trim()) {
              const latest = getLatestTask(proj);
              const hasOngoingPlan = !!latest && latest.steps.some(function checkOpen(s): boolean {
                if (!s.done) return true;
                return (s.children ?? []).some(checkOpen);
              });
              if (!hasOngoingPlan) {
                const title = e.text.trim();
                if (title) addTask(proj, title.slice(0, 200));
                autoPlanPhase.current = "planner";
              }
            }
            return [
              ...prev,
              {
                id: localId(),
                kind: "user",
                text: e.text,
                attachments: atts && atts.length > 0 ? atts : undefined,
              },
            ];
          }
          case "assistant-start": {
            const id = localId();
            streamingId.current = id;
            setStreamingNow(id);
            return [...prev, { id, kind: "assistant", text: "" }];
          }
          case "assistant-chunk": {
            const id = streamingId.current;
            if (!id) return prev;
            // Filter out internal noise like rate-limit retry notices coming through stream
            const cleaned = e.text
              .replace(/\[rate limited[^\]]*\]/g, "")
              .replace(/\[context too long[^\]]*\]/g, "");
            if (!cleaned) return prev;
            // Buffer the chunk; the RAF ticker reveals it character-by-character.
            const cur = streamBuffer.current.get(id) ?? "";
            const next = cur + cleaned;
            streamBuffer.current.set(id, next);
            // While the planner is streaming, parse any Strategy section we
            // can already see and surface those steps in the Plan panel
            // immediately — no need to wait for the full response.
            if (autoPlanPhase.current === "planner") {
              const proj = activeProjectRef.current;
              if (proj) {
                const partial = extractSteps(next);
                if (partial.length > 0) setStepsForLastTask(proj, partial);
              }
            }
            ensureTicker();
            return prev;
          }
          case "info":
            // Hide rate-limit / trim notices from the chat
            if (/rate limited|context too long/i.test(e.text)) return prev;
            return [...prev, { id: localId(), kind: "info", text: e.text }];
          case "assistant-end": {
            const id = streamingId.current;
            streamingId.current = null;
            if (!id) {
              setStreamingNow(null);
              return prev;
            }
            // Defer the real "end" handling until the typewriter buffer for
            // this message has fully drained. The actual logic is in
            // `finalizeRef.current(id)` which the RAF ticker calls when ready.
            // We keep `streamingNow` set so the UI still shows a streaming
            // indicator while the typewriter finishes revealing the message.
            pendingFinalizeIds.current.add(id);
            ensureTicker();
            return prev;
          }
          case "tool-call":
            return [
              ...prev,
              {
                id: e.id,
                kind: "tool",
                text: "",
                toolName: e.name,
                toolArgs: e.args,
              },
            ];
          case "tool-result":
            return prev.map((it) => {
              if (it.id !== e.id) return it;
              const updated: HistoryItem = { ...it, text: e.text, ok: e.ok };
              // Persist successful write_file/edit_file as a project-level change
              if (e.ok && (updated.toolName === "write_file" || updated.toolName === "edit_file")) {
                setProjectChanges((cur) => {
                  // Avoid duplicates by id
                  if (cur.some((c) => c.id === updated.id)) return cur;
                  const next = [...cur, updated];
                  saveProjectChanges(activeProject, next);
                  return next;
                });
              }
              return updated;
            });
          case "tool-denied":
            return prev.map((it) =>
              it.id === e.id ? { ...it, text: "denied", ok: false } : it,
            );
          case "error":
            return [...prev, { id: localId(), kind: "error", text: e.text }];
        }
      });
      // Update chat list ordering after activity
      if (
        e.kind === "user" ||
        e.kind === "assistant-end" ||
        e.kind === "tool-result"
      ) {
        window.vibe.chats.list().then(setChats);
      }
    });
    const offBusy = window.vibe.onBusy((b) => {
      setBusy((prev) => {
        if (prev && !b) {
          if ((window as any).__vibeAborted) {
            (window as any).__vibeAborted = false;
          } else {
            playSound(successSfx);
          }
        }
        return b;
      });
    });
    const offConfirm = window.vibe.onConfirm(setPending);
    const offMax = window.vibe.onWindowMaximized((m) => {
      document.documentElement.setAttribute("data-window-maximized", m ? "true" : "false");
    });
    return () => {
      offEvent();
      offBusy();
      offConfirm();
      offMax();
    };
  }, []);

  const handleSlash = useCallback(
    (text: string): boolean => {
      const cmd = text.split(/\s+/)[0]!;
      switch (cmd) {
        case "/exit":
        case "/quit":
          window.close();
          return true;
        case "/skills": {
          setItems((p) => [
            ...p,
            { id: localId(), kind: "user", text },
            { id: localId(), kind: "skills-picker", text: "" },
          ]);
          return true;
        }
        case "/new": {
          const arg = text.slice(4).trim().toLowerCase();
          if (arg) {
            window.vibe.templates.list().then(async (templates) => {
              const match = templates.find((t) => t.id === arg || t.name.toLowerCase().includes(arg));
              if (match) {
                const res = await window.vibe.templates.use(match.id);
                if (!res.ok && res.error) {
                  setItems((p) => [...p, { id: localId(), kind: "error", text: res.error! }]);
                }
              } else {
                setItems((p) => [...p, { id: localId(), kind: "error", text: t("slash.template_not_found", { arg }) }]);
              }
            });
          } else {
            window.vibe.templates.list().then((templates) => {
              setItems((p) => [
                ...p,
                { id: localId(), kind: "user", text },
                {
                  id: localId(),
                  kind: "template-picker",
                  text: "",
                  templates: templates.map((t) => ({ id: t.id, name: t.name, description: t.description, icon: t.icon })),
                },
              ]);
            });
          }
          return true;
        }
        default:
          setItems((p) => [
            ...p,
            { id: localId(), kind: "user", text },
            {
              id: localId(),
              kind: "error",
              text: t("slash.unknown", { cmd }),
            },
          ]);
          return true;
      }
    },
    [config, folder, t],
  );

  const handleSubmit = useCallback(
    (payload: SendPayload | { slash: string }) => {
      if ("slash" in payload) {
        handleSlash(payload.slash);
        return;
      }
      const { parts, display, attachments } = payload;

      // Skill capture: if the message includes a #skills tag and at least one
      // text-like attachment (.md / .txt), treat the file contents as new
      // skills for this project. Don't forward the message to the AI.
      if (/(?:^|\s)#skills(?:\b|$)/i.test(display) && attachments.length > 0) {
        const candidates = attachments.filter((a) => {
          if (a.kind !== "file" || !a.path) return false;
          const lower = a.path.toLowerCase();
          return lower.endsWith(".md") || lower.endsWith(".markdown") || lower.endsWith(".txt");
        });
        if (candidates.length > 0) {
          (async () => {
            const added: string[] = [];
            for (const a of candidates) {
              if (!a.path) continue;
              // eslint-disable-next-line no-await-in-loop
              const res = await window.vibe.fs.read(a.path);
              if (res.ok) {
                const cleanName = a.name.replace(/\.(md|markdown|txt)$/i, "");
                addSkill(activeProject, {
                  name: cleanName,
                  content: res.content,
                  size: res.content.length,
                });
                added.push(cleanName);
              }
            }
            if (added.length > 0) {
              setItems((p) => [
                ...p,
                {
                  id: localId(),
                  kind: "info",
                  text: t("skills.added", { names: added.join(", ") }),
                },
              ]);
            }
          })();
          return;
        }
      }

      if (attachments.length > 0) {
        pendingAttachments.current = attachments.map((a) => ({
          id: a.id,
          kind: a.kind,
          name: a.name,
          path: a.path,
          dataUrl: a.dataUrl,
        }));
      }

      // PLAN MODE — if a separate planner model is configured, switch the
      // backend to it for this turn, then restore the executor model after
      // the planner reply ends. We only do this for fresh plan requests
      // (no ongoing plan with unfinished steps); follow-up messages stay on
      // the executor model.
      const mode = agentModeRef.current;
      const proj = activeProjectRef.current;
      const pickedPlanModel = planModelRef.current;
      const cfg = configRef.current;
      if (
        mode === "plan" &&
        pickedPlanModel &&
        cfg &&
        cfg.model !== pickedPlanModel &&
        proj
      ) {
        const latest = getLatestTask(proj);
        const hasOngoing = !!latest && latest.steps.some(function open(s): boolean {
          if (!s.done) return true;
          return (s.children ?? []).some(open);
        });
        if (!hasOngoing) {
          // remember executor model for restoration after planner finishes
          executorModelToRestore.current = cfg.model;
          void switchToModel(pickedPlanModel);
        }
      }

      // Smart routing: plain single text part with no display rewrite uses
      // the simpler `send`. When the visible `display` differs from what's
      // actually sent (e.g. plan mode wraps the user request in a system
      // prompt), we must go through `sendParts` so the chat shows `display`
      // instead of the raw prompt.
      if (
        parts.length === 1 &&
        parts[0]!.type === "text" &&
        parts[0]!.text === display
      ) {
        window.vibe.send(parts[0]!.text).then((res) => {
          if (!res.ok && res.error) {
            setItems((p) => [
              ...p,
              { id: localId(), kind: "error", text: res.error! },
            ]);
          }
        });
        return;
      }
      window.vibe.sendParts(parts as ContentPart[], display).then((res) => {
        if (!res.ok && res.error) {
          setItems((p) => [
            ...p,
            { id: localId(), kind: "error", text: res.error! },
          ]);
        }
      });
    },
    [handleSlash, activeProject, t],
  );

  const handleDecide = useCallback(
    (decision: "yes" | "no" | "always") => {
      if (!pending) return;
      window.vibe.decide(pending.id, decision);
      setPending(null);
    },
    [pending],
  );

  const handlePickFolder = useCallback(async () => {
    const picked = await window.vibe.pickWorkspace();
    if (picked) setFolder(picked);
  }, []);

  const handleOpenFile = useCallback((path: string) => {
    // If path is relative, resolve it against the workspace folder
    const isAbsolute = /^[A-Za-z]:[\\/]/.test(path) || path.startsWith("/");
    const resolved = isAbsolute ? path : ((folder ?? config?.cwd ?? "") + (path.includes("/") ? "/" : "\\") + path);
    setChangesOpen(false);
    setEditorPath(resolved);
    setEditorVisible(true);
    setOpenTabs((tabs) => tabs.includes(resolved) ? tabs : [...tabs, resolved]);
  }, [folder, config]);

  const handleCloseEditor = useCallback(() => {
    setEditorPath(null);
    setEditorVisible(false);
    setOpenTabs([]);
  }, []);

  const handleCloseTab = useCallback((path: string) => {
    setOpenTabs((tabs) => {
      const next = tabs.filter((t) => t !== path);
      if (editorPath === path) {
        if (next.length > 0) {
          setEditorPath(next[next.length - 1]!);
        } else {
          setEditorPath(null);
          setEditorVisible(false);
        }
      }
      return next;
    });
  }, [editorPath]);

  const handleSwitchTab = useCallback((path: string) => {
    setEditorPath(path);
  }, []);

  const handleNewChat = useCallback(async () => {
    const fresh = await window.vibe.chats.new();
    if (!fresh) return;
    setChats((p) => [fresh, ...p.filter((c) => c.id !== fresh.id)]);
    setActiveChat(fresh.id);
    setItems([]);
  }, []);

  const handlePickChat = useCallback(
    async (id: string) => {
      if (id === activeChat) return;
      const record = await window.vibe.chats.open(id);
      setActiveChat(id);
      setItems(record ? recordToItems(record) : []);
    },
    [activeChat],
  );

  const handleCloseChat = useCallback(
    async (id: string) => {
      await window.vibe.chats.delete(id);
      const list = await window.vibe.chats.list();
      if (list.length === 0) {
        const fresh = await window.vibe.chats.new();
        if (fresh) {
          setChats([fresh]);
          setActiveChat(fresh.id);
          setItems([]);
        }
        return;
      }
      setChats(list);
      if (activeChat === id) {
        const next = list[0]!;
        const record = await window.vibe.chats.open(next.id);
        setActiveChat(next.id);
        setItems(record ? recordToItems(record) : []);
      }
    },
    [activeChat],
  );

  /** Delete a chat in any project. If it was the active one, fall back to the
   *  next chat in that project (or create a fresh one). */
  const handleDeleteChatInProject = useCallback(
    async (projectId: string, chatId: string) => {
      await window.vibe.projects.deleteChat(projectId, chatId);
      // If the deleted chat was active in the active project, swap it out
      if (projectId === activeProject && chatId === activeChat) {
        const list = await window.vibe.chats.list();
        if (list.length === 0) {
          const fresh = await window.vibe.chats.new();
          if (fresh) {
            setChats([fresh]);
            setActiveChat(fresh.id);
            setItems([]);
          }
        } else {
          setChats(list);
          const next = list[0]!;
          const record = await window.vibe.chats.open(next.id);
          setActiveChat(next.id);
          setItems(record ? recordToItems(record) : []);
        }
      } else if (projectId === activeProject) {
        // Deleted a non-active chat in the current project — refresh list
        const list = await window.vibe.chats.list();
        setChats(list);
      }
    },
    [activeProject, activeChat],
  );

  const handleRenameChat = useCallback(
    async (id: string, title: string) => {
      await window.vibe.chats.rename(id, title);
      const list = await window.vibe.chats.list();
      setChats(list);
    },
    [],
  );

  /** Rename a chat in any project. */
  const handleRenameChatInProject = useCallback(
    async (projectId: string, chatId: string, title: string) => {
      await window.vibe.projects.renameChat(projectId, chatId, title);
      if (projectId === activeProject) {
        const list = await window.vibe.chats.list();
        setChats(list);
      }
    },
    [activeProject],
  );

  const handlePickProject = useCallback(
    async (id: string) => {
      if (id === activeProject) return;

      // Save current project's UI state
      saveProjectState(activeProject);

      const project = await window.vibe.projects.setActive(id);
      if (!project) return;
      setActiveProject(project.id);
      setFolder(project.path);
      setProjectChanges(loadProjectChanges(project.id));

      // Restore new project's UI state
      restoreProjectState(project.id);

      // Reset expand path
      setExpandToPath(null);

      // load that project's chats
      const list = await window.vibe.chats.list();
      if (list.length === 0) {
        const fresh = await window.vibe.chats.new();
        if (fresh) {
          setChats([fresh]);
          setActiveChat(fresh.id);
          setItems([]);
        }
        return;
      }
      setChats(list);
      const top = list[0]!;
      const record = await window.vibe.chats.open(top.id);
      setActiveChat(top.id);
      setItems(record ? recordToItems(record) : []);
    },
    [activeProject, openTabs, editorPath, editorVisible, termVisible, editorWidth, termHeight],
  );

  /** Open a specific chat from any project; switches the active project first if needed. */
  const handleOpenProjectChat = useCallback(
    async (projectId: string, chatId: string) => {
      if (projectId !== activeProject) {
        saveProjectState(activeProject);
        const project = await window.vibe.projects.setActive(projectId);
        if (!project) return;
        setActiveProject(project.id);
        setFolder(project.path);
        setProjectChanges(loadProjectChanges(project.id));
        restoreProjectState(project.id);
        setExpandToPath(null);
        const list = await window.vibe.chats.list();
        setChats(list);
      }
      const record = await window.vibe.chats.open(chatId);
      setActiveChat(chatId);
      setItems(record ? recordToItems(record) : []);
    },
    [activeProject, openTabs, editorPath, editorVisible, termVisible, editorWidth, termHeight],
  );

  /** Create a new chat session inside any project; switches active project first if needed. */
  const handleNewSessionFor = useCallback(
    async (projectId: string) => {
      if (projectId !== activeProject) {
        saveProjectState(activeProject);
        const project = await window.vibe.projects.setActive(projectId);
        if (!project) return;
        setActiveProject(project.id);
        setFolder(project.path);
        setProjectChanges(loadProjectChanges(project.id));
        restoreProjectState(project.id);
        setExpandToPath(null);
      }
      const fresh = await window.vibe.chats.new();
      if (!fresh) return;
      setChats((p) => [fresh, ...p.filter((c) => c.id !== fresh.id)]);
      setActiveChat(fresh.id);
      setItems([]);
    },
    [activeProject, openTabs, editorPath, editorVisible, termVisible, editorWidth, termHeight],
  );

  const handleAddProject = useCallback(async () => {
    const project = await window.vibe.projects.add();
    if (!project) return;
    const list = await window.vibe.projects.list();
    setProjects(list);
    setActiveProject(project.id);
    setFolder(project.path);
    setProjectChanges(loadProjectChanges(project.id));

    // Reset editor state
    setEditorPath(null);
    setOpenTabs([]);
    setEditorVisible(false);
    setTermVisible(false);

    // fresh chat for new project
    const chatList = await window.vibe.chats.list();
    if (chatList.length === 0) {
      const fresh = await window.vibe.chats.new();
      if (fresh) {
        setChats([fresh]);
        setActiveChat(fresh.id);
        setItems([]);
      }
    } else {
      setChats(chatList);
      const top = chatList[0]!;
      const record = await window.vibe.chats.open(top.id);
      setActiveChat(top.id);
      setItems(record ? recordToItems(record) : []);
    }
  }, []);

  const handleCloseProject = useCallback(async () => {
    await window.vibe.projects.close();
    setActiveProject(null);
    setActiveChat(null);
    setChats([]);
    setItems([]);
    setProjectChanges([]);
    setEditorPath(null);
    setOpenTabs([]);
    setEditorVisible(false);
    setTermVisible(false);
  }, []);

  const handleRemoveProject = useCallback(
    async (id: string) => {
      const next = await window.vibe.projects.remove(id);
      const list = await window.vibe.projects.list();
      setProjects(list);
      if (next) {
        setActiveProject(next.id);
        setFolder(next.path);
        setProjectChanges(loadProjectChanges(next.id));
        const chatList = await window.vibe.chats.list();
        setChats(chatList);
        if (chatList.length > 0) {
          const top = chatList[0]!;
          const record = await window.vibe.chats.open(top.id);
          setActiveChat(top.id);
          setItems(record ? recordToItems(record) : []);
        } else {
          setActiveChat(null);
          setItems([]);
        }
      } else {
        setActiveProject(null);
        setActiveChat(null);
        setChats([]);
        setItems([]);
        setEditorPath(null);
      }
    },
    [],
  );

  if (state.kind === "fatal") {
    return (
      <div className="app">
        <Titlebar />
        <div className="fatal">
          <div className="fatal__title">{t("app.fatal_title")}</div>
          <div className="fatal__msg">{state.error}</div>
          <div className="fatal__hint">
            {t("app.fatal_hint_prefix")} <code>VIBE_API_KEY</code>{t("app.fatal_hint_suffix")}
          </div>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="app">
        <Titlebar />
        <div className="busy">
          <span className="busy__dot" />
          <span className="busy__dot" />
          <span className="busy__dot" />
          <span>{t("common.starting")}</span>
        </div>
      </div>
    );
  }

  if (!activeProject) {
    return (
      <div className="app">
        <Titlebar />
        <div className="app__body">
          <ChatRail
            expanded={false}
            onToggleExpanded={() => {}}
            onSettings={() => setSettingsOpen(true)}
          />
          <div className="welcome">
            <img className="welcome__icon" src="./icon.png" alt="OpenVibe" draggable={false} />
            <div className="welcome__brand">OpenVibe</div>
            <div className="welcome__hint">
              {t("welcome.no_project")}
            </div>
            <button className="welcome__btn" onClick={handleAddProject}>
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M1.5 4.5h4l1.5 1.5h7.5v7a1 1 0 0 1-1 1h-12a1 1 0 0 1-1-1v-8.5z" />
              </svg>
              {t("welcome.open_project")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <Titlebar />
      <div className="app__body">
        <ChatRail
          expanded={chatSideOpen}
          onToggleExpanded={() => {
            setChatSideOpen((v) => !v);
          }}
          onSettings={() => setSettingsOpen(true)}
        />
        <ChatSidebar
          open={chatSideOpen}
          projects={projects}
          activeProjectId={activeProject}
          activeChatId={activeChat}
          onPickProjectChat={handleOpenProjectChat}
          onNewProject={handleAddProject}
          onNewSession={handleNewSessionFor}
          onRemoveProject={handleRemoveProject}
          onDeleteChat={handleDeleteChatInProject}
          onRenameChat={handleRenameChatInProject}
          onClose={() => setChatSideOpen(false)}
        />
        <div
          className={"chatside chatside--plan" + (planOpen ? " chatside--open" : "")}
          style={planOpen ? { width: planWidth, minWidth: planWidth } : undefined}
        >
          {planOpen ? (
            <>
              <Plan
                projectId={activeProject}
                onClose={() => setPlanOpen(false)}
                onRunStep={runPlanStep}
                runningStepId={runningStepId}
              />
              <div
                className="chatside__resize"
                onMouseDown={(e) => {
                  e.preventDefault();
                  document.body.style.userSelect = "none";
                  document.body.style.cursor = "col-resize";
                  const startX = e.clientX;
                  const startW = planWidth;
                  const onMove = (ev: MouseEvent) => {
                    const w = Math.max(240, Math.min(700, startW + (ev.clientX - startX)));
                    setPlanWidth(w);
                  };
                  const onUp = () => {
                    window.removeEventListener("mousemove", onMove);
                    window.removeEventListener("mouseup", onUp);
                    document.body.style.userSelect = "";
                    document.body.style.cursor = "";
                    localStorage.setItem("vibe_plan_width", String(planWidth));
                  };
                  window.addEventListener("mousemove", onMove);
                  window.addEventListener("mouseup", onUp);
                }}
              />
            </>
          ) : null}
        </div>
        <div className="app__content">
          <div className="layout">
            <div className="layout__main">
              <div className="tabs">
                <button
                  className={"tabs__btn tabs__btn--active"}
                  title={t("tabs.chat")}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                </button>
                <button
                  className={"tabs__btn" + (termVisible ? " tabs__btn--active" : "")}
                  onClick={() => setTermVisible(!termVisible)}
                  title={t("tabs.terminal")}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="4 17 10 11 4 5"/>
                    <line x1="12" y1="19" x2="20" y2="19"/>
                  </svg>
                </button>
                {agentMode === "plan" ? (
                  <button
                    className={"tabs__btn" + (planOpen ? " tabs__btn--active" : "")}
                    onClick={() => {
                      setPlanOpen((o) => !o);
                    }}
                    title={t("plan.title")}
                    aria-label={t("plan.title")}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1z" />
                      <path d="M16 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2" />
                      <polyline points="8.5 12 10.5 14 14 10.5" />
                      <line x1="8.5" y1="17" x2="15.5" y2="17" />
                    </svg>
                  </button>
                ) : null}
                <div className="tabs__spacer" />
                <button
                  className={"tabs__btn" + (editorVisible && editorPath ? " tabs__btn--active" : "")}
                  onClick={() => {
                    if (changesOpen) setChangesOpen(false);
                    if (editorPath) setEditorVisible(!editorVisible);
                  }}
                  title={t("tabs.editor")}
                  disabled={!editorPath}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 20h9"/>
                    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                  </svg>
                </button>
                <button
                  className={"tabs__btn" + (changesOpen ? " tabs__btn--active" : "")}
                  onClick={() => {
                    if (changesOpen) {
                      setChangesOpen(false);
                    } else {
                      setEditorVisible(false);
                      setChangesOpen(true);
                    }
                  }}
                  title={t("tabs.changes")}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="23 4 23 10 17 10" />
                    <polyline points="1 20 1 14 7 14" />
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" />
                    <path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14" />
                  </svg>
                </button>
                <button
                  className={"tabs__btn" + (sidebarVisible ? " tabs__btn--active" : "")}
                  onClick={() => setSidebarVisible(!sidebarVisible)}
                  title={t("tabs.toggle_files")}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                  </svg>
                </button>
                <button
                  className={"tabs__btn"}
                  onClick={() => setMcpOpen(true)}
                  title={t("tabs.mcp_servers")}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="2" width="20" height="8" rx="2"/>
                    <rect x="2" y="14" width="20" height="8" rx="2"/>
                    <circle cx="6" cy="6" r="1" fill="currentColor" stroke="none"/>
                    <circle cx="6" cy="18" r="1" fill="currentColor" stroke="none"/>
                  </svg>
                </button>
                <button
                  className={"tabs__btn"}
                  onClick={() => setSnapshotOpen(true)}
                  title={t("tabs.snapshots")}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                </button>
              </div>

              <div className="main__split">
                <div className={"main__chat" + (items.length === 0 ? " main__chat--empty" : "")}>
                  <History
                    items={items}
                    streamingId={streamingNow}
                    onShowTerminal={() => setTermVisible(true)}
                    onOpenFile={handleOpenFile}
                    workspace={folder ?? config?.cwd}
                    onPickModel={(id) => {
                      window.vibe.setModel(id);
                      if (config) setConfig({ ...config, model: id });
                      setItems((p) =>
                        p.map((it) =>
                          it.kind === "model-picker" ? { ...it, currentModel: id } : it,
                        ),
                      );
                    }}
                    onPickTemplate={(id) => {
                      window.vibe.templates.use(id).then((res) => {
                        if (!res.ok && res.error) {
                          setItems((p) => [...p, { id: localId(), kind: "error", text: res.error! }]);
                        }
                      });
                    }}
                    skillsList={skills.map((s) => ({ id: s.id, name: s.name, size: s.size, enabled: s.enabled }))}
                    onToggleSkill={(id) => {
                      const cur = skills.find((s) => s.id === id);
                      if (!cur) return;
                      setSkillEnabled(activeProject, id, !cur.enabled);
                    }}
                    onRemoveSkill={(id) => {
                      removeSkill(activeProject, id);
                    }}
                  />
                  {pending ? (
                    <Confirm payload={pending} onDecide={handleDecide} />
                  ) : (
                    <Composer
                      key={activeProject ?? "none"}
                      disabled={busy}
                      workspace={folder ?? config.cwd}
                      onSubmit={handleSubmit}
                      inject={chatInject}
                      onInjected={() => setChatInject(null)}
                      currentModel={config.model}
                      onPickModel={(model, apiKey, baseUrl) => {
                        window.vibe.setProvider(apiKey, baseUrl, model);
                        setConfig({ ...config, model, baseUrl, apiKey: "***" });
                      }}
                      planModel={planModel}
                      onPickPlanModel={handlePickPlanModel}
                      planActive={planActive}
                    />
                  )}
                </div>

                {termRender ? (
                  <div className={"main__terminal" + (termClosing ? " main__terminal--closing" : "")} style={{ height: termHeight }}>
                    <div
                      className="resize-handle"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        const startY = e.clientY;
                        const startH = termHeight;
                        const onMove = (ev: MouseEvent) => {
                          const diff = startY - ev.clientY;
                          setTermHeight(Math.max(100, Math.min(500, startH + diff)));
                        };
                        const onUp = () => {
                          window.removeEventListener("mousemove", onMove);
                          window.removeEventListener("mouseup", onUp);
                        };
                        window.addEventListener("mousemove", onMove);
                        window.addEventListener("mouseup", onUp);
                      }}
                    />
                    <Terminals active={true} />
                  </div>
                ) : null}
              </div>
            </div>

            {(editorRender || changesRender) ? (
              <>
                <div
                  className="layout__divider"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    const startX = e.clientX;
                    const startW = editorWidth;
                    const onMove = (ev: MouseEvent) => {
                      const diff = startX - ev.clientX;
                      setEditorWidth(Math.max(200, Math.min(900, startW + diff)));
                    };
                    const onUp = () => {
                      window.removeEventListener("mousemove", onMove);
                      window.removeEventListener("mouseup", onUp);
                    };
                    window.addEventListener("mousemove", onMove);
                    window.addEventListener("mouseup", onUp);
                  }}
                />
                <div className="layout__rightslot" style={{ width: editorWidth }}>
                  {editorRender ? (
                    <div className={"layout__editor" + (editorClosing ? " layout__editor--closing" : "")}>
                      {editorPath ? (
                        <Editor
                          path={editorPath}
                          cwd={folder ?? config.cwd}
                          onClose={handleCloseEditor}
                          openTabs={openTabs}
                          activeTab={editorPath}
                          onSwitchTab={handleSwitchTab}
                          onCloseTab={handleCloseTab}
                          onNavigate={(folderPath) => {
                            setSidebarVisible(true);
                            setExpandToPath(folderPath);
                          }}
                          onSendToChat={(ctx) => setChatInject(ctx)}
                        />
                      ) : null}
                    </div>
                  ) : null}
                  {changesRender ? (
                    <div className={"layout__editor layout__changes" + (changesClosing ? " layout__editor--closing" : "")}>
                      <Changes
                        items={projectChanges}
                        workspace={folder ?? config.cwd}
                        onClose={() => setChangesOpen(false)}
                        onResolve={(id) => {
                          setProjectChanges((cur) => {
                            const next = cur.filter((c) => c.id !== id);
                            saveProjectChanges(activeProject, next);
                            return next;
                          });
                        }}
                      />
                    </div>
                  ) : null}
                </div>
              </>
            ) : null}

            <aside className={"sidebar" + (sidebarVisible ? " sidebar--open" : "")}>
              <FileTree
                cwd={folder ?? config.cwd}
                onPickFolder={handlePickFolder}
                onOpenFile={handleOpenFile}
                activeFile={editorPath}
                expandToPath={expandToPath}
                onExpandDone={() => setExpandToPath(null)}
              />
            </aside>
          </div>
        </div>
      </div>
      <Settings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onProviderChanged={(model, baseUrl) => {
          if (config) setConfig({ ...config, model, baseUrl, apiKey: "***" });
        }}
      />
      {mcpOpen ? <McpPanel onClose={() => setMcpOpen(false)} /> : null}
      {snapshotOpen ? <SnapshotPanel onClose={() => setSnapshotOpen(false)} /> : null}
    </div>
  );
}


function McpPanel({ onClose }: { onClose: () => void }): React.ReactElement {
  const t = useT();
  const [servers, setServers] = useState<Array<{ id: string; name: string; connected: boolean; toolCount: number }>>([]);
  const [adding, setAdding] = useState(false);
  const [closing, setClosing] = useState(false);

  function handleClose(): void {
    setClosing(true);
    setTimeout(() => onClose(), 200);
  }
  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [envStr, setEnvStr] = useState("");

  useEffect(() => {
    window.vibe.mcp.list().then(setServers);
  }, []);

  async function handleAdd(): Promise<void> {
    if (!name.trim() || !command.trim()) return;
    const env: Record<string, string> = {};
    for (const line of envStr.split("\n")) {
      const eq = line.indexOf("=");
      if (eq > 0) {
        env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
      }
    }
    await window.vibe.mcp.add({
      name: name.trim(),
      command: command.trim(),
      args: args.trim() ? args.trim().split(" ") : [],
      env: Object.keys(env).length > 0 ? env : undefined,
    });
    setName("");
    setCommand("");
    setArgs("");
    setEnvStr("");
    setAdding(false);
    setServers(await window.vibe.mcp.list());
  }

  async function handleConnect(id: string): Promise<void> {
    await window.vibe.mcp.connect(id);
    setServers(await window.vibe.mcp.list());
  }

  async function handleDisconnect(id: string): Promise<void> {
    await window.vibe.mcp.disconnect(id);
    setServers(await window.vibe.mcp.list());
  }

  async function handleRemove(id: string): Promise<void> {
    await window.vibe.mcp.remove(id);
    setServers(await window.vibe.mcp.list());
  }

  return (
    <div className={"settings__overlay" + (closing ? " settings__overlay--closing" : "")} onClick={handleClose}>
      <div className={"settings settings--medium" + (closing ? " settings--closing" : "")} onClick={(e) => e.stopPropagation()}>
        <div className="settings__header">
          <h2>{t("mcp.title")}</h2>
          <button className="settings__close" onClick={handleClose} aria-label={t("common.close")}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="settings__list">
          {servers.length === 0 && !adding ? (
            <div style={{ color: "var(--fg-muted)", fontSize: 12, padding: "12px 0" }}>
              {t("mcp.empty")}
            </div>
          ) : null}

          {servers.map((s) => (
            <div key={s.id} className="settings__row">
              <div className="settings__row-info">
                <div className="settings__row-name">
                  {s.name}
                  {s.connected ? (
                    <span className="settings__connected">{t("mcp.tools", { n: s.toolCount })}</span>
                  ) : null}
                </div>
                <div className="settings__row-desc">
                  {s.connected ? t("mcp.connected") : t("mcp.disconnected")}
                </div>
              </div>
              <div className="settings__row-actions">
                {s.connected ? (
                  <button className="settings__disconnect" onClick={() => handleDisconnect(s.id)}>
                    {t("common.disconnect")}
                  </button>
                ) : (
                  <button className="settings__connect" onClick={() => handleConnect(s.id)}>
                    {t("common.connect")}
                  </button>
                )}
                <button className="settings__disconnect" onClick={() => handleRemove(s.id)}>
                  {t("common.remove")}
                </button>
              </div>
            </div>
          ))}
        </div>

        {adding ? (
          <div className="settings__form" style={{ marginTop: 16 }}>
            <label className="settings__label">
              {t("settings.name")}
              <input className="settings__input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("mcp.name_placeholder")} />
            </label>
            <label className="settings__label">
              {t("mcp.command")}
              <input className="settings__input" value={command} onChange={(e) => setCommand(e.target.value)} placeholder={t("mcp.command_placeholder")} />
            </label>
            <label className="settings__label">
              {t("mcp.args")}
              <input className="settings__input" value={args} onChange={(e) => setArgs(e.target.value)} placeholder={t("mcp.args_placeholder")} />
            </label>
            <label className="settings__label">
              {t("mcp.env")}
              <textarea className="settings__input" value={envStr} onChange={(e) => setEnvStr(e.target.value)} placeholder={t("mcp.env_placeholder")} style={{ minHeight: 50, resize: "vertical" }} />
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="settings__save" onClick={handleAdd}>{t("mcp.add_server")}</button>
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 16 }}>
            <button className="settings__connect" onClick={() => setAdding(true)}>
              {t("mcp.add_button")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}


function SnapshotPanel({ onClose }: { onClose: () => void }): React.ReactElement {
  const t = useT();
  const [snapshots, setSnapshots] = useState<Array<{ name: string; path: string; size: number; date: string }>>([]);
  const [creating, setCreating] = useState(false);
  const [closing, setClosing] = useState(false);

  function handleClose(): void {
    setClosing(true);
    setTimeout(() => onClose(), 200);
  }

  useEffect(() => {
    window.vibe.snapshot.list().then(setSnapshots);
  }, []);

  async function handleCreate(): Promise<void> {
    setCreating(true);
    const res = await window.vibe.snapshot.create();
    setCreating(false);
    if (res.ok) {
      // Immediately refresh list
      const list = await window.vibe.snapshot.list();
      setSnapshots(list);
    }
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <div className={"settings__overlay" + (closing ? " settings__overlay--closing" : "")} onClick={handleClose}>
      <div className={"settings settings--medium" + (closing ? " settings--closing" : "")} onClick={(e) => e.stopPropagation()}>
        <div className="settings__header">
          <h2>{t("snap.title")}</h2>
          <button className="settings__close" onClick={handleClose} aria-label={t("common.close")}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div style={{ color: "var(--fg-muted)", fontSize: 12, marginBottom: 12 }}>
          {t("snap.desc")}
        </div>

        <div className="settings__list" style={{ maxHeight: 320, overflowY: "auto" }}>
          {snapshots.length === 0 ? (
            <div style={{ color: "var(--fg-muted)", fontSize: 12, padding: "12px 0" }}>
              {t("snap.empty")}
            </div>
          ) : null}

          {snapshots.map((s) => (
            <div key={s.name} className="settings__row">
              <div className="settings__row-info">
                <div className="settings__row-name" style={{ fontSize: 12 }}>{s.name}</div>
                <div className="settings__row-desc">
                  {formatSize(s.size)} · {new Date(s.date).toLocaleString()}
                </div>
              </div>
              <button className="settings__connect" onClick={() => window.vibe.snapshot.reveal(s.path)}>
                {t("snap.show")}
              </button>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 16 }}>
          <button className="settings__connect" onClick={handleCreate} disabled={creating}>
            {creating ? t("snap.creating") : t("snap.create")}
          </button>
        </div>
      </div>
    </div>
  );
}

