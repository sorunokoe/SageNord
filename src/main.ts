/* ============================================================
   Sage Nord — entry point.
   Content-first: the site is complete and readable with this
   script disabled. Enhancements: theme, scroll story, WebGL.
   ============================================================ */

import "./style.css";
import { initThemeToggle, onThemeChange } from "./theme";
import { PointsRenderer, type SceneRenderer } from "./renderer";
import { initScroll } from "./scroll";

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* Footer year */
const yearEl = document.getElementById("year");
if (yearEl) yearEl.textContent = String(new Date().getFullYear());

/* Theme */
initThemeToggle();

/* Hero line entrance (word stagger) */
(function heroEntrance() {
  const line = document.querySelector<HTMLElement>("[data-split]");
  if (!line || reduceMotion) return;
  const words = (line.textContent ?? "").trim().split(/\s+/);
  line.textContent = "";
  words.forEach((w, i) => {
    const span = document.createElement("span");
    span.className = "word";
    span.textContent = w;
    span.style.transitionDelay = `${i * 90}ms`;
    line.appendChild(span);
    line.appendChild(document.createTextNode(" "));
  });
  requestAnimationFrame(() => line.classList.add("is-in"));
})();

/* WebGL scene + scroll story */
(function initScene() {
  const canvas = document.getElementById("scene") as HTMLCanvasElement | null;
  if (!canvas) return;
  let renderer: SceneRenderer;
  try {
    renderer = new PointsRenderer(canvas);
  } catch (err) {
    console.warn("WebGL unavailable — running without the canvas.", err);
    canvas.style.display = "none";
    // Still reveal chapter copy via the scroll rig with a no-op renderer.
    initScroll({
      setProgress() {},
      setPointer() {},
      setTheme() {},
      resize() {},
      start() {},
      stop() {},
      dispose() {},
    });
    return;
  }
  onThemeChange(() => renderer.setTheme());
  window.addEventListener("resize", () => renderer.resize(), { passive: true });
  initScroll(renderer);
})();
