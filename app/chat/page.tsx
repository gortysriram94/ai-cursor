"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import WorkspaceShell from "@/components/workspace/WorkspaceShell";
import { Mission, AgentRuntime, TimelineType, Artifact } from "@/components/workspace/types";

// =====================================================
// HELPERS
// =====================================================

function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

// =====================================================
// MAIN PAGE
// =====================================================

export default function ChatPage() {
  const [prompt, setPrompt] = useState("");
  const [missions, setMissions] = useState<Mission[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("pushpa_missions");
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });

  const [selectedMissionId, setSelectedMissionId] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("pushpa_selected_mission_id");
    }
    return null;
  });

  const [agents, setAgents] = useState<AgentRuntime[]>([
    { id: uid("agent"), name: "Commander", role: "Planning + orchestration", status: "idle" },
    { id: uid("agent"), name: "Research Agent", role: "Research + extraction", status: "idle" },
    { id: uid("agent"), name: "Execution Agent", role: "Workflow execution", status: "idle" },
  ]);

  // Persist missions to localStorage
  useEffect(() => {
    localStorage.setItem("pushpa_missions", JSON.stringify(missions));
  }, [missions]);

  // Persist selected mission ID
  useEffect(() => {
    if (selectedMissionId) {
      localStorage.setItem("pushpa_selected_mission_id", selectedMissionId);
    } else {
      localStorage.removeItem("pushpa_selected_mission_id");
    }
  }, [selectedMissionId]);

  const selectedMission = useMemo(
    () => missions.find((m) => m.id === selectedMissionId) ?? null,
    [missions, selectedMissionId]
  );

  // =====================================================
  // MISSION ACTIONS
  // =====================================================

  const appendTimeline = useCallback(
    (missionId: string, evt: { type: TimelineType; message: string }) => {
      setMissions((prev) =>
        prev.map((m) => {
          if (m.id !== missionId) return m;
          return {
            ...m,
            updatedAt: Date.now(),
            timeline: [
              ...m.timeline,
              { id: uid("event"), type: evt.type, message: evt.message, createdAt: Date.now() },
            ],
          };
        })
      );
    },
    []
  );

  const appendArtifact = useCallback(
    (missionId: string, artifact: Artifact) => {
      setMissions((prev) =>
        prev.map((m) => {
          if (m.id !== missionId) return m;
          return { ...m, artifacts: [...m.artifacts, artifact] };
        })
      );
    },
    []
  );

  const updateMissionStatus = useCallback(
    (missionId: string, status: Mission["status"]) => {
      setMissions((prev) =>
        prev.map((m) => {
          if (m.id !== missionId) return m;
          return { ...m, status };
        })
      );
    },
    []
  );

  const updateMissionMemory = useCallback(
    (missionId: string, key: string, value: any) => {
      setMissions((prev) =>
        prev.map((m) => {
          if (m.id !== missionId) return m;
          return {
            ...m,
            memory: { ...m.memory, [key]: value },
          };
        })
      );
    },
    []
  );

  // =====================================================
  // SSE EVENT HANDLER
  // =====================================================

  const handleSSEEvent = useCallback(
    (taskId: string, data: any) => {
      switch (data.type) {
        case "workflow_started":
          appendTimeline(taskId, { type: "workflow", message: "Workflow initialized" });
          break;
        case "agent_thinking":
          appendTimeline(taskId, {
            type: "agent",
            message: `${data.agent ?? "Agent"} analyzing task...`,
          });
          break;
        case "navigation":
          appendTimeline(taskId, { type: "workflow", message: `Researching ${data.url}` });
          break;
        case "artifact":
          appendArtifact(taskId, {
            id: uid("artifact"),
            type: data.artifactType ?? "summary",
            title: data.title ?? "Generated Artifact",
            content: data.content,
            url: data.url,
            createdAt: Date.now(),
          });
          appendTimeline(taskId, { type: "artifact", message: `Artifact created: ${data.title}` });
          break;
        case "approval_required":
          appendTimeline(taskId, { type: "approval", message: data.message ?? "Approval required" });
          break;
        case "auth_required":
          appendTimeline(taskId, {
            type: "auth",
            message: data.message ?? "Authentication required in Electron runtime",
          });
          break;
        case "workflow_complete":
          appendTimeline(taskId, { type: "system", message: "Mission completed" });
          updateMissionStatus(taskId, "complete");
          break;
        case "workflow_failed":
          appendTimeline(taskId, { type: "system", message: data.error ?? "Mission failed" });
          updateMissionStatus(taskId, "failed");
          break;
        case "memory_update":
          if (data.key && data.value !== undefined) {
            updateMissionMemory(taskId, data.key, data.value);
            appendTimeline(taskId, { type: "system", message: `Memory updated: ${data.key}` });
          }
          break;
      }
    },
    [appendArtifact, appendTimeline, updateMissionStatus, updateMissionMemory]
  );

  // =====================================================
  // CREATE MISSION
  // =====================================================

  const createMission = useCallback(async () => {
    if (!prompt.trim()) return;

    const taskId = uid("task");
    const mission: Mission = {
      id: taskId,
      title: prompt,
      goal: prompt,
      status: "running",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      artifacts: [],
      timeline: [
        { id: uid("event"), type: "system", message: `Mission created: ${prompt}`, createdAt: Date.now() },
      ],
      context: {
        nodeId: uid("node"),
        taskId,
        agentId: "commander",
        currentUrl: "",
        authState: "none",
        step: 0,
        totalSteps: 0,
      },
      memory: {},
    };

    setMissions((prev) => [mission, ...prev]);
    setSelectedMissionId(taskId);
    const userPrompt = prompt;
    setPrompt("");

    try {
      const res = await fetch("/api/workflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task: userPrompt,
          nodeId: taskId, // API expects nodeId
          mode: "workspace-os",
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`API error ${res.status}: ${errText}`);
      }

      appendTimeline(taskId, { type: "workflow", message: "Workflow started" });

      // Read SSE events from POST response (stream is in the response body)
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              handleSSEEvent(taskId, data);
            } catch (e) {
              console.error("SSE parse error:", e);
            }
          }
        }
      }
    } catch (err) {
      appendTimeline(taskId, { type: "system", message: `Workflow failed: ${String(err)}` });
      updateMissionStatus(taskId, "failed");
    }
  }, [prompt, appendTimeline, updateMissionStatus, handleSSEEvent]);

  // =====================================================
  // RENDER
  // =====================================================

  return (
    <WorkspaceShell
      prompt={prompt}
      missions={missions}
      selectedMissionId={selectedMissionId}
      selectedMission={selectedMission}
      agents={agents}
      onPromptChange={setPrompt}
      onCreateMission={createMission}
      onSelectMission={setSelectedMissionId}
    />
  );
}
