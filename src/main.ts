/* ============================================================
   Sage Nord — entry point.
   Wires theme, scroll reveals, hero entrance, and the particle
   field. Everything here is progressive enhancement: the site is
   complete and readable with this script disabled.
   ============================================================ */

import "./style.css";
import { initThemeToggle, onThemeChange } from "./theme";
import { ParticleField } from "./particles";

const reduceMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)"
).matches;

/* ---- Footer year ---------------------------------------- */
const yearEl = document.getElementById("year");
if (yearEl) yearEl.textContent = String(new Date().getFullYear());

/* ---- Theme ---------------------------------------------- */
initThemeToggle();

/* ---- Scroll reveals ------------------------------------- */
function initReveals() {
  const items = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
  if (reduceMotion || !("IntersectionObserver" in window)) {
    items.forEach((el) => el.classList.add("is-in"));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          (entry.target as HTMLElement).style.transitionDelay =
            (entry.target as HTMLElement).dataset.delay ?? "0ms";
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: "0px 0px -8% 0px" }
  );
  items.forEach((el) => io.observe(el));
}

/* ---- Hero mission entrance (word stagger) --------------- */
function initHeroEntrance() {
  const mission = document.querySelector<HTMLElement>("[data-split]");
  if (!mission) return;
  if (reduceMotion) return; // leave as-is, fully visible

  const words = (mission.textContent ?? "").trim().split(/\s+/);
  mission.textContent = "";
  mission.style.setProperty("--stagger", "0");
  words.forEach((word, idx) => {
    const wrap = document.createElement("span");
    wrap.className = "word";
    wrap.textContent = word;
    wrap.style.transitionDelay = `${idx * 70}ms`;
    mission.appendChild(wrap);
    mission.appendChild(document.createTextNode(" "));
  });
  // trigger on next frame
  requestAnimationFrame(() => mission.classList.add("is-in"));
}

/* ---- Particle field ------------------------------------- */
function initParticles() {
  const canvas = document.getElementById("scene") as HTMLCanvasElement | null;
  if (!canvas) return;
  // Bail entirely if WebGL is unavailable — the site stands on its own.
  try {
    const field = new ParticleField(canvas);
    field.start();
    onThemeChange(() => field.setTheme());
  } catch (err) {
    console.warn("Particle field unavailable:", err);
    canvas.style.display = "none";
  }
}

initReveals();
initHeroEntrance();
initParticles();
