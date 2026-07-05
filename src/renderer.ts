/* ============================================================
   SceneRenderer interface + CPU points implementation.
   The scroll rig drives any renderer through this interface, so
   the GPGPU flow-field can drop in later without touching the rig.
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
import { buildScenes, SCENE_COUNT, type SceneSet } from "./scenes";

export interface SceneRenderer {
  /** morph the particles to the given section's word (scene index) */
  setScene(index: number): void;
  /** pointer in client (viewport) pixel coordinates */
  setPointer(clientX: number, clientY: number, active: boolean): void;
  /** raise field energy 0..1 (scroll velocity); decays over time */
  setEnergy(e: number): void;
  /** sustained energy boost while on a call-to-action */
  setHover(on: boolean): void;
  setTheme(): void;
  resize(): void;
  start(): void;
  stop(): void;
  dispose(): void;
}

const reduceMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isMobile = () => window.matchMedia("(max-width: 720px)").matches;


function makeSprite(): Texture {
  const s = 64;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.4, "rgba(255,255,255,0.75)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const t = new Texture(c);
  t.needsUpdate = true;
  return t;
}

function cssColor(name: string, fallback: string): Color {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return new Color(raw || fallback);
}

export class PointsRenderer implements SceneRenderer {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera: PerspectiveCamera;
  private points: Points;
  private geometry = new BufferGeometry();
  private material: PointsMaterial;

  private count: number;
  private scenes: SceneSet;
  private current: Float32Array;
  private target: Float32Array;
  private phase: Float32Array;
  private colorA = new Color();
  private colorB = new Color();

  private camZ = 4.4;
  private camZTarget = 4.4;

  private mouse = { x: 0, y: 0, active: false };
  private scrollEnergy = 0;
  private hover = 0;
  private energy = 0;
  private raf = 0;
  private lastT = 0;
  private running = false;
  private visible = true;
  private inView = true;
  private io?: IntersectionObserver;

  private dpr: number;
  private fpsAccum = 0;
  private fpsFrames = 0;
  private checkT = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.count = isMobile() ? 6000 : 12000;
    this.scenes = buildScenes(this.count);
    this.current = Float32Array.from(this.scenes.positions[0]);
    this.target = Float32Array.from(this.scenes.positions[0]);
    this.phase = new Float32Array(this.count);
    for (let i = 0; i < this.count; i++) this.phase[i] = Math.random() * Math.PI * 2;

    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: false,
      alpha: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(this.dpr);

    this.camera = new PerspectiveCamera(50, 1, 0.1, 100);
    this.camera.position.z = this.camZ;

    const posAttr = new BufferAttribute(this.current, 3);
    posAttr.setUsage(35048); // DYNAMIC_DRAW
    this.geometry.setAttribute("position", posAttr);
    this.geometry.setAttribute(
      "color",
      new BufferAttribute(new Float32Array(this.count * 3), 3)
    );

    this.material = new PointsMaterial({
      size: isMobile() ? 0.028 : 0.024,
      map: makeSprite(),
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      sizeAttenuation: true,
      opacity: 0.9,
    });
    this.points = new Points(this.geometry, this.material);
    this.scene.add(this.points);

    this.applyTheme();
    this.resize();

    if (reduceMotion()) {
      // static, legible composition (the calm orb), render once
      this.current.set(this.scenes.positions[0]);
      (this.geometry.getAttribute("position") as BufferAttribute).needsUpdate =
        true;
      this.renderer.render(this.scene, this.camera);
    }

