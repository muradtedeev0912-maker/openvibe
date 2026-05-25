// Skills: long-lived knowledge the AI is taught via "#skills" + a .md/.txt
// attachment. Each entry is per-project. Active skills are merged into the
// agent's context as a transient system message on every turn.

export interface Skill {
  id: string;
  name: string;
  size: number;
  addedAt: number;
  content: string;
  enabled: boolean;
}

const PREFIX = "vibe_skills_";
const EVENT = "vibe-skills-change";

function key(projectId: string | null): string {
  return PREFIX + (projectId ?? "global");
}

export function loadSkills(projectId: string | null): Skill[] {
  const raw = localStorage.getItem(key(projectId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Array<Partial<Skill> & { id: string; name: string; content: string }>;
    return parsed.map((e) => ({
      id: e.id,
      name: e.name,
      size: typeof e.size === "number" ? e.size : (e.content ?? "").length,
      addedAt: typeof e.addedAt === "number" ? e.addedAt : Date.now(),
      content: e.content ?? "",
      enabled: typeof e.enabled === "boolean" ? e.enabled : true,
    }));
  } catch {
    return [];
  }
}

export function saveSkills(projectId: string | null, skills: Skill[]): void {
  localStorage.setItem(key(projectId), JSON.stringify(skills));
  pushSkillsToAgent(skills);
  window.dispatchEvent(new CustomEvent(EVENT, { detail: projectId }));
}

let idSeq = 0;
const newId = (): string => `sk${++idSeq}-${Date.now().toString(36)}`;

export function addSkill(
  projectId: string | null,
  input: { name: string; content: string; size?: number },
): Skill {
  const skill: Skill = {
    id: newId(),
    name: input.name,
    size: input.size ?? input.content.length,
    addedAt: Date.now(),
    content: input.content,
    enabled: true,
  };
  const list = loadSkills(projectId);
  list.push(skill);
  saveSkills(projectId, list);
  return skill;
}

export function removeSkill(projectId: string | null, id: string): void {
  const next = loadSkills(projectId).filter((s) => s.id !== id);
  saveSkills(projectId, next);
}

export function setSkillEnabled(projectId: string | null, id: string, enabled: boolean): void {
  const next = loadSkills(projectId).map((s) => (s.id === id ? { ...s, enabled } : s));
  saveSkills(projectId, next);
}

export function clearSkills(projectId: string | null): void {
  saveSkills(projectId, []);
}

/** Send the active (enabled) skills to the agent so the AI starts using them. */
export function pushSkillsToAgent(skills: Skill[]): void {
  const items = skills
    .filter((s) => s.enabled !== false && s.content.trim().length > 0)
    .map((s) => ({ id: s.id, name: s.name, content: s.content }));
  window.vibe?.skills?.set(items).catch(() => {});
}

export function onSkillsChange(cb: (projectId: string) => void): () => void {
  const handler = (e: Event): void => {
    const detail = (e as CustomEvent).detail;
    if (typeof detail === "string") cb(detail);
  };
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
