/* ============================================================
   Scroll rig — Lenis smooth scroll on GSAP's single ticker,
   mapping normalized scroll progress (0..1) to the renderer and
   revealing chapter copy. Native scroll + instant reveals under
   prefers-reduced-motion.
   ============================================================ */

import Lenis from "lenis";
import { gsap } from "gsap";
import type { SceneRenderer } from "./renderer";

const reduceMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function initScroll(renderer: SceneRenderer) {
  revealChapters();
  bindPointer(renderer);

  if (reduceMotion()) {
    // Native scroll; renderer stays on its static composition.
    document.documentElement.classList.add("reduced");
    return;
  }

  const lenis = new Lenis({
    lerp: 0.1,
    smoothWheel: true,
    wheelMultiplier: 1,
  });

  // Single clock: drive Lenis from GSAP's ticker, no lag smoothing.
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);

  lenis.on("scroll", () => {
    renderer.setProgress(lenis.progress || 0);
  });

  // Debug hook so automated checks can drive real (Lenis) scroll. Dev only.
  if (import.meta.env.DEV) {
    (window as unknown as { __lenis?: Lenis }).__lenis = lenis;
  }

  renderer.setProgress(0);
  renderer.start();
}

/** Fade + rise each chapter's content as it enters the viewport. */
function revealChapters() {
  const items = Array.from(
    document.querySelectorAll<HTMLElement>("[data-reveal]")
  );
  if (reduceMotion() || !("IntersectionObserver" in window)) {
    items.forEach((el) => el.classList.add("is-in"));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("is-in");
          io.unobserve(e.target);
        }
      });
    },
    { threshold: 0.2, rootMargin: "0px 0px -10% 0px" }
  );
  items.forEach((el) => io.observe(el));
}

function bindPointer(renderer: SceneRenderer) {
  if (reduceMotion()) return;
  window.addEventListener(
    "pointermove",
    (e) => renderer.setPointer(e.clientX, e.clientY, true),
    { passive: true }
  );
  window.addEventListener("pointerleave", () =>
    renderer.setPointer(0, 0, false)
  );
}
