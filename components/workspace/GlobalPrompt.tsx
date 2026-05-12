import React from "react";

export default function GlobalPrompt({
  prompt,
  onPromptChange,
  onCreateMission,
}: {
  prompt: string;
  onPromptChange: (value: string) => void;
  onCreateMission: () => void;
}) {
  return (
    <div className="border-t border-gray-200 bg-white p-5">
      <div className="max-w-5xl mx-auto">
        <div className="rounded-3xl border border-gray-200 bg-gray-50 overflow-hidden">
          <textarea
            value={prompt}
            onChange={(e) => onPromptChange(e.target.value)}
            placeholder="Ask Pushpa to research, execute, analyze, compare, automate, summarize, or orchestrate complex workflows..."
            className="w-full h-36 bg-transparent resize-none outline-none p-6 text-base placeholder:text-gray-400 text-gray-900"
          />

          <div className="flex items-center justify-between border-t border-gray-200 px-5 py-4">
            <div className="text-xs text-gray-500">
              Persistent mission-based AI collaboration
            </div>

            <button
              onClick={onCreateMission}
              className="rounded-2xl bg-purple-600 text-white px-5 py-2 text-sm font-medium hover:bg-purple-700 transition-colors"
            >
              Start Mission
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
