import React from "react";
import { AgentRuntime } from "./types";

export default function AgentStatusPanel({ agents }: { agents: AgentRuntime[] }) {
  return (
    <div className="p-4 border-b border-gray-200">
      <div className="text-xs uppercase tracking-wider text-gray-500 mb-3 font-medium">
        Agents
      </div>

      <div className="space-y-2">
        {agents.map((agent) => (
          <div
            key={agent.id}
            className="rounded-xl border border-gray-200 p-3 bg-gray-50"
          >
            <div className="flex items-center justify-between">
              <div className="font-medium text-sm text-gray-900">{agent.name}</div>
              <div className="text-[10px] uppercase text-gray-500 font-medium">
                {agent.status}
              </div>
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {agent.role}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