    this.bindVisibility();
  }

  private bindVisibility() {
    document.addEventListener("visibilitychange", this.onVis);
    this.io = new IntersectionObserver(
      (e) => {
        this.inView = e[0]?.isIntersecting ?? true;
        this.updateRunning();
      },
      { threshold: 0.01 }
    );
    this.io.observe(this.renderer.domElement);
  }
  private onVis = () => {
    this.visible = document.visibilityState === "visible";
    this.updateRunning();
  };

  setScene(index: number) {
    const i = Math.max(0, Math.min(SCENE_COUNT - 1, index));
    const src = this.scenes.positions[i];
    this.target.set(src);
    this.camZTarget = this.scenes.cameraZ[i];
    if (!this.running && !reduceMotion()) this.start();
  }

  setEnergy(e: number) {
    this.scrollEnergy = Math.max(this.scrollEnergy, Math.min(1, e));
    if (!this.running && !reduceMotion()) this.start();
  }
  setHover(on: boolean) {
    this.hover = on ? 0.75 : 0;
    if (!this.running && !reduceMotion()) this.start();
  }

  setPointer(clientX: number, clientY: number, active: boolean) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const nx = r.width ? ((clientX - r.left) / r.width) * 2 - 1 : 0;
    const ny = r.height ? -(((clientY - r.top) / r.height) * 2 - 1) : 0;
    const h = Math.tan((this.camera.fov * Math.PI) / 360) * this.camera.position.z;
    const w = h * this.camera.aspect;
    this.mouse.x = nx * w;
    this.mouse.y = ny * h;
    this.mouse.active = active;
  }

  private applyTheme() {
    this.colorA = cssColor("--particle", "#14203a");
    this.colorB = cssColor("--particle-accent", "#1b6ef3");
    const dark = document.documentElement.getAttribute("data-theme") === "dark";
    this.material.blending = dark ? AdditiveBlending : NormalBlending;
    this.material.opacity = dark ? 0.92 : 0.82;
    const col = this.geometry.getAttribute("color") as BufferAttribute;
    const arr = col.array as Float32Array;
    for (let i = 0; i < this.count; i++) {
      const t = (i % 97) / 97;
      arr[i * 3] = this.colorA.r + (this.colorB.r - this.colorA.r) * t;
      arr[i * 3 + 1] = this.colorA.g + (this.colorB.g - this.colorA.g) * t;
      arr[i * 3 + 2] = this.colorA.b + (this.colorB.b - this.colorA.b) * t;
    }
    col.needsUpdate = true;
  }

  setTheme() {
    this.applyTheme();
    if (!this.running) this.renderer.render(this.scene, this.camera);
  }

  resize() {
    const el = this.renderer.domElement;
    const w = el.clientWidth || window.innerWidth;
    const h = el.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.points.position.x = w > 900 ? 1.35 : 0;
    this.points.position.y = 0.15;
  }

  start() {
    if (reduceMotion()) return;
    this.running = true;
    this.updateRunning();
  }
  stop() {
    this.running = false;
    this.updateRunning();
  }

  private updateRunning() {
    const go = this.running && this.visible && this.inView && !reduceMotion();
    if (go && !this.raf) {
      this.lastT = performance.now();
      this.raf = requestAnimationFrame(this.tick);
    } else if (!go && this.raf) {
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
    this.monitor(dt);
    if (this.running && this.visible && this.inView)
      this.raf = requestAnimationFrame(this.tick);
  };

  private step(dt: number, time: number) {
    const cur = this.current;
    const tgt = this.target;
    const ease = 1 - Math.pow(0.002, dt);
    // energy: scroll pulse decays, hover sustains; scales the idle drift
    this.scrollEnergy *= Math.exp(-dt * 2.6);
    const targetE = Math.max(this.scrollEnergy, this.hover);
    this.energy += (targetE - this.energy) * (1 - Math.pow(0.02, dt));
    const drift = 0.02 + this.energy * 0.06;
    const R = 0.5;
    const R2 = R * R;
    for (let i = 0; i < this.count; i++) {
      const ix = i * 3;
      const ph = this.phase[i];
      const dx = Math.sin(time * 0.5 + ph) * drift;
      const dy = Math.cos(time * 0.42 + ph * 1.3) * drift;
      const dz = Math.sin(time * 0.35 + ph * 0.7) * drift;
      cur[ix] += (tgt[ix] + dx - cur[ix]) * ease;
      cur[ix + 1] += (tgt[ix + 1] + dy - cur[ix + 1]) * ease;
      cur[ix + 2] += (tgt[ix + 2] + dz - cur[ix + 2]) * ease;
      if (this.mouse.active) {
        const mx = cur[ix] - this.mouse.x + this.points.position.x;
        const my = cur[ix + 1] - this.mouse.y;
        const d2 = mx * mx + my * my;
        if (d2 < R2 && d2 > 1e-4) {
          const f = (1 - d2 / R2) * 0.3;
          const inv = 1 / Math.sqrt(d2);
          cur[ix] += mx * inv * f;
          cur[ix + 1] += my * inv * f;
        }
      }
    }
    (this.geometry.getAttribute("position") as BufferAttribute).needsUpdate = true;
    this.camZ += (this.camZTarget - this.camZ) * (1 - Math.pow(0.01, dt));
    this.camera.position.z = this.camZ;
    this.points.rotation.y = Math.sin(time * 0.06) * 0.18;
  }

  private monitor(dt: number) {
    this.fpsAccum += dt;
    this.fpsFrames++;
    this.checkT += dt;
    if (this.checkT >= 2) {
      const fps = this.fpsFrames / this.fpsAccum;
      if (fps < 45 && this.dpr > 0.85) {
        this.dpr = Math.max(0.85, this.dpr * 0.8);
        this.renderer.setPixelRatio(this.dpr);
      }
      this.fpsAccum = 0;
      this.fpsFrames = 0;
      this.checkT = 0;
    }
  }

  dispose() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.io?.disconnect();
    document.removeEventListener("visibilitychange", this.onVis);
    this.geometry.dispose();
    this.material.dispose();
    this.renderer.dispose();
  }
}
