/* ============================================================
   Particle morph field — the hero centerpiece.
   Single THREE.Points cloud (1 draw call) that morphs
   N-rune → globe → app grid → dissolve, drifts gently, and
   reacts to the cursor. Built to be a good citizen:
   - DPR capped + dynamic downscale on sustained frame drop
   - paused when tab hidden or scrolled offscreen
   - lighter particle count on mobile
   - respects prefers-reduced-motion (static, no loop)
   - theme-tinted, decorative (canvas is aria-hidden)
   ============================================================ */

import {
  BufferAttribute,
  BufferGeometry,
  Color,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Scene,
  Texture,
  WebGLRenderer,
  AdditiveBlending,
  NormalBlending,
} from "three";
import { makeShapes } from "./shapes";

const prefersReducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function isMobile(): boolean {
  return window.matchMedia("(max-width: 720px)").matches;
}

/** Soft round sprite so points render as glowing dots, not squares. */
function makeSprite(): Texture {
  const s = 64;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.85)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const tex = new Texture(c);
  tex.needsUpdate = true;
  return tex;
}

function cssColor(varName: string, fallback: string): Color {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(varName)
    .trim();
  return new Color(raw || fallback);
}

export class ParticleField {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera: PerspectiveCamera;
  private points!: Points;
  private geometry = new BufferGeometry();
  private material: PointsMaterial;

  private count: number;
  private shapes: Float32Array[];
  private current: Float32Array;
  private phase: Float32Array; // per-particle drift phase
  private colorA = new Color();
  private colorB = new Color();

  private targetIndex = 0;
  private morphTimer = 0;
  private readonly holdTime = 3.2; // seconds per shape

  private mouse = { x: 0, y: 0, active: false };
  private raf = 0;
  private lastT = 0;
  private running = false;
  private visible = true;
  private inView = true;

  private maxDpr: number;
  private dpr: number;
  private fpsAccum = 0;
  private fpsFrames = 0;
  private downscaleCheck = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.count = isMobile() ? 4000 : 9000;
    this.shapes = makeShapes(this.count);
    this.current = Float32Array.from(this.shapes[3]); // start from cloud
    this.phase = new Float32Array(this.count);
    for (let i = 0; i < this.count; i++) this.phase[i] = Math.random() * Math.PI * 2;

    this.maxDpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = this.maxDpr;

    this.renderer = new WebGLRenderer({
      canvas,
      antialias: false,
      alpha: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(this.dpr);

    this.camera = new PerspectiveCamera(50, 1, 0.1, 100);
    this.camera.position.z = 4.2;

    // geometry
    const positions = new BufferAttribute(this.current, 3);
    positions.setUsage(35048); // DYNAMIC_DRAW
    this.geometry.setAttribute("position", positions);
    const colors = new Float32Array(this.count * 3);
    this.geometry.setAttribute("color", new BufferAttribute(colors, 3));

    this.material = new PointsMaterial({
      size: isMobile() ? 0.03 : 0.026,
      map: makeSprite(),
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      sizeAttenuation: true,
      opacity: 0.92,
    });

    this.points = new Points(this.geometry, this.material);
    this.scene.add(this.points);

    this.applyTheme();
    this.resize();

    // Offset the cloud to the right on wide screens so it sits beside the
    // hero copy rather than directly under it.
    this.points.position.x = isMobile() ? 0 : 1.15;

    this.bind();

    if (prefersReducedMotion()) {
      // Static, meaningful frame: settle straight onto the globe, render once.
      this.current.set(this.shapes[1]);
      this.writeColors();
      (this.geometry.getAttribute("position") as BufferAttribute).needsUpdate =
        true;
      this.renderer.render(this.scene, this.camera);
    }
  }

  private bind() {
    window.addEventListener("resize", this.resize, { passive: true });
    window.addEventListener("pointermove", this.onPointer, { passive: true });
    window.addEventListener("pointerleave", this.onLeave, { passive: true });
    document.addEventListener("visibilitychange", this.onVisibility);

    // Pause when the hero canvas scrolls out of view.
    const io = new IntersectionObserver(
      (entries) => {
        this.inView = entries[0]?.isIntersecting ?? true;
        this.updateRunning();
      },
      { threshold: 0.01 }
    );
    io.observe(this.renderer.domElement);
  }

  private onPointer = (e: PointerEvent) => {
    // NDC → world on the z=0 plane (approx), relative to camera.
    const nx = (e.clientX / window.innerWidth) * 2 - 1;
    const ny = -((e.clientY / window.innerHeight) * 2 - 1);
    const h = Math.tan((this.camera.fov * Math.PI) / 360) * this.camera.position.z;
    const w = h * this.camera.aspect;
    this.mouse.x = nx * w - this.points.position.x;
    this.mouse.y = ny * h;
    this.mouse.active = true;
  };
  private onLeave = () => {
    this.mouse.active = false;
  };
  private onVisibility = () => {
    this.visible = document.visibilityState === "visible";
    this.updateRunning();
  };

  private resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  };

