// lib/goal-store.ts
// Persistent goal state — stored in localStorage.
// Goals are high-level objectives that Kimi decomposes into ordered milestones.
// Each milestone maps directly to one WorkflowEngine run.

export type GoalStatus      = "draft" | "pending" | "running" | "paused" | "complete" | "failed";
export type MilestoneStatus = "pending" | "running" | "complete" | "failed" | "skipped";

export interface Milestone {
  id:           string;
  label:        string;        // short description shown in panel
  task:         string;        // the exact string sent to WorkflowEngine
  status:       MilestoneStatus;
  result?:      string;        // summary collected after completion
  startedAt?:   number;
  completedAt?: number;
}

export interface Goal {
  id:              string;
  title:           string;
  objective:       string;     // user-written goal description
  successCriteria: string;     // how the user defines "done"
  constraints?:    string;     // optional: "US only", "max 10 tabs", etc.
  status:          GoalStatus;
  milestones:      Milestone[];
  currentIdx:      number;     // which milestone is next to run (0-based)
  results:         string[];   // accumulated results across milestones
  createdAt:       number;
  updatedAt:       number;
}

const STORAGE_KEY = "pushpa_goals_v1";

function load(): Goal[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function save(goals: Goal[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(goals));
}

export const goalStore = {
  getAll(): Goal[] {
    return load();
  },

  get(id: string): Goal | undefined {
    return load().find(g => g.id === id);
  },

  upsert(goal: Goal): void {
    const goals = load();
    const idx = goals.findIndex(g => g.id === goal.id);
    if (idx === -1) goals.push(goal);
    else            goals[idx] = goal;
    save(goals);
  },

  updateGoal(id: string, patch: Partial<Goal>): Goal | null {
    const goals = load();
    const idx   = goals.findIndex(g => g.id === id);
    if (idx === -1) return null;
    goals[idx] = { ...goals[idx], ...patch, updatedAt: Date.now() };
    save(goals);
    return goals[idx];
  },

  updateMilestone(goalId: string, milestoneId: string, patch: Partial<Milestone>): Goal | null {
    const goals = load();
    const gIdx  = goals.findIndex(g => g.id === goalId);
    if (gIdx === -1) return null;
    const mIdx  = goals[gIdx].milestones.findIndex(m => m.id === milestoneId);
    if (mIdx === -1) return null;
    goals[gIdx].milestones[mIdx] = { ...goals[gIdx].milestones[mIdx], ...patch };
    goals[gIdx].updatedAt = Date.now();
    save(goals);
    return goals[gIdx];
  },

  delete(id: string): void {
    save(load().filter(g => g.id !== id));
  },
};

export function makeGoal(
  title: string,
  objective: string,
  successCriteria: string,
  constraints: string,
  milestones: Pick<Milestone, "label" | "task">[],
): Goal {
  const now = Date.now();
  return {
    id:              `goal_${now}_${Math.random().toString(36).slice(2, 6)}`,
    title,
    objective,
    successCriteria,
    constraints:     constraints || undefined,
    status:          "pending",
    milestones:      milestones.map((m, i) => ({
      id:      `ms_${now}_${i}`,
      label:   m.label,
      task:    m.task,
      status:  "pending",
    })),
    currentIdx: 0,
    results:    [],
    createdAt:  now,
    updatedAt:  now,
  };
}
