"use client";
import React, {
  useState, useEffect, useCallback, useRef,
} from "react";
import {
  goalStore, makeGoal,
  type Goal, type Milestone, type GoalStatus,
} from "@/lib/goal-store";

// ── Colour helpers ────────────────────────────────────────────────────────────
const STATUS_COLOR: Record<GoalStatus, string> = {
  draft:    "var(--muted)",
  pending:  "var(--text-dim)",
  running:  "var(--accent)",
  paused:   "var(--warn)",
  complete: "var(--success)",
  failed:   "var(--danger)",
};
const STATUS_DOT: Record<GoalStatus, string> = {
  draft:    "var(--border)",
  pending:  "var(--muted)",
  running:  "var(--accent)",
  paused:   "var(--warn)",
  complete: "var(--success)",
  failed:   "var(--danger)",
};
const MS_ICON: Record<Milestone["status"], string> = {
  pending:  "○",
  running:  "▶",
  complete: "✓",
  failed:   "✗",
  skipped:  "–",
};

// ── New goal form ─────────────────────────────────────────────────────────────
interface NewGoalFormProps {
  onCreated: (goal: Goal) => void;
  onCancel:  () => void;
}
// Placeholder suggestions per detected service
const GOAL_PLACEHOLDERS: Record<string, { goal: string; criteria: string; constraints: string }> = {
  linkedin:  { goal: "Apply to 10 PM jobs at Series A–B startups",          criteria: "When 10 applications are submitted and confirmed",    constraints: "US remote only, min $150k salary" },
  indeed:    { goal: "Find and apply to 5 remote engineering jobs on Indeed", criteria: "When 5 applications are submitted",                   constraints: "Remote, $130k+, no agencies" },
  gmail:     { goal: "Inbox zero — process all unread emails",               criteria: "When inbox shows 0 unread",                           constraints: "Archive newsletters, reply to action items" },
  outlook:   { goal: "Process all unread Outlook emails and draft replies",  criteria: "When all emails have a draft reply or are archived",   constraints: "Prioritise emails from my team" },
  amazon:    { goal: "Track all pending Amazon orders and check delivery",   criteria: "When all order statuses are confirmed",                constraints: "Flag anything delayed by 2+ days" },
  github:    { goal: "Review and merge all open pull requests",              criteria: "When zero open PRs remain",                           constraints: "Skip PRs with failing CI" },
  stripe:    { goal: "Generate last 30-day revenue report from Stripe",      criteria: "When report CSV is downloaded",                       constraints: "Break down by product and country" },
  hubspot:   { goal: "Qualify and follow up with all new HubSpot leads",     criteria: "When all leads are contacted or marked disqualified",  constraints: "Only leads from the last 7 days" },
  airbnb:    { goal: "Book an Airbnb in Lisbon for 5 nights",                criteria: "When booking is confirmed with reference number",      constraints: "Max $120/night, 4+ stars, central location" },
  twitter:   { goal: "Post 3 threads about my product this week",            criteria: "When 3 threads are published with 500+ impressions",   constraints: "Keep tone professional and concise" },
};

