import React from "react";
import { Mission } from "./types";

export default function ArtifactPanel({ mission }: { mission: Mission }) {
  if (mission.artifacts.length === 0) return null;

  const renderArtifactContent = (artifact: any) => {
    switch (artifact.type) {
      case "image":
        return (
          <img
            src={artifact.url || artifact.content}
            alt={artifact.title}
            className="mt-4 rounded-lg max-w-full h-auto"
          />
        );
      case "video":
        return (
          <video
            src={artifact.url || artifact.content}
            controls
            className="mt-4 rounded-lg max-w-full"
          />
        );
      case "code":
        return (
          <pre className="mt-4 p-4 bg-gray-100 rounded-lg overflow-x-auto text-sm text-gray-800">
            <code>{artifact.content}</code>
          </pre>
        );
      case "screenshot":
        return (
          <img
            src={artifact.url || artifact.content}
            alt={artifact.title}
            className="mt-4 rounded-lg border border-gray-200 max-w-full"
          />
        );
      default:
        return artifact.content ? (
          <div className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
            {artifact.content}
          </div>
        ) : null;
    }
  };

  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-gray-500 mb-4 font-medium">
        Artifacts
      </div>

      <div className="grid grid-cols-1 gap-4">
        {mission.artifacts.map((artifact) => (
          <div
            key={artifact.id}
            className="rounded-2xl border border-gray-200 bg-white p-5"
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="font-medium text-gray-900">
                  {artifact.title}
                </div>
                <div className="text-xs text-gray-500 mt-1 uppercase font-medium">
                  {artifact.type}
                </div>
              </div>
            </div>

            {renderArtifactContent(artifact)}

            {artifact.url && artifact.type !== "image" && artifact.type !== "video" && (
              <a
                href={artifact.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex mt-4 text-sm text-purple-600 hover:text-purple-700 hover:underline"
              >
                Open Link
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
