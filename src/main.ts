/* ============================================================
   Sage Nord — entry point.
   Content-first: the site is complete and readable with this
   script disabled. Enhancements: theme, scroll story, WebGL.
   ============================================================ */

import "./style.css";
import { initThemeToggle, onThemeChange } from "./theme";
import { PointsRenderer, type SceneRenderer } from "./renderer";
import { FlowFieldRenderer } from "./gpgpu";
import { initScroll } from "./scroll";

const isMobile = window.matchMedia("(max-width: 720px)").matches;

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
    // GPGPU flow-field on capable desktops; lighter CPU points on
    // mobile / reduced-motion (avoids the GPGPU+scroll fps cost).
    if (isMobile || reduceMotion) {
      renderer = new PointsRenderer(canvas);
    } else {
      try {
        renderer = new FlowFieldRenderer(canvas);
      } catch (gpuErr) {
        console.warn("GPGPU unavailable — falling back to CPU points.", gpuErr);
        // A canvas can hold only one WebGL context; swap in a fresh one.
        const fresh = canvas.cloneNode(false) as HTMLCanvasElement;
        canvas.replaceWith(fresh);
        renderer = new PointsRenderer(fresh);
      }
    }
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