function NewGoalForm({ onCreated, onCancel }: NewGoalFormProps) {
  const [objective,        setObjective]        = useState("");
  const [successCriteria,  setSuccessCriteria]  = useState("");
  const [constraints,      setConstraints]      = useState("");
  const [planning,         setPlanning]         = useState(false);
  const [milestones,       setMilestones]       = useState<Array<{ label: string; task: string }>>([]);
  const [editIdx,          setEditIdx]          = useState<number | null>(null);
  const [error,            setError]            = useState("");
  const [detectedServices, setDetectedServices] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/agent/context")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.services?.length) setDetectedServices(d.services); })
      .catch(() => {});
  }, []);

  const plan = useCallback(async () => {
    if (!objective.trim()) return;
    setPlanning(true);
    setError("");
    setMilestones([]);
    try {
      const res  = await fetch("/api/goal-decompose", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ objective, successCriteria, constraints }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Decompose failed");
      setMilestones(data.milestones ?? []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setPlanning(false);
    }
  }, [objective, successCriteria, constraints]);

  const create = () => {
    if (!objective.trim() || milestones.length === 0) return;
    const title = objective.length > 50 ? objective.slice(0, 50) + "…" : objective;
    const goal  = makeGoal(title, objective, successCriteria, constraints, milestones);
    goalStore.upsert(goal);
    onCreated(goal);
  };

  const updateMilestone = (i: number, field: "label" | "task", val: string) => {
    setMilestones(prev => prev.map((m, j) => j === i ? { ...m, [field]: val } : m));
  };

  const removeMilestone = (i: number) => {
    setMilestones(prev => prev.filter((_, j) => j !== i));
  };

  const moveMilestone = (i: number, dir: -1 | 1) => {
    setMilestones(prev => {
      const next = [...prev];
      const tmp  = next[i]; next[i] = next[i + dir]; next[i + dir] = tmp;
      return next;
    });
  };

  // Pick placeholder set from first detected service that has entries, fallback to job-search defaults
  const detectedKey    = detectedServices.find(s => GOAL_PLACEHOLDERS[s]) ?? null;
  const ph             = detectedKey ? GOAL_PLACEHOLDERS[detectedKey] : {
    goal:        "Apply to 50 PM jobs at Series A startups in the US",
    criteria:    "When 50 applications have been submitted and confirmed",
    constraints: "US companies only, min $150k salary, no agencies",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Objective */}
      <div>
        <label style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".06em", display: "block", marginBottom: 5 }}>
          What's the goal?
        </label>
        <textarea
          value={objective}
          onChange={e => setObjective(e.target.value)}
          placeholder={ph.goal}
          rows={2}
          style={{
            width: "100%", background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: 8, padding: "8px 10px", fontSize: 12, color: "var(--text)",
            resize: "none", fontFamily: "'DM Sans', sans-serif", outline: "none",
            boxSizing: "border-box",
          }}
        />
      </div>

      {/* Success criteria */}
      <div>
        <label style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".06em", display: "block", marginBottom: 5 }}>
          How will you know it's done?
        </label>
        <textarea
          value={successCriteria}
          onChange={e => setSuccessCriteria(e.target.value)}
          placeholder={ph.criteria}
          rows={2}
          style={{
            width: "100%", background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: 8, padding: "8px 10px", fontSize: 12, color: "var(--text)",
            resize: "none", fontFamily: "'DM Sans', sans-serif", outline: "none",
            boxSizing: "border-box",
          }}
        />
      </div>

      {/* Constraints */}
      <div>
        <label style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".06em", display: "block", marginBottom: 5 }}>
          Constraints <span style={{ fontWeight: 400, textTransform: "none" }}>(optional)</span>
        </label>
        <input
          value={constraints}
          onChange={e => setConstraints(e.target.value)}
          placeholder={ph.constraints}
          style={{
            width: "100%", background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: 8, padding: "8px 10px", fontSize: 12, color: "var(--text)",
            fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box",
          }}
        />
      </div>

      {error && (
        <div style={{ fontSize: 11, color: "var(--danger)", padding: "6px 10px",
          background: "color-mix(in srgb,var(--danger) 10%,transparent)",
          border: "1px solid color-mix(in srgb,var(--danger) 30%,transparent)", borderRadius: 6 }}>
          {error}
        </div>
      )}

      {/* Plan button */}
      {milestones.length === 0 && (
        <button
          onClick={plan}
          disabled={!objective.trim() || planning}
          style={{
            background: objective.trim() && !planning ? "var(--accent)" : "var(--border)",
            color: objective.trim() && !planning ? "#fff" : "var(--muted)",
            border: "none", borderRadius: 8, padding: "9px 0",
            fontSize: 13, fontWeight: 600, cursor: objective.trim() ? "pointer" : "default",
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          {planning ? "Planning with Arya…" : "✦ Plan with AI →"}
        </button>
      )}

      {/* Milestones review */}
      {milestones.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>
            {milestones.length} Milestones — review & edit before starting
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 220, overflowY: "auto" }}>
            {milestones.map((m, i) => (
              <div key={i} style={{
                background: "var(--surface)", border: "1px solid var(--border)",
                borderRadius: 8, padding: "8px 10px",
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "var(--accent)", fontFamily: "monospace", flexShrink: 0 }}>
                    {i + 1}
                  </span>
                  {editIdx === i ? (
                    <input
                      value={m.label}
                      onChange={e => updateMilestone(i, "label", e.target.value)}
                      style={{
                        flex: 1, background: "none", border: "none", outline: "none",
                        fontSize: 12, fontWeight: 600, color: "var(--text)", fontFamily: "'DM Sans',sans-serif",
                      }}
                    />
                  ) : (
                    <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{m.label}</span>
                  )}
                  <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
                    <button onClick={() => i > 0 && moveMilestone(i, -1)} disabled={i === 0}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 10, padding: "1px 3px", opacity: i === 0 ? .3 : 1 }}>↑</button>
                    <button onClick={() => i < milestones.length - 1 && moveMilestone(i, 1)} disabled={i === milestones.length - 1}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 10, padding: "1px 3px", opacity: i === milestones.length - 1 ? .3 : 1 }}>↓</button>
                    <button onClick={() => setEditIdx(editIdx === i ? null : i)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: editIdx === i ? "var(--accent)" : "var(--muted)", fontSize: 10, padding: "1px 5px" }}>✎</button>
                    <button onClick={() => removeMilestone(i)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--danger)", fontSize: 11, padding: "1px 4px", opacity: .6 }}>×</button>
                  </div>
                </div>
                {editIdx === i && (
                  <textarea
                    value={m.task}
                    onChange={e => updateMilestone(i, "task", e.target.value)}
                    rows={2}
                    style={{
                      width: "100%", background: "var(--panel)", border: "1px solid var(--border)",
                      borderRadius: 5, padding: "5px 8px", fontSize: 11, color: "var(--text-dim)",
                      fontFamily: "'DM Sans',sans-serif", resize: "none", outline: "none",
                      marginTop: 6, boxSizing: "border-box",
                    }}
                  />
                )}
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button
              onClick={plan}
              style={{
                flex: 1, background: "var(--surface)", border: "1px solid var(--border)",
                borderRadius: 8, padding: "7px 0", fontSize: 12, color: "var(--muted)",
                cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
              }}
            >
              ↺ Re-plan
            </button>
            <button
              onClick={create}
              style={{
                flex: 2, background: "var(--accent)", border: "none",
                borderRadius: 8, padding: "7px 0", fontSize: 13, fontWeight: 600,
                color: "#fff", cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
              }}
            >
              ◎ Save Goal →
            </button>
          </div>
        </div>
      )}

      <button onClick={onCancel} style={{
        background: "none", border: "none", cursor: "pointer",
        fontSize: 11, color: "var(--muted)", textDecoration: "underline",
      }}>
        Cancel
      </button>
    </div>
  );
}

