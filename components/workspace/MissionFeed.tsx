import React from "react";
import { Mission } from "./types";

function timeAgo(ts: number) {
  const diff = Math.floor((Date.now() - ts) / 1000);

  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;

  return `${Math.floor(diff / 86400)}d ago`;
}

export default function MissionFeed({
  missions,
  selectedMissionId,
  onSelectMission,
}: {
  missions: Mission[];
  selectedMissionId: string | null;
  onSelectMission: (id: string) => void;
}) {
  return (
    <div className="flex-1 overflow-y-auto p-3">
      <div className="text-xs uppercase tracking-wider text-gray-500 mb-3 px-2 font-medium">
        Missions
      </div>

      <div className="space-y-2">
        {missions.map((mission) => (
          <button
            key={mission.id}
            onClick={() => onSelectMission(mission.id)}
            className={`w-full text-left rounded-2xl p-4 border transition-all ${
              selectedMissionId === mission.id
                ? "border-purple-300 bg-purple-50"
                : "border-gray-200 bg-white hover:bg-gray-50"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="font-medium text-sm text-gray-900 line-clamp-2">
                {mission.title}
              </div>
              <div className="text-[10px] uppercase text-gray-500 font-medium">
                {mission.status}
              </div>
            </div>
            <div className="text-xs text-gray-500 mt-2">
              {timeAgo(mission.updatedAt)}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
