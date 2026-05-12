import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ["'JetBrains Mono'", "monospace"],
        sans: ["'DM Sans'", "sans-serif"],
      },
      colors: {
        // All colors reference CSS variables so data-theme switching works.
        // Tailwind generates e.g. background-color: var(--surface) instead of
        // a hardcoded hex that never responds to theme changes.
        accent:        "var(--accent)",
        "accent-dim":  "var(--accent-dim)",
        "accent-soft": "var(--accent-soft)",
        surface:       "var(--surface)",
        panel:         "var(--panel)",
        "panel-2":     "var(--panel-2)",
        border:        "var(--border)",
        muted:         "var(--muted)",
        text:          "var(--text)",
        "text-dim":    "var(--text-dim)",
        danger:        "var(--danger)",
        warn:          "var(--warn)",
        success:       "var(--success)",
        info:          "var(--info)",
      },
    },
  },
  plugins: [],
};

export default config;
