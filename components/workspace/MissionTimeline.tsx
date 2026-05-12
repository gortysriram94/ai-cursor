import React from "react";
import { Mission, TimelineEvent } from "./types";

function timeAgo(ts: number) {
  const diff = Math.floor((Date.now() - ts) / 1000);

  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;

  return `${Math.floor(diff / 86400)}d ago`;
}

export default function MissionTimeline({ mission }: { mission: Mission }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-gray-500 mb-4 font-medium">
        Mission Timeline
      </div>

      <div className="space-y-3">
        {mission.timeline.map((event: TimelineEvent) => (
          <div
            key={event.id}
            className="rounded-2xl border border-gray-200 bg-white p-4"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm leading-relaxed text-gray-900">
                  {event.message}
                </div>
                <div className="text-xs text-gray-500 mt-2 uppercase font-medium">
                  {event.type}
                </div>
              </div>
              <div className="text-xs text-gray-500 whitespace-nowrap">
                {timeAgo(event.createdAt)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
