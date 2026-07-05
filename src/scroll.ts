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

/**
 * Reveal chapter copy immediately — runs before the (deferred) 3D loads so
 * above-the-fold content and CTAs are visible without waiting on three.js.
 */
export function initReveals() {
  revealChapters();
  if (reduceMotion()) document.documentElement.classList.add("reduced");
}

/** Wire the smooth-scroll rig to a renderer (called once the renderer loads). */
export function initScrollRig(renderer: SceneRenderer) {
  bindPointer(renderer);

  if (reduceMotion()) {
    // Native scroll; renderer stays on its static composition.
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
    // scroll velocity energizes the field; it settles when reading stops
    renderer.setEnergy(Math.min(1, Math.abs(lenis.velocity || 0) / 28));
  });

  bindScenes(renderer);
  bindCTA(renderer);

  // Debug hook so automated checks can drive real (Lenis) scroll. Dev only.
  if (import.meta.env.DEV) {
    (window as unknown as { __lenis?: Lenis }).__lenis = lenis;
  }

  renderer.setScene(0);
  renderer.start();
}

/** Snap the particle word to whichever chapter is centered in the viewport. */
function bindScenes(renderer: SceneRenderer) {
  const sections = Array.from(
    document.querySelectorAll<HTMLElement>("[data-scene]")
  );
  if (!sections.length) return;
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          const i = Number((e.target as HTMLElement).dataset.scene || 0);
          renderer.setScene(i);
        }
      }
    },
    { threshold: 0.55 }
  );
  sections.forEach((s) => io.observe(s));
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

/** The field energizes and brightens while the visitor is on a CTA. */
function bindCTA(renderer: SceneRenderer) {
  const ctas = document.querySelectorAll<HTMLElement>(".btn--primary");
  ctas.forEach((el) => {
    el.addEventListener("pointerenter", () => renderer.setHover(true));
    el.addEventListener("pointerleave", () => renderer.setHover(false));
  });
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
