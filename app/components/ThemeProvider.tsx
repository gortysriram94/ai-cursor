"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { loadPersistedKeys } from "@/lib/byok";
import { getSettings, saveSettings } from "@/lib/store";

type Theme = "dark" | "light";

interface ThemeContextValue {
  theme: Theme;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  toggle: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

function applyTheme(t: Theme) {
  document.documentElement.setAttribute("data-theme", t);
  document.documentElement.style.backgroundColor =
    t === "light" ? "#F5F2EE" : "#1A1611";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Default to dark — the inline script in layout.tsx has already set the
  // correct attribute on <html> before React hydrates, so there is no flash.
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    loadPersistedKeys();

    const lsTheme = (localStorage.getItem("tokenlift_theme") as Theme) || "dark";
    setTheme(lsTheme);
    applyTheme(lsTheme);

    getSettings().then(s => {
      if (s.theme && s.theme !== lsTheme) {
        setTheme(s.theme);
        applyTheme(s.theme);
        localStorage.setItem("tokenlift_theme", s.theme);
      }
    }).catch(() => {});
  }, []);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("tokenlift_theme", next);
    applyTheme(next);
    saveSettings({ theme: next }).catch(() => {});
  };

  // No visibility:hidden guard — the inline script below handles theme before
  // React renders, so children are always visible immediately.
  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export default ThemeProvider;
