// app/chat/components/OnboardingTutorial.tsx
"use client";

import { useState, useEffect } from "react";

interface OnboardingTutorialProps {
  onComplete: () => void;
}

export default function OnboardingTutorial({ onComplete }: OnboardingTutorialProps) {
  const [step, setStep] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check if user has seen tutorial
    const hasSeenTutorial = localStorage.getItem("tokenlift_tutorial_seen");
    if (hasSeenTutorial) {
      setDismissed(true);
      onComplete();
    }
  }, [onComplete]);

  const handleComplete = () => {
    localStorage.setItem("tokenlift_tutorial_seen", "true");
    setDismissed(true);
    onComplete();
  };

  const steps = [
    {
      icon: "🎯",
      title: "True Breadcrumb Control",
      description: "Every action requires your approval. No surprises, no hidden costs, no black box AI.",
      detail: "When you send a task, we'll show you exactly what steps we'll take before executing anything.",
    },
    {
      icon: "💰",
      title: "See Costs Before You Pay",
      description: "Full cost transparency upfront. See what you'll pay, what you'll save, and modify the plan.",
      detail: "Each step shows its cost. Smart routing saves up to 65% vs GPT-4o — you see exactly where the savings come from.",
    },
    {
      icon: "✓",
      title: "Approve, Modify, or Cancel",
      description: "Review the plan. Uncheck optional steps. Approve only what you want. Cancel anytime.",
      detail: "First and last steps are always required for quality. Everything in between is your choice.",
    },
  ];

  if (dismissed) return null;

  const currentStep = steps[step];
  const isLastStep = step === steps.length - 1;

  return (
    <div style={{
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: "rgba(0, 0, 0, 0.95)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 99999,
      padding: 20,
      backdropFilter: "blur(8px)",
      animation: "fadeIn 0.3s ease",
    }}>
      <div style={{
        background: "var(--panel)",
        border: "3px solid var(--accent)",
        borderRadius: 24,
        maxWidth: 600,
        width: "100%",
        padding: "48px 40px",
        textAlign: "center",
        position: "relative",
        boxShadow: "0 32px 96px rgba(0, 0, 0, 0.6)",
      }}>
        {/* Skip button */}
        <button
          onClick={handleComplete}
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            background: "none",
            border: "1px solid var(--border)",
            color: "var(--muted)",
            padding: "6px 12px",
            fontSize: 11,
            cursor: "pointer",
            borderRadius: 6,
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "var(--accent)";
            e.currentTarget.style.color = "var(--accent)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--border)";
            e.currentTarget.style.color = "var(--muted)";
          }}
        >
          Skip
        </button>

        {/* Icon */}
        <div style={{
          fontSize: 80,
          marginBottom: 24,
          animation: "scaleIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}>
          {currentStep.icon}
        </div>

        {/* Title */}
        <h2 style={{
          fontSize: 32,
          fontWeight: 900,
          color: "var(--text)",
          marginBottom: 16,
          animation: "slideUp 0.5s ease 0.1s both",
        }}>
          {currentStep.title}
        </h2>

        {/* Description */}
        <p style={{
          fontSize: 18,
          color: "var(--accent)",
          marginBottom: 24,
          lineHeight: 1.6,
          animation: "slideUp 0.5s ease 0.2s both",
        }}>
          {currentStep.description}
        </p>

        {/* Detail */}
        <p style={{
          fontSize: 15,
          color: "var(--text-dim)",
          lineHeight: 1.8,
          marginBottom: 40,
          animation: "slideUp 0.5s ease 0.3s both",
        }}>
          {currentStep.detail}
        </p>

        {/* Progress dots */}
        <div style={{
          display: "flex",
          gap: 8,
          justifyContent: "center",
          marginBottom: 32,
        }}>
          {steps.map((_, i) => (
            <div
              key={i}
              style={{
                width: i === step ? 32 : 8,
                height: 8,
                background: i === step ? "var(--accent)" : "var(--border)",
                borderRadius: 4,
                transition: "all 0.3s",
              }}
            />
          ))}
        </div>

        {/* Navigation */}
        <div style={{ display: "flex", gap: 12 }}>
          {step > 0 && (
            <button
              onClick={() => setStep(step - 1)}
              style={{
                flex: 1,
                padding: "16px 24px",
                background: "transparent",
                border: "2px solid var(--border)",
                color: "var(--text)",
                fontSize: 15,
                fontWeight: 700,
                cursor: "pointer",
                borderRadius: 12,
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--accent)";
                e.currentTarget.style.color = "var(--accent)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--border)";
                e.currentTarget.style.color = "var(--text)";
              }}
            >
              ← Back
            </button>
          )}
          
          <button
            onClick={() => isLastStep ? handleComplete() : setStep(step + 1)}
            style={{
              flex: step > 0 ? 2 : 1,
              padding: "16px 24px",
              background: "var(--accent)",
              border: "none",
              color: "white",
              fontSize: 15,
              fontWeight: 700,
              cursor: "pointer",
              borderRadius: 12,
              transition: "all 0.2s",
              boxShadow: "0 4px 16px rgba(218, 119, 86, 0.4)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = "0 8px 24px rgba(218, 119, 86, 0.5)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "0 4px 16px rgba(218, 119, 86, 0.4)";
            }}
          >
            {isLastStep ? "Get Started 🚀" : "Next →"}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleIn {
          from { transform: scale(0.5); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}