// ── Active goal card ──────────────────────────────────────────────────────────
interface GoalCardProps {
  goal:      Goal;
  onRun:     (task: string, goalId: string, milestoneId: string) => void;
  onRefresh: () => void;
}
function GoalCard({ goal, onRun, onRefresh }: GoalCardProps) {
  const [expanded,  setExpanded]  = useState(goal.status === "running" || goal.status === "pending");
  const [resultDraft, setResultDraft] = useState("");
  const current = goal.milestones[goal.currentIdx];
  const done    = goal.milestones.filter(m => m.status === "complete").length;
  const total   = goal.milestones.length;
  const pct     = total > 0 ? Math.round((done / total) * 100) : 0;

  const runCurrent = () => {
    if (!current || goal.status === "complete") return;
    // Mark goal as running + milestone as running
    goalStore.updateGoal(goal.id, { status: "running" });
    goalStore.updateMilestone(goal.id, current.id, { status: "running", startedAt: Date.now() });
    onRefresh();
    onRun(current.task, goal.id, current.id);
  };

  const markCurrentDone = (result?: string) => {
    const g = goalStore.get(goal.id);
    if (!g || !current) return;
    goalStore.updateMilestone(g.id, current.id, { status: "complete", completedAt: Date.now(), result: result || "Completed" });
    const nextIdx = g.currentIdx + 1;
    if (nextIdx >= g.milestones.length) {
      goalStore.updateGoal(g.id, { status: "complete", currentIdx: nextIdx });
    } else {
      goalStore.updateGoal(g.id, { status: "paused", currentIdx: nextIdx });
    }
    onRefresh();
  };

  const skipCurrent = () => {
    const g = goalStore.get(goal.id);
    if (!g || !current) return;
    goalStore.updateMilestone(g.id, current.id, { status: "skipped" });
    const nextIdx = g.currentIdx + 1;
    if (nextIdx >= g.milestones.length) {
      goalStore.updateGoal(g.id, { status: "complete", currentIdx: nextIdx });
    } else {
      goalStore.updateGoal(g.id, { status: "paused", currentIdx: nextIdx });
    }
    onRefresh();
  };

  const pause = () => {
    goalStore.updateGoal(goal.id, { status: "paused" });
    onRefresh();
  };

  const deleteGoal = () => {
    goalStore.delete(goal.id);
    onRefresh();
  };

  const color = STATUS_COLOR[goal.status];

  return (
    <div style={{
      background: "var(--surface)", border: `1px solid ${goal.status === "running" ? "color-mix(in srgb,var(--accent) 40%,var(--border))" : "var(--border)"}`,
      borderRadius: 10, overflow: "hidden",
      boxShadow: goal.status === "running" ? "0 0 0 1px color-mix(in srgb,var(--accent) 20%,transparent)" : "none",
    }}>
      {/* Card header */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{ padding: "10px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}
      >
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: STATUS_DOT[goal.status], flexShrink: 0,
          boxShadow: goal.status === "running" ? "0 0 6px var(--accent)" : "none",
          animation: goal.status === "running" ? "tl-pulse 1s ease-in-out infinite" : "none",
        }} />
        <div style={{ flex: 1, overflow: "hidden" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {goal.title}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
            <div style={{ flex: 1, height: 3, background: "var(--border)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${pct}%`, background: goal.status === "complete" ? "var(--success)" : "var(--accent)", borderRadius: 2, transition: "width .4s" }} />
            </div>
            <span style={{ fontSize: 10, color: "var(--muted)", whiteSpace: "nowrap" }}>{done}/{total}</span>
          </div>
        </div>
        <span style={{ fontSize: 10, color, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase", flexShrink: 0 }}>
          {goal.status}
        </span>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>{expanded ? "▲" : "▼"}</span>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div style={{ borderTop: "1px solid var(--border)", padding: "10px 12px" }}>

          {/* Milestone list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12, maxHeight: 180, overflowY: "auto" }}>
            {goal.milestones.map((m, i) => {
              const isCurrent = i === goal.currentIdx && goal.status !== "complete";
              return (
                <div key={m.id} style={{
                  display: "flex", alignItems: "flex-start", gap: 7,
                  padding: "5px 8px", borderRadius: 6,
                  background: isCurrent ? "color-mix(in srgb,var(--accent) 8%,transparent)" : "transparent",
                  border: `1px solid ${isCurrent ? "color-mix(in srgb,var(--accent) 25%,transparent)" : "transparent"}`,
                }}>
                  <span style={{
                    fontSize: 11, flexShrink: 0, marginTop: 1,
                    color: m.status === "complete" ? "var(--success)"
                         : m.status === "failed"   ? "var(--danger)"
                         : m.status === "running"  ? "var(--accent)"
                         : m.status === "skipped"  ? "var(--muted)"
                         : "var(--text-dim)",
                  }}>
                    {MS_ICON[m.status]}
                  </span>
                  <div style={{ flex: 1, overflow: "hidden" }}>
                    <div style={{ fontSize: 11, color: isCurrent ? "var(--text)" : m.status === "complete" ? "var(--text-dim)" : "var(--muted)", lineHeight: 1.4 }}>
                      {m.label}
                    </div>
                    {m.result && (
                      <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2, fontStyle: "italic" }}>
                        ↳ {m.result.slice(0, 80)}
                      </div>
                    )}
                  </div>
                  {isCurrent && m.status === "running" && (
                    <span style={{ fontSize: 9, color: "var(--accent)", fontWeight: 700, letterSpacing: ".04em", flexShrink: 0 }}>LIVE</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Controls */}
          {goal.status !== "complete" && goal.status !== "failed" && current && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {/* Current milestone info */}
              <div style={{ fontSize: 11, color: "var(--text-dim)", padding: "6px 8px",
                background: "var(--panel)", borderRadius: 6, lineHeight: 1.4 }}>
                <span style={{ color: "var(--accent)", fontWeight: 600 }}>Next: </span>
                {current.label}
              </div>

              {current.status === "running" ? (
                // Currently executing — capture what the agent produced
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ fontSize: 10, color: "var(--muted)", letterSpacing: ".04em", textTransform: "uppercase", fontWeight: 700 }}>
                    What did Arya accomplish?
                  </div>
                  <textarea
                    value={resultDraft}
                    onChange={e => setResultDraft(e.target.value)}
                    placeholder="e.g. Found 14 PM job listings matching criteria at Stripe, Linear, Notion…"
                    rows={2}
                    style={{
                      width: "100%", background: "var(--surface)", border: "1px solid var(--border)",
                      borderRadius: 7, padding: "7px 9px", fontSize: 11, color: "var(--text)",
                      fontFamily: "'DM Sans',sans-serif", resize: "none", outline: "none",
                      boxSizing: "border-box", lineHeight: 1.5,
                    }}
                  />
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      onClick={() => { markCurrentDone(resultDraft || "Completed"); setResultDraft(""); }}
                      style={{
                        flex: 2, background: "var(--success)", border: "none", borderRadius: 7,
                        padding: "7px 0", fontSize: 12, fontWeight: 600, color: "#fff",
                        cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
                      }}>
                      ✓ Done — next step
                    </button>
                    <button onClick={pause} style={{
                      flex: 1, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 7,
                      padding: "7px 0", fontSize: 12, color: "var(--muted)",
                      cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
                    }}>
                      ⏸ Pause
                    </button>
                  </div>
                </div>
              ) : (
                // Ready to run
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={runCurrent} style={{
                    flex: 2, background: "var(--accent)", border: "none", borderRadius: 7,
                    padding: "7px 0", fontSize: 12, fontWeight: 600, color: "#fff",
                    cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
                  }}>
                    ▶ Run Step {goal.currentIdx + 1}
                  </button>
                  <button onClick={skipCurrent} style={{
                    flex: 1, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 7,
                    padding: "7px 0", fontSize: 11, color: "var(--muted)",
                    cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
                  }}>
                    Skip →
                  </button>
                </div>
              )}
            </div>
          )}

          {goal.status === "complete" && (
            <div style={{ fontSize: 12, color: "var(--success)", fontWeight: 600, textAlign: "center", padding: "6px 0" }}>
              ✓ Goal complete · {done}/{total} milestones done
            </div>
          )}

          {/* Delete */}
          <button onClick={deleteGoal} style={{
            marginTop: 8, background: "none", border: "none", cursor: "pointer",
            fontSize: 10, color: "var(--muted)", width: "100%", textAlign: "right",
            opacity: .5,
          }}>
            Delete goal
          </button>
        </div>
      )}
    </div>
  );
}

// ── GoalPanel (main export) ───────────────────────────────────────────────────
interface Props {
  open:    boolean;
  onClose: () => void;
  onRunTask: (task: string, goalId: string, milestoneId: string) => void;
}

export default function GoalPanel({ open, onClose, onRunTask }: Props) {
  const [goals,    setGoals]    = useState<Goal[]>([]);
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(() => {
    setGoals(goalStore.getAll());
  }, []);

  // Load goals when the panel opens. GoalCard calls onRefresh() directly after
  // mutations — no tick dependency needed (avoids setState-in-effect loop).
  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  if (!open) return null;

  return (
    <div style={{
      position: "fixed", top: 60, right: 16,
      width: 300, maxHeight: "calc(100vh - 84px)",
      background: "var(--panel)", border: "1px solid var(--border)",
      borderRadius: 12, boxShadow: "0 8px 32px rgba(0,0,0,.35)",
      display: "flex", flexDirection: "column", overflow: "hidden",
      zIndex: 50,
    }}>
      {/* Widget header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 14px 8px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: "var(--accent)",
          letterSpacing: ".08em", textTransform: "uppercase" }}>◎ Goals</span>
        <div style={{ display: "flex", gap: 6 }}>
          {!creating && (
            <button onClick={() => setCreating(true)} style={{
              background: "var(--accent)", border: "none", borderRadius: 5,
              padding: "3px 9px", fontSize: 11, fontWeight: 600, color: "#fff", cursor: "pointer",
              fontFamily: "'DM Sans',sans-serif",
            }}>+ New</button>
          )}
          <button onClick={onClose} style={{
            background: "none", border: "none", cursor: "pointer",
            color: "var(--muted)", fontSize: 16, lineHeight: 1, padding: "0 2px",
          }}>×</button>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 12px 14px" }}>

        {creating ? (
          <NewGoalForm
            onCreated={goal => { setCreating(false); refresh(); }}
            onCancel={() => setCreating(false)}
          />
        ) : goals.length === 0 ? (
          <div style={{ textAlign: "center", padding: "30px 10px" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>◎</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 6 }}>
              No goals yet
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.6, marginBottom: 16 }}>
              Goals are long-horizon campaigns Arya executes step-by-step. You control when each step runs.
            </div>
            <button onClick={() => setCreating(true)} style={{
              background: "var(--accent)", border: "none", borderRadius: 8,
              padding: "8px 20px", fontSize: 13, fontWeight: 600, color: "#fff",
              cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
            }}>
              Create your first goal →
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {/* Active first, then pending, then complete */}
            {[...goals]
              .sort((a, b) => {
                const order: Record<string, number> = { running: 0, paused: 1, pending: 2, draft: 3, failed: 4, complete: 5 };
                return (order[a.status] ?? 9) - (order[b.status] ?? 9);
              })
              .map(goal => (
                <GoalCard
                  key={goal.id}
                  goal={goal}
                  onRun={onRunTask}
                  onRefresh={refresh}
                />
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
