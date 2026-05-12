"use client";

import React, { useState, useEffect } from "react";
import type { VerticalId } from "@/lib/verticals";
import {
  createMasterContext,
  updateMasterContext,
  saveMasterContext,
  loadMasterContext,
  masterContextToPrompt,
  type MasterContext,
} from "@/lib/master-context";
import {
  calculateCost,
  formatCost,
  formatTokens,
  type CostBreakdown,
} from "@/lib/cost-calculator";
import {
  executeTool,
  isToolFree,
  type ToolName,
} from "@/lib/toolchain";
import { getStoredCustomerId } from "@/lib/credits";

interface Breadcrumb {
  id: string;
  action: string;
  tool: ToolName;
  reasoning: string;
  estimatedCost: number;
  params: Record<string, any>;
  status: "pending" | "executing" | "complete" | "skipped" | "failed";
  result?: string;
  actualCost?: number;
  tokensUsed?: number;
}

interface AgentTimelineProps {
  verticalId: VerticalId;
  sessionId: string;
  stats: {
    cleanedRowCount: number;
    headers: string[];
    qualityAfter: number;
    originalRowCount?: number;
  } | null;
  onComplete?: (result: string) => void;
  initialPrompt?: string;
}

export default function AgentTimeline({
  verticalId,
  sessionId,
  stats,
  onComplete,
  initialPrompt = "",
}: AgentTimelineProps) {
  const [masterContext, setMasterContext] = useState<MasterContext | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([]);
  const [userInput, setUserInput] = useState(initialPrompt);
  const [loading, setLoading] = useState(false);
  const [totalCost, setTotalCost] = useState(0);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    const stored = loadMasterContext(sessionId);
    if (stored) setMasterContext(stored);
    setCustomerId(getStoredCustomerId());
    
    // Auto-send initial prompt if provided
    if (initialPrompt && !stored) {
      setTimeout(() => {
        handleSend();
      }, 100);
    }
  }, [sessionId]);

  const handleSend = async () => {
    const message = userInput.trim();
    if (!message || loading) return;

    setUserInput("");
    setLoading(true);

    try {
      let master = masterContext;
      if (!master) {
        master = createMasterContext(sessionId, verticalId, message);
        if (stats) {
          master = updateMasterContext(master, {
            dataSchema: {
              fileName: "uploaded_data.csv",
              rowCount: stats.cleanedRowCount,
              columns: stats.headers,
            },
          });
        }
        setMasterContext(master);
        saveMasterContext(master);
      } else {
        master = updateMasterContext(master, {
          lastUserMessage: message,
          currentFocus: message,
        });
        setMasterContext(master);
        saveMasterContext(master);
      }

      const prompt = masterContextToPrompt(master);
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "plan",
          userMessage: message,
          masterContext: prompt,
          vertical: verticalId,
          customerId,
        }),
      });

      if (!res.ok) {
        let errorMessage = "Failed to plan";
        try {
          const error = await res.json();
          if (error.error === "insufficient_credits") {
            alert("Insufficient credits. Please top up.");
            return;
          }
          errorMessage = error.error || errorMessage;
          
          // Show helpful message for API key issues
          if (errorMessage.includes("ANTHROPIC_API_KEY")) {
            alert("⚠️ API Configuration Error\n\nANTHROPIC_API_KEY is not configured.\n\n1. Create .env.local in project root\n2. Add: ANTHROPIC_API_KEY=sk-ant-api03-YOUR_KEY\n3. Restart the server\n\nGet your key from: https://console.anthropic.com/settings/keys");
            return;
          }
        } catch (e) {
          // Response wasn't JSON (probably HTML error page)
          console.error("API returned non-JSON response:", await res.text());
          alert("⚠️ Server Error\n\nThe API is not responding correctly.\n\nMost likely cause: Missing ANTHROPIC_API_KEY\n\n1. Check your .env.local file\n2. Add: ANTHROPIC_API_KEY=sk-ant-api03-YOUR_KEY\n3. Restart npm run dev\n\nCheck the browser console for details.");
          return;
        }
        throw new Error(errorMessage);
      }

      const { breadcrumbs: newCrumbs } = await res.json();
      setBreadcrumbs((prev) => [
        ...prev,
        ...newCrumbs.map((b: any) => ({ ...b, status: "pending" as const })),
      ]);
    } catch (err) {
      console.error(err);
      alert("Failed to generate plan");
    } finally {
      setLoading(false);
    }
  };

  const approveCrumb = async (id: string) => {
    const crumb = breadcrumbs.find((b) => b.id === id);
    if (!crumb || !masterContext) return;

    // Special handling for upload_file tool
    if (crumb.tool === "upload_file") {
      fileInputRef.current?.click();
      return;
    }

    setBreadcrumbs((prev) =>
      prev.map((b) => (b.id === id ? { ...b, status: "executing" as const } : b))
    );

    try {
      const result = await executeTool({
        toolName: crumb.tool,
        params: crumb.params,
        context: {
          sessionId,
          vertical: verticalId,
          masterContext: masterContextToPrompt(masterContext),
        },
      });

      if (!result.success) throw new Error(result.error || "Tool failed");

      setBreadcrumbs((prev) =>
        prev.map((b) =>
          b.id === id
            ? {
                ...b,
                status: "complete" as const,
                result: result.output,
                actualCost: result.costIncurred,
                tokensUsed: result.tokensUsed,
              }
            : b
        )
      );

      const updated = updateMasterContext(masterContext, {
        action: crumb.action,
        tool: crumb.tool,
        result: result.output.slice(0, 200),
      });
      setMasterContext(updated);
      saveMasterContext(updated);
      setTotalCost((prev) => prev + result.costIncurred);

      const remaining = breadcrumbs.filter((b) => b.status === "pending" && b.id !== id);
      if (remaining.length === 0 && onComplete) {
        onComplete(result.output);
      }
    } catch (err) {
      console.error(err);
      setBreadcrumbs((prev) =>
        prev.map((b) =>
          b.id === id
            ? {
                ...b,
                status: "failed" as const,
                result: err instanceof Error ? err.message : "Unknown error",
              }
            : b
        )
      );
    }
  };

  const skipCrumb = (id: string) => {
    setBreadcrumbs((prev) =>
      prev.map((b) => (b.id === id ? { ...b, status: "skipped" as const } : b))
    );
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Find the upload_file breadcrumb that triggered this
    const uploadCrumb = breadcrumbs.find(b => b.tool === "upload_file" && b.status === "pending");
    if (!uploadCrumb) return;

    // Mark as executing
    setBreadcrumbs((prev) =>
      prev.map((b) => (b.id === uploadCrumb.id ? { ...b, status: "executing" as const } : b))
    );

    // Process file (you'll need to add actual file processing logic here)
    // For now, just mark as complete
    setBreadcrumbs((prev) =>
      prev.map((b) =>
        b.id === uploadCrumb.id
          ? {
              ...b,
              status: "complete" as const,
              result: `File uploaded: ${file.name} (${(file.size / 1024).toFixed(1)}KB)`,
              actualCost: 0,
              tokensUsed: 0,
            }
          : b
      )
    );

    if (masterContext) {
      const updated = updateMasterContext(masterContext, {
        action: "Upload file",
        tool: "upload_file",
        result: `Uploaded ${file.name}`,
        dataSchema: {
          fileName: file.name,
          rowCount: 0, // Will be updated after cleaning
          columns: [],
        },
      });
      setMasterContext(updated);
      saveMasterContext(updated);
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const costBreakdown: CostBreakdown | null = stats
    ? calculateCost({
        originalRowCount: stats.originalRowCount || stats.cleanedRowCount,
        cleanedRowCount: stats.cleanedRowCount,
        originalColumns: stats.headers.length,
        cleanedColumns: stats.headers.length,
        summarized: true,
        promptOptimized: true,
      })
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.json,.pdf,.txt,.tsv"
        onChange={handleFileUpload}
        style={{ display: "none" }}
      />

      {/* Cost optimization banner */}
      {costBreakdown && (
        <div style={{ background: "var(--panel)", border: "1px solid var(--border)", padding: 16 }}>
          <div className="mono" style={{ fontSize: 10, color: "var(--muted)", marginBottom: 12 }}>
            COST OPTIMIZATION
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
            <div>
              <div className="mono" style={{ fontSize: 9, color: "var(--muted)", marginBottom: 4 }}>
                INPUT TOKENS
              </div>
              <div className="mono" style={{ fontSize: 18, color: "var(--success)", fontWeight: 700 }}>
                {formatTokens(costBreakdown.inputTokens)}
              </div>
              <div className="mono" style={{ fontSize: 9, color: "var(--muted)", marginTop: 2 }}>
                vs {formatTokens(costBreakdown.rawInputTokens)} raw
              </div>
              <div className="mono" style={{ fontSize: 9, color: "var(--success)", marginTop: 4 }}>
                ↓ {costBreakdown.tokensReductionPct.toFixed(1)}%
              </div>
            </div>
            <div>
              <div className="mono" style={{ fontSize: 9, color: "var(--muted)", marginBottom: 4 }}>
                TOTAL COST
              </div>
              <div className="mono" style={{ fontSize: 18, color: "var(--accent)", fontWeight: 700 }}>
                {formatCost(costBreakdown.totalCost)}
              </div>
              <div className="mono" style={{ fontSize: 9, color: "var(--muted)", marginTop: 2 }}>
                vs {formatCost(costBreakdown.rawTotalCost)} raw
              </div>
              <div className="mono" style={{ fontSize: 9, color: "var(--success)", marginTop: 4 }}>
                Saved {formatCost(costBreakdown.costSaved)}
              </div>
            </div>
            <div>
              <div className="mono" style={{ fontSize: 9, color: "var(--muted)", marginBottom: 4 }}>
                SAVED
              </div>
              {costBreakdown.optimizations.slice(0, 2).map((opt, i) => (
                <div key={i} className="mono" style={{ fontSize: 9, color: "var(--text)", marginBottom: 2 }}>
                  • {opt.step}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Breadcrumbs */}
      <div>
        {breadcrumbs.length === 0 && !loading && (
          <div style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>
            <div className="mono" style={{ fontSize: 12 }}>No breadcrumbs yet</div>
            <div style={{ fontSize: 13, marginTop: 8 }}>Type a message below to start</div>
          </div>
        )}

        {breadcrumbs.map((crumb, index) => (
          <BreadcrumbCard
            key={crumb.id}
            crumb={crumb}
            index={index}
            onApprove={() => approveCrumb(crumb.id)}
            onSkip={() => skipCrumb(crumb.id)}
          />
        ))}

        {loading && (
          <div style={{ padding: 16, textAlign: "center", color: "var(--muted)" }}>
            <div className="mono" style={{ fontSize: 11 }}>Planning breadcrumbs...</div>
          </div>
        )}
      </div>

      {/* Input */}
      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="text"
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="What would you like to do next?"
            disabled={loading}
            style={{
              flex: 1,
              background: "var(--panel)",
              border: "1px solid var(--border)",
              color: "var(--text)",
              padding: "10px 12px",
              fontSize: 13,
            }}
          />
          <button
            onClick={handleSend}
            disabled={loading || !userInput.trim()}
            style={{
              background: "var(--accent)",
              color: "var(--surface)",
              border: "none",
              padding: "10px 20px",
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 11,
              fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading || !userInput.trim() ? 0.5 : 1,
            }}
          >
            Send
          </button>
        </div>
      </div>

      {totalCost > 0 && (
        <div className="mono" style={{ fontSize: 10, color: "var(--muted)", textAlign: "right" }}>
          Total cost: {formatCost(totalCost)}
        </div>
      )}
    </div>
  );
}

function BreadcrumbCard({
  crumb,
  index,
  onApprove,
  onSkip,
}: {
  crumb: Breadcrumb;
  index: number;
  onApprove: () => void;
  onSkip: () => void;
}) {
  const statusColors = {
    pending: "var(--accent)",
    executing: "var(--warn)",
    complete: "var(--success)",
    skipped: "var(--muted)",
    failed: "var(--danger)",
  };

  const statusLabels = {
    pending: "Waiting",
    executing: "Running...",
    complete: "Complete",
    skipped: "Skipped",
    failed: "Failed",
  };

  const isFree = isToolFree(crumb.tool);

  return (
    <div
      style={{
        background: "var(--panel)",
        border: `1px solid ${statusColors[crumb.status]}`,
        borderLeft: `4px solid ${statusColors[crumb.status]}`,
        padding: 16,
        marginBottom: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <div className="mono" style={{ fontSize: 10, color: "var(--muted)", background: "var(--surface)", padding: "4px 8px", border: "1px solid var(--border)" }}>
          #{index + 1}
        </div>
        <div className="mono" style={{ fontSize: 12, fontWeight: 700, flex: 1 }}>
          {crumb.action}
        </div>
        <div className="mono" style={{ fontSize: 9, color: statusColors[crumb.status] }}>
          {statusLabels[crumb.status]}
        </div>
      </div>

      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>
        <span className="mono" style={{ fontSize: 10, marginRight: 12 }}>
          Tool: {crumb.tool}
        </span>
        <span className="mono" style={{ fontSize: 10 }}>
          {isFree ? "Free" : `Est. ${formatCost(crumb.estimatedCost)}`}
        </span>
      </div>

      <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 12 }}>
        {crumb.reasoning}
      </div>

      {crumb.status === "pending" && (
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={onApprove}
            style={{
              background: "var(--success)",
              color: "var(--surface)",
              border: "none",
              padding: "8px 16px",
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 10,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            ✓ Approve
          </button>
          <button
            onClick={onSkip}
            style={{
              background: "var(--panel-2)",
              color: "var(--muted)",
              border: "1px solid var(--border)",
              padding: "8px 16px",
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 10,
              cursor: "pointer",
            }}
          >
            ✗ Skip
          </button>
        </div>
      )}

      {crumb.status === "complete" && crumb.result && (
        <div style={{ marginTop: 12, padding: 12, background: "var(--surface)", border: "1px solid var(--border)", fontSize: 12, whiteSpace: "pre-wrap" }}>
          {crumb.result}
        </div>
      )}

      {crumb.status === "complete" && crumb.actualCost !== undefined && (
        <div className="mono" style={{ fontSize: 9, color: "var(--muted)", marginTop: 8 }}>
          Cost: {formatCost(crumb.actualCost)} | Tokens: {crumb.tokensUsed}
        </div>
      )}

      {crumb.status === "failed" && crumb.result && (
        <div style={{ marginTop: 12, padding: 12, background: "color-mix(in srgb, var(--danger) 10%, transparent)", border: "1px solid var(--danger)", fontSize: 12, color: "var(--danger)" }}>
          {crumb.result}
        </div>
      )}
    </div>
  );
}
