import React from "react";
import { Mission } from "./types";

export default function RuntimeStatus({ selectedMission }: { selectedMission: Mission | null }) {
  return (
    <aside className="w-[340px] border-l border-gray-200 bg-white flex flex-col overflow-hidden">
      <div className="p-5 border-b border-gray-200">
        <div className="text-xs uppercase tracking-wider text-gray-500 mb-3 font-medium">
          Runtime Context
        </div>

        {selectedMission ? (
          <div className="space-y-3 text-sm">
            <div className="rounded-xl border border-gray-200 p-3 bg-gray-50">
              <div className="text-gray-500 text-xs uppercase mb-1 font-medium">
                Task ID
              </div>
              <div className="break-all font-mono text-xs text-gray-900">
                {selectedMission.context.taskId}
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 p-3 bg-gray-50">
              <div className="text-gray-500 text-xs uppercase mb-1 font-medium">
                Auth State
              </div>
              <div className="text-gray-900">{selectedMission.context.authState}</div>
            </div>

            <div className="rounded-xl border border-gray-200 p-3 bg-gray-50">
              <div className="text-gray-500 text-xs uppercase mb-1 font-medium">
                Current URL
              </div>
              <div className="break-all text-xs text-gray-700">
                {selectedMission.context.currentUrl || "No active navigation"}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-gray-500">
            No active mission selected.
          </div>
        )}
      </div>

      <div className="p-5 overflow-y-auto">
        <div className="text-xs uppercase tracking-wider text-gray-500 mb-4 font-medium">
          Workspace Philosophy
        </div>

        <div className="space-y-4 text-sm text-gray-600 leading-relaxed">
          <p>
            Browser automation is now invisible infrastructure.
          </p>
          <p>
            Users interact with missions, artifacts, timelines, approvals,
            and persistent AI collaborators.
          </p>
          <p>
            Electron owns execution.
            <br />
            Next.js owns orchestration and projection.
          </p>
        </div>
      </div>
    </aside>
  );
}
