"use client";

// app/components/DynamicPopCard.tsx
// ─────────────────────────────────────────────────────────────────────
// Dynamic Pop Card — renders a form based on `fields` array.
// Triggered when HUD_UPDATE intent === 'SECURE_INPUT'.
// Pauses the engine until a WIDGET_SUBMIT event is returned.
// ─────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useRef } from "react";
import { logger } from "@/lib/logger";

interface DynamicPopCardProps {
  stepId:       string;
  fields:        string[];   // e.g., ["email", "full_name", "phone"]
  description?:  string;
  onSubmitted?:  (data: Record<string, string>) => void;
}

export default function DynamicPopCard({ stepId, fields, description, onSubmitted }: DynamicPopCardProps) {
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const firstInputRef = useRef<HTMLInputElement>(null);

  // Focus first input on mount
  useEffect(() => {
    setTimeout(() => firstInputRef.current?.focus(), 100);
  }, []);

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    // Log the submission
    logger.hudUpdate("System", `PII submitted for ${description || stepId}`, "SECURE_INPUT",
      undefined, fields, "success");

    // Call onSubmitted callback
    onSubmitted?.(formData);

    // Post WIDGET_SUBMIT to extension (or parent window)
    try {
      window.parent.postMessage({
        bridge: "AGENT",
        type: "WIDGET_SUBMIT",
        stepId,
        data: formData,
      }, '*');
    } catch (_) {}

    setSubmitting(false);
  };

  const isComplete = fields.every(f => formData[f]?.trim());

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60">
      <div className="bg-gray-900 border border-red-500/50 rounded-xl p-6 w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-2 mb-4">
          <span className="text-red-400 text-xl">🔒</span>
          <div>
            <h3 className="text-white font-bold text-lg">Secure Input Required</h3>
            {description && (
              <p className="text-gray-400 text-sm">{description}</p>
            )}
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {fields.map((field, i) => (
            <div key={field}>
              <label className="block text-sm font-medium text-gray-300 mb-1 capitalize">
                {field.replace(/_/g, ' ')}
                <span className="text-red-400">*</span>
              </label>
              <input
                ref={i === 0 ? firstInputRef : undefined}
                type={field.includes("email") ? "email" : field.includes("phone") ? "tel" : "text"}
                required
                value={formData[field] || ""}
                onChange={(e) => handleChange(field, e.target.value)}
                placeholder={`Enter your ${field.replace(/_/g, ' ')}...`}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white
                           focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
          ))}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={!isComplete || submitting}
              className="flex-1 py-2 px-4 bg-red-600 hover:bg-red-700 disabled:bg-gray-700 disabled:text-gray-500
                         text-white font-semibold rounded-lg transition-colors"
            >
              {submitting ? "Submitting..." : "Submit Securely"}
            </button>
          </div>
        </form>

        {/* Footer note */}
        <p className="text-xs text-gray-500 mt-3 text-center">
          🔒 Your data is sent directly to the browser extension — never to our servers.
        </p>
      </div>
    </div>
  );
}
