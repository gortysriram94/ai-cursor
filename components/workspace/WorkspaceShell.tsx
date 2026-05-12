import React from "react";
import AgentStatusPanel from "./AgentStatusPanel";
import MissionFeed from "./MissionFeed";
import MissionTimeline from "./MissionTimeline";
import ArtifactPanel from "./ArtifactPanel";
import GlobalPrompt from "./GlobalPrompt";
import RuntimeStatus from "./RuntimeStatus";
import { Mission, AgentRuntime } from "./types";

export default function WorkspaceShell({
  prompt,
  missions,
  selectedMissionId,
  selectedMission,
  agents,
  onPromptChange,
  onCreateMission,
  onSelectMission,
}: {
  prompt: string;
  missions: Mission[];
  selectedMissionId: string | null;
  selectedMission: Mission | null;
  agents: AgentRuntime[];
  onPromptChange: (value: string) => void;
  onCreateMission: () => void;
  onSelectMission: (id: string) => void;
}) {
  return (
    <div className="flex h-screen w-full bg-gray-50 text-gray-900 overflow-hidden font-sans">
      {/* SIDEBAR */}
      <aside className="w-[300px] border-r border-gray-200 flex flex-col bg-white">
        <div className="p-5 border-b border-gray-200">
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
            Pushpa
          </h1>
          <p className="text-sm text-gray-500 mt-1">AI Workspace OS</p>
        </div>

        <AgentStatusPanel agents={agents} />
        <MissionFeed
          missions={missions}
          selectedMissionId={selectedMissionId}
          onSelectMission={onSelectMission}
        />
      </aside>

      {/* MAIN WORKSPACE */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="border-b border-gray-200 px-6 py-4 bg-white flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {selectedMission?.title ?? "Workspace"}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Persistent AI collaboration environment
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs text-gray-500">
            <div className="rounded-full bg-purple-100 text-purple-700 px-3 py-1 border border-purple-200">
              Electron Runtime Online
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {!selectedMission && (
            <div className="h-full flex items-center justify-center">
              <div className="max-w-2xl text-center">
                <h2 className="text-4xl font-semibold tracking-tight text-gray-900">
                  Pushpa Workspace OS
                </h2>
                <p className="mt-4 text-gray-600 text-lg leading-relaxed">
                  Research, automate, analyze, compare, orchestrate, and build
                  with persistent AI collaborators.
                </p>
              </div>
            </div>
          )}

          {selectedMission && (
            <div className="max-w-4xl mx-auto space-y-6">
              <MissionTimeline mission={selectedMission} />
              <ArtifactPanel mission={selectedMission} />
            </div>
          )}
        </div>

        <GlobalPrompt
          prompt={prompt}
          onPromptChange={onPromptChange}
          onCreateMission={onCreateMission}
        />
      </main>

      {/* CONTEXT PANEL */}
      <RuntimeStatus selectedMission={selectedMission} />
      
      {/* APPROVAL DRAWER */}
      <ApprovalDrawer />
    </div>
  );
}

import ApprovalDrawer from "./ApprovalDrawer";
