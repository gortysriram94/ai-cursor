// app/chat/components/TaskApprovalModal.tsx
"use client";

import React, { useState } from "react";
import { recalculateStepCost } from "@/lib/task-plan-generator";

export interface BreadcrumbData {
  context: string;
  currentState: string;
  goalState: string;
  constraints: string[];
}

export interface TaskStep {
  id: string;
  number: number;
  title: string;
  description: string;
  action: string;
  cost: number;
  duration: string;
  required: boolean;
  userDecision?: "approve" | "skip" | "modify";
  model?: string;
}

export interface TaskPlan {
  taskType: string;
  taskName: string;
  breadcrumbs: BreadcrumbData;
  steps: TaskStep[];
  totalCost: number;
  estimatedDuration: string;
  traditionalCost: number;
  savings: number;
  savingsPercent: number;
}

interface TaskApprovalModalProps {
  plan: TaskPlan;
  onApprove: (approvedSteps: TaskStep[]) => void;
  onCancel: () => void;
  onModify: (modifiedPlan: TaskPlan) => void;
}

export default function TaskApprovalModal({ plan, onApprove, onCancel, onModify }: TaskApprovalModalProps) {
  const [steps, setSteps] = useState(plan.steps);
  const [showDetails, setShowDetails] = useState(false);
  const [editingStepId, setEditingStepId] = useState<string | null>(null);

  const selectedSteps = steps.filter((s: TaskStep) => s.userDecision !== "skip");
  const totalCost     = selectedSteps.reduce((sum: number, s: TaskStep) => sum + s.cost, 0);

  // Recompute GPT-4o baseline from current step actions (updates when user edits)
  const gpt4oTotal = selectedSteps.reduce((sum: number, s: TaskStep) => {
    const { gpt4oCost } = recalculateStepCost(s.title, s.model ?? "claude-sonnet-4-6", s.action);
    return sum + gpt4oCost;
  }, 0);

  const savings        = Math.max(0, gpt4oTotal - totalCost);
  const savingsPercent = gpt4oTotal > 0 ? Math.round((savings / gpt4oTotal) * 100) : 0;

  const toggleStep = (stepId: string) => {
    setSteps((prev: TaskStep[]) => prev.map((step: TaskStep) => {
      if (step.id === stepId && !step.required) {
        return { ...step, userDecision: step.userDecision === "skip" ? "approve" : "skip" } as TaskStep;
      }
      return step;
    }));
  };

  const updateStepAction = (stepId: string, newAction: string) => {
    setSteps((prev: TaskStep[]) => prev.map((step: TaskStep) => {
      if (step.id !== stepId) return step;
      const { cost } = recalculateStepCost(step.title, step.model ?? "claude-sonnet-4-6", newAction);
      return { ...step, action: newAction, cost, userDecision: "modify" as const };
    }));
    setEditingStepId(null);
  };

  const handleApprove = () => {
    const approved = steps.filter((s: TaskStep) => s.userDecision !== "skip");
    onApprove(approved);
  };

  return (
    <div style={{
      position: "fixed",
      top: 0, left: 0, right: 0, bottom: 0,
      background: "rgba(0, 0, 0, 0.8)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 9999,
      padding: 20,
      backdropFilter: "blur(4px)",
    }}>
      <div style={{
        background: "var(--panel)",
        border: "2px solid var(--accent)",
        borderRadius: 16,
        maxWidth: 800,
        width: "100%",
        maxHeight: "90vh",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 24px 64px rgba(0, 0, 0, 0.4)",
      }}>

        {/* Header */}
        <div style={{
          padding: "24px 32px",
          borderBottom: "1px solid var(--border)",
          background: "linear-gradient(135deg, var(--surface) 0%, var(--panel) 100%)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <span style={{ fontSize: 32 }}>🎯</span>
            <div>
              <h2 style={{ fontSize: 24, fontWeight: 900, margin: 0, color: "var(--text)" }}>
                Approve Task Plan
              </h2>
              <p className="mono" style={{ fontSize: 11, color: "var(--accent)", margin: "4px 0 0", letterSpacing: "0.1em" }}>
                {plan.taskName.toUpperCase()}
              </p>
            </div>
          </div>
          <p style={{ fontSize: 14, color: "var(--text-dim)", margin: 0, lineHeight: 1.6 }}>
            Review the execution plan before running. Click any action to edit it, or skip optional steps.
          </p>
        </div>

        {/* Breadcrumb Detection */}
        <div style={{
          padding: "20px 32px",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
        }}>
          <button
            onClick={() => setShowDetails(!showDetails)}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}
          >
            <div className="mono" style={{ fontSize: 10, color: "var(--muted)", letterSpacing: "0.12em" }}>
              📍 DETECTED BREADCRUMBS
            </div>
            <span style={{ color: "var(--muted)", fontSize: 12 }}>
              {showDetails ? "▼" : "▶"}
            </span>
          </button>

          {showDetails && (
            <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
              {[
                { label: "CONTEXT", value: plan.breadcrumbs.context },
                { label: "CURRENT STATE", value: plan.breadcrumbs.currentState },
                { label: "GOAL STATE", value: plan.breadcrumbs.goalState },
                { label: "CONSTRAINTS", value: plan.breadcrumbs.constraints.join(", ") },
              ].map(({ label, value }) => (
                <div key={label} style={{ padding: 12, background: "var(--panel)", borderRadius: 8, border: "1px solid var(--border)" }}>
                  <div className="mono" style={{ fontSize: 9, color: "var(--muted)", marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 13, color: "var(--text)" }}>{value}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Steps */}
        <div style={{ flex: 1, overflowY: "auto", padding: "24px 32px" }}>
          <div className="mono" style={{ fontSize: 10, color: "var(--muted)", letterSpacing: "0.12em", marginBottom: 16 }}>
            EXECUTION STEPS ({selectedSteps.length}/{steps.length})
          </div>

          {steps.map((step: TaskStep) => {
            const isSkipped = step.userDecision === "skip";
            const isEditing = editingStepId === step.id;

            return (
              <div
                key={step.id}
                style={{
                  marginBottom: 12,
                  padding: 16,
                  background: isSkipped ? "var(--surface)" : "var(--panel)",
                  border: `2px solid ${isSkipped ? "var(--border)" : step.required ? "var(--accent)" : "var(--border)"}`,
                  borderRadius: 12,
                  opacity: isSkipped ? 0.5 : 1,
                  transition: "all 0.3s",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  {/* Checkbox / Required indicator */}
                  {!step.required ? (
                    <input
                      type="checkbox"
                      checked={!isSkipped}
                      onChange={() => toggleStep(step.id)}
                      style={{ width: 20, height: 20, cursor: "pointer", marginTop: 2 }}
                    />
                  ) : (
                    <div style={{
                      width: 20, height: 20,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: "var(--accent)", color: "white",
                      fontSize: 12, fontWeight: 700, borderRadius: 4, marginTop: 2,
                    }}>
                      ✓
                    </div>
                  )}

                  <div style={{ flex: 1 }}>
                    {/* Step header */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>
                        STEP {step.number}
                      </span>
                      {step.required && (
                        <span className="mono" style={{
                          fontSize: 9, color: "var(--accent)",
                          background: "color-mix(in srgb, var(--accent) 15%, transparent)",
                          padding: "2px 6px", borderRadius: 3,
                        }}>
                          REQUIRED
                        </span>
                      )}
                      {step.userDecision === "modify" && (() => {
                        // Show cost delta vs original plan cost for this step
                        const originalStep = plan.steps.find(s => s.id === step.id);
                        if (!originalStep) return null;
                        const delta = step.cost - originalStep.cost;
                        if (Math.abs(delta) < 0.000001) return null;
                        const sign  = delta > 0 ? "+" : "";
                        const color = delta > 0 ? "var(--danger)" : "var(--success)";
                        return (
                          <span className="mono" style={{
                            fontSize: 9, color,
                            background: `color-mix(in srgb, ${color} 12%, transparent)`,
                            padding: "2px 6px", borderRadius: 3,
                          }}>
                            MODIFIED {sign}${Math.abs(delta).toFixed(4)}
                          </span>
                        );
                      })()}
                    </div>

                    {/* Title */}
                    <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 8px", color: isSkipped ? "var(--muted)" : "var(--text)" }}>
                      {step.title}
                    </h3>

                    {/* Description */}
                    <p style={{ fontSize: 13, color: "var(--text-dim)", margin: "0 0 12px", lineHeight: 1.6 }}>
                      {step.description}
                    </p>

                    {/* Action — editable */}
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>ACTION</span>
                        {!isSkipped && !isEditing && (
                          <button
                            onClick={() => setEditingStepId(step.id)}
                            style={{
                              background: "none", border: "none",
                              color: "var(--muted)", fontSize: 10,
                              cursor: "pointer", padding: "1px 6px",
                              borderRadius: 3, fontFamily: "inherit",
                            }}
                            onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => (e.currentTarget.style.color = "var(--accent)")}
                            onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => (e.currentTarget.style.color = "var(--muted)")}
                          >
                            ✏ edit
                          </button>
                        )}
                      </div>

                      {isEditing ? (
                        <textarea
                          autoFocus
                          defaultValue={step.action}
                          rows={3}
                          onBlur={(e: React.FocusEvent<HTMLTextAreaElement>) => updateStepAction(step.id, e.target.value.trim() || step.action)}
                          onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              updateStepAction(step.id, (e.target as HTMLTextAreaElement).value.trim() || step.action);
                            }
                            if (e.key === "Escape") setEditingStepId(null);
                          }}
                          style={{
                            width: "100%",
                            fontSize: 12,
                            color: "var(--text)",
                            background: "var(--surface)",
                            border: "2px solid var(--accent)",
                            borderRadius: 6,
                            padding: "8px 12px",
                            lineHeight: 1.5,
                            resize: "vertical",
                            outline: "none",
                            fontFamily: "inherit",
                            boxSizing: "border-box",
                          }}
                        />
                      ) : (
                        <div
                          onClick={() => !isSkipped && setEditingStepId(step.id)}
                          style={{
                            fontSize: 12,
                            color: "var(--accent)",
                            background: "color-mix(in srgb, var(--accent) 8%, transparent)",
                            padding: "8px 12px",
                            borderRadius: 6,
                            cursor: isSkipped ? "default" : "text",
                            lineHeight: 1.5,
                          }}
                        >
                          {step.action}
                        </div>
                      )}
                    </div>

                    {/* Metadata */}
                    <div style={{ display: "flex", gap: 16, fontSize: 12, flexWrap: "wrap" }}>
                      <div>
                        <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>COST: </span>
                        <span style={{ fontWeight: 700, color: isSkipped ? "var(--muted)" : "var(--accent)" }}>
                          ${step.cost.toFixed(4)}
                        </span>
                      </div>
                      <div>
                        <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>TIME: </span>
                        <span style={{ fontWeight: 600, color: "var(--text-dim)" }}>{step.duration}</span>
                      </div>
                      {step.model && (
                        <div>
                          <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>MODEL: </span>
                          <span style={{ fontWeight: 600, color: "var(--success)" }}>
                            {step.model.includes("opus") ? "Opus" : step.model.includes("sonnet") ? "Sonnet" : "Haiku"}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Cost Summary */}
        <div style={{
          padding: "24px 32px",
          borderTop: "2px solid var(--border)",
          background: "linear-gradient(135deg, var(--panel) 0%, var(--surface) 100%)",
        }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 20 }}>
            <div style={{ textAlign: "center" }}>
              <div className="mono" style={{ fontSize: 9, color: "var(--muted)", marginBottom: 4 }}>GPT-4o COST</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: "var(--danger)" }}>
                ${gpt4oTotal.toFixed(4)}
              </div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div className="mono" style={{ fontSize: 9, color: "var(--muted)", marginBottom: 4 }}>YOUR COST</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: "var(--accent)" }}>
                ${totalCost.toFixed(4)}
              </div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div className="mono" style={{ fontSize: 9, color: "var(--success)", marginBottom: 4 }}>YOU SAVE</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: "var(--success)" }}>{savingsPercent}%</div>
              <div className="mono" style={{ fontSize: 10, color: "var(--success)" }}>${savings.toFixed(4)}</div>
            </div>
          </div>

          <div style={{ padding: 12, background: "var(--panel)", borderRadius: 8, marginBottom: 20, textAlign: "center" }}>
            <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>
              ESTIMATED DURATION: {plan.estimatedDuration}
            </span>
          </div>

          <div style={{ display: "flex", gap: 12 }}>
            <button
              onClick={onCancel}
              style={{
                flex: 1, padding: "14px 24px",
                background: "transparent", border: "2px solid var(--border)",
                color: "var(--text)", fontSize: 14, fontWeight: 700,
                cursor: "pointer", borderRadius: 8, transition: "all 0.2s",
              }}
              onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.borderColor = "var(--danger)"; e.currentTarget.style.color = "var(--danger)"; }}
              onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text)"; }}
            >
              Cancel
            </button>

            <button
              onClick={handleApprove}
              disabled={selectedSteps.length === 0}
              style={{
                flex: 2, padding: "14px 24px",
                background: selectedSteps.length > 0 ? "var(--accent)" : "var(--border)",
                border: "none", color: "white",
                fontSize: 14, fontWeight: 700,
                cursor: selectedSteps.length > 0 ? "pointer" : "not-allowed",
                borderRadius: 8, transition: "all 0.2s",
                boxShadow: selectedSteps.length > 0 ? "0 4px 16px rgba(218, 119, 86, 0.3)" : "none",
              }}
              onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => {
                if (selectedSteps.length > 0) {
                  e.currentTarget.style.transform = "translateY(-2px)";
                  e.currentTarget.style.boxShadow = "0 8px 24px rgba(218, 119, 86, 0.4)";
                }
              }}
              onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = selectedSteps.length > 0 ? "0 4px 16px rgba(218, 119, 86, 0.3)" : "none";
              }}
            >
              ✓ Approve & Execute ({selectedSteps.length} steps · ${totalCost.toFixed(4)})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}