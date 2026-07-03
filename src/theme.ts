/* ============================================================
   Theme control — light/dark with system default, toggle, and
   localStorage persistence. The no-flash script in index.html
   sets the initial data-theme before first paint; this module
   only handles user toggles after load.
   ============================================================ */

type Theme = "light" | "dark";
type Listener = (theme: Theme) => void;

const KEY = "theme";
const listeners: Listener[] = [];

export function currentTheme(): Theme {
  return document.documentElement.getAttribute("data-theme") === "dark"
    ? "dark"
    : "light";
}

function apply(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* ignore */
  }
  listeners.forEach((fn) => fn(theme));
}

export function onThemeChange(fn: Listener) {
  listeners.push(fn);
}

export function initThemeToggle() {
  const btn = document.getElementById("theme-toggle");
  if (!btn) return;
  btn.addEventListener("click", () => {
    apply(currentTheme() === "dark" ? "light" : "dark");
  });

  // If the user hasn't chosen explicitly, follow OS changes live.
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", (e) => {
      let stored: string | null = null;
      try {
        stored = localStorage.getItem(KEY);
      } catch {
        /* ignore */
      }
      if (!stored) apply(e.matches ? "dark" : "light");
    });
}
