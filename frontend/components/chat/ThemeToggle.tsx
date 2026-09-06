"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

/** Cycles light → dark, persisting the choice in localStorage. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const saved = (localStorage.getItem("pulse-theme") as Theme);
    if (saved === "light" || saved === "dark") {
      setTheme(saved);
      document.documentElement.setAttribute("data-theme", saved);
    } else {
      // Default to light if nothing is set or an old "system" value is present
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const initial = prefersDark ? "dark" : "light";
      setTheme(initial);
      document.documentElement.setAttribute("data-theme", initial);
    }
  }, []);

  function apply(next: Theme) {
    setTheme(next);
    localStorage.setItem("pulse-theme", next);
    document.documentElement.setAttribute("data-theme", next);
  }

  const next = theme === "light" ? "dark" : "light";

  return (
    <button
      className="icon-btn"
      onClick={() => apply(next)}
      aria-label={`Theme: ${theme}. Switch to ${next}`}
      title={`Theme: ${theme}`}
    >
      {theme === "light" ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

const box = { width: 19, height: 19, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const SunIcon = () => (
  <svg {...box}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);
const MoonIcon = () => (
  <svg {...box}>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
  </svg>
);
