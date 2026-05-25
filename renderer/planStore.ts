// Plan store: tasks + steps per project.
// Each task = a user request in plan mode; steps are parsed from
// the assistant's plan output (bullet/numbered lines).

import { useEffect, useState } from "react";

export interface PlanStep {
  id: string;
  text: string;
  done: boolean;
  /** Nested sub-steps under this step */
  children?: PlanStep[];
}

export interface PlanTask {
  id: string;
  title: string;
  createdAt: number;
  steps: PlanStep[];
}

export type ProjectPlans = Record<string, PlanTask[]>;

const EVENT = "vibe-plan-change";

function key(projectId: string): string {
  return `vibe_plans_${projectId}`;
}

export function loadPlans(projectId: string): PlanTask[] {
  const raw = localStorage.getItem(key(projectId));
  if (!raw) return [];
  try { return JSON.parse(raw) as PlanTask[]; } catch { return []; }
}

export function savePlans(projectId: string, plans: PlanTask[]): void {
  localStorage.setItem(key(projectId), JSON.stringify(plans));
  window.dispatchEvent(new CustomEvent(EVENT, { detail: projectId }));
}

let idSeq = 0;
const newId = (): string => `pl${++idSeq}-${Date.now().toString(36)}`;

export function addTask(projectId: string, title: string): PlanTask {
  const plans = loadPlans(projectId);
  const task: PlanTask = {
    id: newId(),
    title,
    createdAt: Date.now(),
    steps: [],
  };
  plans.unshift(task);
  savePlans(projectId, plans);
  return task;
}

/** Parse markdown plan output into a tree of steps with sub-steps */
export function extractSteps(text: string): PlanStep[] {
  // Prefer the dedicated Strategy section; fall back to any list lines.
  const stratRe = /##\s*(Strategy|Стратегия|Estrategia|Strategie|Stratégie|策略)\s*\n([\s\S]+?)(?:\n##\s|$)/i;
  const m = stratRe.exec(text);
  const slice = m ? m[2]! : text;
  return parseListAsSteps(slice);
}

function parseListAsSteps(text: string): PlanStep[] {
  const out: PlanStep[] = [];
  const lines = text.split(/\r?\n/);
  let lastTop: PlanStep | null = null;
  for (const raw of lines) {
    const indentMatch = /^(\s*)([-*•]|\d+[.)])\s+(.+)$/.exec(raw);
    if (!indentMatch) continue;
    const indent = indentMatch[1]!.length;
    const content = indentMatch[3]!.trim().replace(/^\*\*|\*\*$/g, "").trim();
    if (content.length < 2) continue;
    if (indent === 0) {
      const step: PlanStep = { id: newId(), text: content, done: false, children: [] };
      out.push(step);
      lastTop = step;
    } else if (lastTop) {
      lastTop.children!.push({ id: newId(), text: content, done: false });
    } else {
      const step: PlanStep = { id: newId(), text: content, done: false, children: [] };
      out.push(step);
      lastTop = step;
    }
  }
  return out;
}

export function setStepsForLastTask(projectId: string, steps: PlanStep[]): void {
  if (steps.length === 0) return;
  const plans = loadPlans(projectId);
  if (plans.length === 0) return;
  const task = plans[0]!;
  // Reset and apply parsed steps so the panel reflects the latest plan output
  task.steps = steps;
  savePlans(projectId, plans);
}

export function toggleStep(projectId: string, taskId: string, stepId: string): void {
  const plans = loadPlans(projectId);
  const task = plans.find((t) => t.id === taskId);
  if (!task) return;
  function toggle(steps: PlanStep[]): boolean {
    for (const s of steps) {
      if (s.id === stepId) { s.done = !s.done; return true; }
      if (s.children && toggle(s.children)) return true;
    }
    return false;
  }
  if (!toggle(task.steps)) return;
  savePlans(projectId, plans);
}

/** Mark a specific step as done by id. Used by the executor stream parser. */
export function markStepDone(projectId: string, stepId: string): void {
  const plans = loadPlans(projectId);
  function mark(steps: PlanStep[]): boolean {
    for (const s of steps) {
      if (s.id === stepId) { if (s.done) return true; s.done = true; return true; }
      if (s.children && mark(s.children)) return true;
    }
    return false;
  }
  for (const task of plans) {
    if (mark(task.steps)) {
      savePlans(projectId, plans);
      return;
    }
  }
}

/** Collect ids of all steps (and sub-steps) in display order */
export function collectStepIds(steps: PlanStep[]): Array<{ id: string; text: string; depth: number }> {
  const out: Array<{ id: string; text: string; depth: number }> = [];
  function walk(list: PlanStep[], depth: number): void {
    for (const s of list) {
      out.push({ id: s.id, text: s.text, depth });
      if (s.children) walk(s.children, depth + 1);
    }
  }
  walk(steps, 0);
  return out;
}

/** Find the most recent task for a project (the one currently being executed) */
export function getLatestTask(projectId: string): PlanTask | null {
  const plans = loadPlans(projectId);
  return plans[0] ?? null;
}

export function deleteTask(projectId: string, taskId: string): void {
  const plans = loadPlans(projectId).filter((t) => t.id !== taskId);
  savePlans(projectId, plans);
}

export function clearAllTasks(projectId: string): void {
  savePlans(projectId, []);
}

export function progress(task: PlanTask): { done: number; total: number; pct: number } {
  let total = 0;
  let done = 0;
  function walk(steps: PlanStep[]): void {
    for (const s of steps) {
      total++;
      if (s.done) done++;
      if (s.children && s.children.length > 0) walk(s.children);
    }
  }
  walk(task.steps);
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return { done, total, pct };
}

export function usePlans(projectId: string | null): PlanTask[] {
  const [plans, setPlans] = useState<PlanTask[]>(() => projectId ? loadPlans(projectId) : []);
  useEffect(() => {
    if (!projectId) { setPlans([]); return; }
    setPlans(loadPlans(projectId));
    function onChange(e: Event): void {
      const detail = (e as CustomEvent).detail;
      if (detail === projectId) setPlans(loadPlans(projectId!));
    }
    window.addEventListener(EVENT, onChange as EventListener);
    return () => window.removeEventListener(EVENT, onChange as EventListener);
  }, [projectId]);
  return plans;
}