  private applyTheme() {
    this.colorA = cssColor("--particle", "#14203a");
    this.colorB = cssColor("--particle-accent", "#1b6ef3");
    // Additive glow reads beautifully on dark; normal blend keeps light crisp.
    const dark =
      document.documentElement.getAttribute("data-theme") === "dark";
    this.material.blending = dark ? AdditiveBlending : NormalBlending;
    this.material.opacity = dark ? 0.9 : 0.85;
    this.writeColors();
  }

  /** Called by the theme toggle. */
  setTheme() {
    this.applyTheme();
    (this.geometry.getAttribute("color") as BufferAttribute).needsUpdate = true;
    if (!this.running) this.renderer.render(this.scene, this.camera);
  }

  private writeColors() {
    const col = this.geometry.getAttribute("color") as BufferAttribute;
    const arr = col.array as Float32Array;
    for (let i = 0; i < this.count; i++) {
      // deterministic-ish blend by index for a stable two-tone gradient
      const t = (i % 97) / 97;
      const r = this.colorA.r + (this.colorB.r - this.colorA.r) * t;
      const g = this.colorA.g + (this.colorB.g - this.colorA.g) * t;
      const b = this.colorA.b + (this.colorB.b - this.colorA.b) * t;
      arr[i * 3] = r;
      arr[i * 3 + 1] = g;
      arr[i * 3 + 2] = b;
    }
    col.needsUpdate = true;
  }

  start() {
    if (prefersReducedMotion()) return; // stay static
    this.running = true;
    this.lastT = performance.now();
    this.updateRunning();
  }

  private updateRunning() {
    const shouldRun =
      this.running && this.visible && this.inView && !prefersReducedMotion();
    if (shouldRun && !this.raf) {
      this.lastT = performance.now();
      this.raf = requestAnimationFrame(this.tick);
    } else if (!shouldRun && this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
  }

  private tick = (now: number) => {
    this.raf = 0;
    const dt = Math.min((now - this.lastT) / 1000, 0.05);
    this.lastT = now;

    this.step(dt, now / 1000);
    this.renderer.render(this.scene, this.camera);
    this.monitorFps(dt);

    if (this.running && this.visible && this.inView) {
      this.raf = requestAnimationFrame(this.tick);
    }
  };

  private step(dt: number, time: number) {
    // advance morph timeline
    this.morphTimer += dt;
    if (this.morphTimer > this.holdTime) {
      this.morphTimer = 0;
      this.targetIndex = (this.targetIndex + 1) % this.shapes.length;
    }
    const target = this.shapes[this.targetIndex];
    const cur = this.current;
    const ease = 1 - Math.pow(0.0015, dt); // frame-rate independent
    const driftAmp = 0.05;
    const R = 0.5; // repulsion radius
    const R2 = R * R;

    for (let i = 0; i < this.count; i++) {
      const ix = i * 3;
      const ph = this.phase[i];
      // gentle drift around the target
      const dx = Math.sin(time * 0.6 + ph) * driftAmp;
      const dy = Math.cos(time * 0.5 + ph * 1.3) * driftAmp;
      const dz = Math.sin(time * 0.4 + ph * 0.7) * driftAmp;

      let tx = target[ix] + dx;
      let ty = target[ix + 1] + dy;
      let tz = target[ix + 2] + dz;

      cur[ix] += (tx - cur[ix]) * ease;
      cur[ix + 1] += (ty - cur[ix + 1]) * ease;
      cur[ix + 2] += (tz - cur[ix + 2]) * ease;

      // cursor repulsion (2D, on x/y)
      if (this.mouse.active) {
        const mx = cur[ix] - this.mouse.x;
        const my = cur[ix + 1] - this.mouse.y;
        const d2 = mx * mx + my * my;
        if (d2 < R2 && d2 > 0.0001) {
          const f = (1 - d2 / R2) * 0.35;
          const inv = 1 / Math.sqrt(d2);
          cur[ix] += mx * inv * f;
          cur[ix + 1] += my * inv * f;
        }
      }
    }

    (this.geometry.getAttribute("position") as BufferAttribute).needsUpdate =
      true;
    // slow, calm rotation of the whole field
    this.points.rotation.y = Math.sin(time * 0.08) * 0.25;
  }

  private monitorFps(dt: number) {
    this.fpsAccum += dt;
    this.fpsFrames++;
    this.downscaleCheck += dt;
    if (this.downscaleCheck >= 2) {
      const fps = this.fpsFrames / this.fpsAccum;
      if (fps < 45 && this.dpr > 0.85) {
        this.dpr = Math.max(0.85, this.dpr * 0.8);
        this.renderer.setPixelRatio(this.dpr);
      }
      this.fpsAccum = 0;
      this.fpsFrames = 0;
      this.downscaleCheck = 0;
    }
  }

  destroy() {
    if (this.raf) cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.resize);
    window.removeEventListener("pointermove", this.onPointer);
    window.removeEventListener("pointerleave", this.onLeave);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.geometry.dispose();
    this.material.dispose();
    this.renderer.dispose();
  }
}
