// lib/prompt-builder.ts
// Transforms cleaning stats and AI insights into image/video generation prompts.
// Pure string transformation — no API calls, no LLM.

export interface CleanResult {
  cleanedRowCount: number;
  headers: string[];
  qualityAfter: number;
  cleanedTokens: number;
  [key: string]: any;
}

// ── Image prompt builder ──────────────────────────────────────────────────────

export function buildImagePrompt(
  stats: CleanResult,
  vertical: string,
  insights: string,
  userInputs: {
    style: string;
    format: string;
    brandColors?: string;
    brandFonts?: string;
  }
): string {
  const templates: Record<string, (s: CleanResult, i: string, u: typeof userInputs) => string> = {

    ux_research: (stats, insights, userInputs) => {
      const failRate = insights.match(/(\d+)%.*fail/i)?.[1];
      const topIssue = insights.match(/FINDING: ([^\n]+)/)?.[1];

      return [
        userInputs.style === "infographic"
          ? "Clean professional infographic"
          : "UI/UX design mockup",
        failRate ? `showing ${failRate}% task failure rate visualization` : "",
        topIssue ? `with callout highlighting: "${topIssue}"` : "",
        "Minimal design, white background, clear data visualization",
        userInputs.brandColors
          ? `Color scheme: ${userInputs.brandColors}`
          : "Professional blue and white color scheme",
        "No photographic elements, vector illustration style",
        "High contrast, readable typography",
        `Format: ${userInputs.format}`,
      ].filter(Boolean).join(". ");
    },

    trader: (stats, insights, userInputs) => {
      const winRate  = insights.match(/(\d+)% win rate/i)?.[1];
      const bestSetup = insights.match(/FINDING: ([^\n]+)/)?.[1];

      return [
        userInputs.style === "infographic"
          ? "Financial data visualization infographic"
          : "Trading performance dashboard mockup",
        winRate ? `showing ${winRate}% win rate` : "showing trading performance metrics",
        bestSetup ? `highlighting pattern: "${bestSetup}"` : "",
        "Professional financial aesthetic, dark background",
        "Green for positive, red for negative performance",
        userInputs.brandColors ? `Brand colors: ${userInputs.brandColors}` : "",
        "Clean data visualization, no clutter",
        `Format: ${userInputs.format}`,
        "Not financial advice disclaimer included in design",
      ].filter(Boolean).join(". ");
    },

    content_creator: (stats, insights, userInputs) => {
      const topTheme = insights.match(/FINDING: ([^\n]+)/)?.[1];

      return [
        "YouTube thumbnail design",
        topTheme ? `for video about: "${topTheme}"` : "",
        "Bold text overlay, high contrast",
        userInputs.brandColors
          ? `Colors: ${userInputs.brandColors}`
          : "Vibrant attention-grabbing colors",
        "Clean background, large readable font",
        "Professional thumbnail style, high CTR design",
        "16:9 aspect ratio",
      ].filter(Boolean).join(". ");
    },

    aws: (stats, insights, userInputs) => {
      const topService = insights.match(/FINDING: ([^\n]+)/)?.[1];

      return [
        userInputs.style === "infographic"
          ? "Cloud cost breakdown infographic"
          : "AWS cost dashboard visualization",
        topService ? `highlighting: "${topService}"` : "",
        `Showing data from ${stats.cleanedRowCount.toLocaleString()} billing line items`,
        "Professional technical aesthetic, AWS orange and dark theme",
        userInputs.brandColors ? `Brand colors: ${userInputs.brandColors}` : "",
        "Clean charts, clear cost breakdown",
        `Format: ${userInputs.format}`,
      ].filter(Boolean).join(". ");
    },

    general: (stats, insights, userInputs) => {
      return [
        `${userInputs.style} visualization`,
        `representing data with ${stats.cleanedRowCount.toLocaleString()} data points`,
        userInputs.brandColors
          ? `Color scheme: ${userInputs.brandColors}`
          : "Professional color scheme",
        "Clean, minimal design",
        `Format: ${userInputs.format}`,
      ].filter(Boolean).join(". ");
    },
  };

  const template = templates[vertical] || templates.general;
  return template(stats, insights, userInputs);
}

// ── Video prompt builder ──────────────────────────────────────────────────────

export function buildVideoPrompt(
  stats: CleanResult,
  vertical: string,
  insights: string,
  userInputs: {
    style: string;
    duration: number;
    brandColors?: string;
  }
): { script: string; visualPrompt: string } {
  const keyFinding = insights.match(/FINDING: ([^\n]+)/)?.[1] || "key data insight";
  const keyNumber  = insights.match(/(\d+)%/)?.[0] || "";

  const scripts: Record<string, string> = {
    ux_research: `A clean data visualization animates in. Text appears: "${keyFinding}". ${keyNumber ? `The number ${keyNumber} pulses on screen.` : ""} Clean, professional motion graphics style.`,
    trader:      `Financial chart animates smoothly. Performance pattern highlighted. "${keyFinding}" appears as text overlay. Professional trading dashboard aesthetic.`,
    aws:         `Cloud cost breakdown animates from zero. "${keyFinding}" highlighted with cost figures. Clean technical motion graphic.`,
    content_creator: `Content performance metrics animate in. "${keyFinding}" emphasized with bold text. Creator-friendly style, vibrant colors.`,
    general:     `Data visualization animates from empty to populated. "${keyFinding}" highlighted as the key insight. Clean, professional style.`,
  };

  const script      = scripts[vertical] || scripts.general;
  const visualPrompt = [
    `${userInputs.style} motion graphic`,
    `${userInputs.duration} seconds`,
    userInputs.brandColors ? `color scheme: ${userInputs.brandColors}` : "",
    "professional data visualization animation",
    "no text overlays except data labels",
    "smooth transitions, clean minimal aesthetic",
  ].filter(Boolean).join(", ");

  return { script, visualPrompt };
}

// ── Estimate generation cost ──────────────────────────────────────────────────

export function estimateGenerationCost(
  type: "image" | "video",
  provider: string,
  options: { size?: string; duration?: number }
): { estimate: string; detail: string } {
  if (type === "image") {
    if (provider === "dalle") {
      const cost = options.size === "1024x1024" ? "$0.04" : "$0.08";
      return { estimate: cost, detail: "from your OpenAI account" };
    }
    if (provider === "flux") {
      return { estimate: "~$0.025", detail: "from your fal.ai account" };
    }
  }
  if (type === "video" && provider === "luma") {
    const dur  = options.duration || 5;
    const cost = (dur * 0.0019 * 30).toFixed(2);
    return { estimate: `~$${cost}`, detail: "from your Luma AI account" };
  }
  return { estimate: "varies", detail: "from your API account" };
}
