/* ============================================================
   Sage Nord — entry point.
   Content-first: the site is complete and readable with this
   script disabled. Enhancements: theme, scroll story, WebGL.
   ============================================================ */

import "./style.css";
import { initThemeToggle, onThemeChange } from "./theme";
import type { SceneRenderer } from "./renderer";
import { initReveals, initScrollRig } from "./scroll";

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

/* Reveal content immediately (does not wait on three.js) */
initReveals();

/* Defer the heavy 3D bundle until after first paint — protects LCP/INP.
   The canvas is decorative; the site is complete before it loads. */
function whenIdle(fn: () => void) {
  const w = window as unknown as { requestIdleCallback?: (cb: () => void) => void };
  if (reduceMotion) {
    // still load (static frame), but no rush
    w.requestIdleCallback ? w.requestIdleCallback(fn) : setTimeout(fn, 200);
    return;
  }
  if (document.readyState === "complete") w.requestIdleCallback?.(fn) ?? setTimeout(fn, 1);
  else window.addEventListener("load", () =>
    w.requestIdleCallback ? w.requestIdleCallback(fn) : setTimeout(fn, 1)
  );
}

whenIdle(async () => {
  const canvas = document.getElementById("scene") as HTMLCanvasElement | null;
  if (!canvas) return;
  const { PointsRenderer } = await import("./renderer");
  let renderer: SceneRenderer;
  try {
    if (isMobile || reduceMotion) {
      renderer = new PointsRenderer(canvas);
    } else {
      try {
        const { FlowFieldRenderer } = await import("./gpgpu");
        renderer = new FlowFieldRenderer(canvas);
      } catch (gpuErr) {
        console.warn("GPGPU unavailable — falling back to CPU points.", gpuErr);
        const fresh = canvas.cloneNode(false) as HTMLCanvasElement;
        canvas.replaceWith(fresh);
        renderer = new PointsRenderer(fresh);
      }
    }
  } catch (err) {
    console.warn("WebGL unavailable — running without the canvas.", err);
    canvas.style.display = "none";
    return;
  }
  onThemeChange(() => renderer.setTheme());
  window.addEventListener("resize", () => renderer.resize(), { passive: true });
  if (import.meta.env.DEV) {
    (window as unknown as { __renderer?: SceneRenderer }).__renderer = renderer;
  }
  initScrollRig(renderer);
});
