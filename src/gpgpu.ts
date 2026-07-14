/* ============================================================
   FlowFieldRenderer — GPGPU/FBO particle flow field.
   Positions live in a float texture, updated each frame by a
   simulation shader: curl-noise flow + attraction toward the
   blended scene target (reusing the CPU scene generators as
   target textures). Implements the same SceneRenderer interface
   as the CPU renderer, so the scroll rig is unchanged.
   ============================================================ */

import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DataTexture,
  FloatType,
  NormalBlending,
  PerspectiveCamera,
  Points,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  Vector3,
  WebGLRenderer,
} from "three";
import { GPUComputationRenderer } from "three/examples/jsm/misc/GPUComputationRenderer.js";
import { buildScenes, SCENE_COUNT } from "./scenes";
import type { SceneRenderer } from "./renderer";

const reduceMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function smoothstep(t: number) {
  return t * t * (3 - 2 * t);
}
function cssColor(name: string, fb: string) {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return new Color(raw || fb);
}

const NOISE_GLSL = /* glsl */ `
vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x,289.0);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0,0.5,1.0,2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + 1.0 * C.xxx;
  vec3 x2 = x0 - i2 + 2.0 * C.xxx;
  vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;
  i = mod(i, 289.0);
  vec4 p = permute(permute(permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 1.0/7.0;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z *ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
  vec3 p0 = vec3(a0.xy,h.x);
  vec3 p1 = vec3(a0.zw,h.y);
  vec3 p2 = vec3(a1.xy,h.z);
  vec3 p3 = vec3(a1.zw,h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}
vec3 snoiseVec3(vec3 x){
  return vec3(snoise(x),
              snoise(vec3(x.y - 19.1, x.z + 33.4, x.x + 47.2)),
              snoise(vec3(x.z + 74.2, x.x - 124.5, x.y + 99.4)));
}
vec3 curlNoise(vec3 p){
  const float e = 0.1;
  vec3 dx = vec3(e, 0.0, 0.0);
  vec3 dy = vec3(0.0, e, 0.0);
  vec3 dz = vec3(0.0, 0.0, e);
  vec3 p_x0 = snoiseVec3(p - dx); vec3 p_x1 = snoiseVec3(p + dx);
  vec3 p_y0 = snoiseVec3(p - dy); vec3 p_y1 = snoiseVec3(p + dy);
  vec3 p_z0 = snoiseVec3(p - dz); vec3 p_z1 = snoiseVec3(p + dz);
  float x = (p_y1.z - p_y0.z) - (p_z1.y - p_z0.y);
  float y = (p_z1.x - p_z0.x) - (p_x1.z - p_x0.z);
  float z = (p_x1.y - p_x0.y) - (p_y1.x - p_y0.x);
  return normalize(vec3(x, y, z) / (2.0 * e));
}
`;

const SIM_FRAG = /* glsl */ `
uniform sampler2D uSceneA;
uniform sampler2D uSceneB;
uniform float uBlend;
uniform float uTime;
uniform float uDelta;
uniform vec3 uMouse;
uniform float uMouseActive;
uniform float uEnergy;
${NOISE_GLSL}
void main(){
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec3 pos = texture2D(texturePosition, uv).xyz;
  vec3 target = mix(texture2D(uSceneA, uv).xyz, texture2D(uSceneB, uv).xyz, uBlend);

  vec3 toTarget = target - pos;
  vec3 flow = curlNoise(pos * 0.45 + vec3(0.0, 0.0, uTime * 0.06));

  // attraction eases toward target; flow scales with energy so the form is
  // crisp at rest (reading) and disperses/flows while scrolling or at the CTA.
  vec3 vel = toTarget * 2.6 + flow * (0.05 + uEnergy * 0.42);

  if (uMouseActive > 0.5){
    vec3 d = pos - uMouse;
    float dist = length(d.xy);
    if (dist < 0.55 && dist > 0.001){
      vel += normalize(vec3(d.xy, 0.0)) * (0.55 - dist) * 6.0;
    }
  }

  pos += vel * uDelta;
  gl_FragColor = vec4(pos, 1.0);
}
`;

const RENDER_VERT = /* glsl */ `
uniform sampler2D uPosition;
uniform float uSize;
attribute vec2 ref;
attribute float aRand;
varying float vRand;
varying float vNdcX;
varying float vNdcY;
void main(){
  vec3 pos = texture2D(uPosition, ref).xyz;
  vRand = aRand;
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_PointSize = uSize * (320.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
  vNdcX = gl_Position.x / gl_Position.w;
  vNdcY = gl_Position.y / gl_Position.w;
}
`;

const RENDER_FRAG = /* glsl */ `
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uOpacity;
uniform float uBrightness;
uniform float uFadeStart; // NDC x where particles begin (left = text side)
uniform float uFadeEnd;   // NDC x where particles reach full density
varying float vRand;
varying float vNdcX;
varying float vNdcY;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.05, d);
  vec3 col = mix(uColorA, uColorB, vRand);
  // Soft falloff across the reading side + gentle top/bottom vignette so the
  // field dissolves into the page instead of ending at a hard canvas edge.
  float sideFade = smoothstep(uFadeStart, uFadeEnd, vNdcX);
  float vignette = smoothstep(1.25, 0.7, abs(vNdcY));
  float mask = sideFade * vignette;
  if (mask < 0.01) discard;
  gl_FragColor = vec4(col * uBrightness, a * uOpacity * uBrightness * mask);
}
`;

export class FlowFieldRenderer implements SceneRenderer {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera: PerspectiveCamera;
  private points: Points;
  private material: ShaderMaterial;

  private gpu: GPUComputationRenderer;
  private posVar: ReturnType<GPUComputationRenderer["addVariable"]>;
  private sceneTex: DataTexture[] = [];

  private readonly W: number;
  private readonly H: number;
  private count: number;

  private camZ = 4.4;
  private camZTarget = 4.4;
  private mouse = new Vector3();
  private mouseActive = 0;
  private scrollEnergy = 0; // decays; raised by scroll velocity
  private hover = 0; // sustained boost while hovering the CTA
  private energy = 0; // eased actual value fed to shaders
  private paX = 0; // parallax target (pointer)
  private paY = 0;
  private camX = 0;
  private camY = 0;

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
    this.W = 512;
    this.H = 256; // 131,072 particles
    this.count = this.W * this.H;

    this.renderer = new WebGLRenderer({
      canvas,
      antialias: false,
      alpha: true,
      powerPreference: "high-performance",
    });
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(this.dpr);

    // float textures are required for GPGPU
    if (!this.renderer.capabilities.isWebGL2) {
      const ext = this.renderer.getContext().getExtension("OES_texture_float");
      if (!ext) throw new Error("float textures unsupported");
    }

    this.camera = new PerspectiveCamera(50, 1, 0.1, 100);
    this.camera.position.z = this.camZ;

    // ---- GPGPU setup ----
    this.gpu = new GPUComputationRenderer(this.W, this.H, this.renderer);
    const dtPos = this.gpu.createTexture();
    const scenes = buildScenes(this.count);
    this.fillTexture(dtPos, scenes.positions[0]);
    this.sceneTex = scenes.positions.map((p) => this.makeSceneTexture(p));
    this.cameraZ = scenes.cameraZ;

    this.posVar = this.gpu.addVariable("texturePosition", SIM_FRAG, dtPos);
    this.gpu.setVariableDependencies(this.posVar, [this.posVar]);
    Object.assign(this.posVar.material.uniforms, {
      uSceneA: { value: this.sceneTex[0] },
      uSceneB: { value: this.sceneTex[1] },
      uBlend: { value: 0 },
      uTime: { value: 0 },
      uDelta: { value: 0.016 },
      uMouse: { value: this.mouse },
      uMouseActive: { value: 0 },
      uEnergy: { value: 0 },
    });
    const err = this.gpu.init();
    if (err) throw new Error("GPGPU init failed: " + err);

    // ---- render points ----
    const geo = new BufferGeometry();
    const refs = new Float32Array(this.count * 2);
    const rand = new Float32Array(this.count);
    for (let i = 0; i < this.count; i++) {
      refs[i * 2] = (i % this.W) / this.W;
      refs[i * 2 + 1] = Math.floor(i / this.W) / this.H;
      rand[i] = (i % 97) / 97;
    }
    geo.setAttribute("position", new BufferAttribute(new Float32Array(this.count * 3), 3));
    geo.setAttribute("ref", new BufferAttribute(refs, 2));
    geo.setAttribute("aRand", new BufferAttribute(rand, 1));
    geo.setDrawRange(0, this.count);

    this.material = new ShaderMaterial({
      uniforms: {
        uPosition: { value: null },
        uSize: { value: 0.042 * Math.min(window.devicePixelRatio || 1, 2) },
        uColorA: { value: new Color() },
        uColorB: { value: new Color() },
        uOpacity: { value: 0.85 },
        uBrightness: { value: 1 },
        uFadeStart: { value: -0.15 },
        uFadeEnd: { value: 0.5 },
      },
      vertexShader: RENDER_VERT,
      fragmentShader: RENDER_FRAG,
      transparent: true,
      depthWrite: false,
    });
    this.points = new Points(geo, this.material);
    this.points.frustumCulled = false;
    this.scene.add(this.points);

    this.applyTheme();
    this.resize();

    if (reduceMotion()) {
      // Defensive only: main.ts routes reduced-motion to PointsRenderer, so
      // this path is normally unreachable. Kept in case GPGPU is constructed
      // directly. Single static settle render (compute a few steps → orb).
      for (let i = 0; i < 60; i++) this.gpu.compute();
      this.material.uniforms.uPosition.value =
        this.gpu.getCurrentRenderTarget(this.posVar).texture;
      this.renderer.render(this.scene, this.camera);
    }

    this.bindVisibility();
  }

  private cameraZ: number[] = [];

  private fillTexture(tex: DataTexture, positions: Float32Array) {
    const data = tex.image.data as unknown as Float32Array;
    for (let i = 0; i < this.count; i++) {
      data[i * 4] = positions[i * 3];
      data[i * 4 + 1] = positions[i * 3 + 1];
      data[i * 4 + 2] = positions[i * 3 + 2];
      data[i * 4 + 3] = 1;
    }
  }

  private makeSceneTexture(positions: Float32Array): DataTexture {
    const data = new Float32Array(this.count * 4);
    for (let i = 0; i < this.count; i++) {
      data[i * 4] = positions[i * 3];
      data[i * 4 + 1] = positions[i * 3 + 1];
      data[i * 4 + 2] = positions[i * 3 + 2];
      data[i * 4 + 3] = 1;
    }
    const tex = new DataTexture(data, this.W, this.H, RGBAFormat, FloatType);
    tex.needsUpdate = true;
    return tex;
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

  setProgress(t: number) {
    const p = Math.max(0, Math.min(1, t));
    const seg = p * (SCENE_COUNT - 1);
    const i = Math.min(SCENE_COUNT - 2, Math.floor(seg));
    const f = smoothstep(seg - i);
    const u = this.posVar.material.uniforms;
    u.uSceneA.value = this.sceneTex[i];
    u.uSceneB.value = this.sceneTex[i + 1];
    u.uBlend.value = f;
    this.camZTarget = this.cameraZ[i] + (this.cameraZ[i + 1] - this.cameraZ[i]) * f;
    if (!this.running && !reduceMotion()) this.start();
  }

  /** Raise field energy (0..1) — from scroll velocity. Decays over time. */
  setEnergy(e: number) {
    this.scrollEnergy = Math.max(this.scrollEnergy, Math.min(1, e));
    if (!this.running && !reduceMotion()) this.start();
  }
  /** Sustained boost while the visitor is on a call-to-action. */
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
    this.mouse.set(nx * w - this.points.position.x, ny * h, 0);
    this.mouseActive = active ? 1 : 0;
    // parallax target (subtle camera drift toward the pointer, for depth)
    this.paX = active ? nx : 0;
    this.paY = active ? ny : 0;
  }

  private applyTheme() {
    const dark = document.documentElement.getAttribute("data-theme") === "dark";
    this.material.uniforms.uColorA.value = cssColor("--particle", "#17231b");
    this.material.uniforms.uColorB.value = cssColor("--particle-accent", "#2f6b46");
    // Additive in dark accumulates; keep per-particle opacity low so dense
    // regions glow rather than clip to white.
    this.material.uniforms.uOpacity.value = dark ? 0.55 : 0.72;
    this.material.blending = dark ? AdditiveBlending : NormalBlending;
    this.material.needsUpdate = true;
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
    // Bias the form into the open right-hand space; the shader fade dissolves
    // any strays over the left-hand copy. Centered on narrow screens.
    this.points.position.x = w > 900 ? 1.4 : 0;
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
    // energy: scroll pulse decays; hover sustains; eased for smoothness
    this.scrollEnergy *= Math.exp(-dt * 2.6);
    const targetE = Math.max(this.scrollEnergy, this.hover);
    this.energy += (targetE - this.energy) * (1 - Math.pow(0.02, dt));

    const u = this.posVar.material.uniforms;
    u.uTime.value = now / 1000;
    u.uDelta.value = dt;
    u.uMouse.value = this.mouse;
    u.uMouseActive.value = this.mouseActive;
    u.uEnergy.value = this.energy;
    this.material.uniforms.uBrightness.value = 1 + this.energy * 0.45;
    this.gpu.compute();
    this.material.uniforms.uPosition.value =
      this.gpu.getCurrentRenderTarget(this.posVar).texture;
    this.camZ += (this.camZTarget - this.camZ) * (1 - Math.pow(0.01, dt));
    // parallax: camera drifts subtly toward the pointer for depth
    const pk = 1 - Math.pow(0.02, dt);
    this.camX += (this.paX * 0.35 - this.camX) * pk;
    this.camY += (this.paY * 0.25 - this.camY) * pk;
    this.camera.position.set(this.camX, this.camY, this.camZ);
    this.points.rotation.y = Math.sin((now / 1000) * 0.05) * 0.16;
    this.renderer.render(this.scene, this.camera);
    this.monitor(dt);
    if (this.running && this.visible && this.inView)
      this.raf = requestAnimationFrame(this.tick);
  };

  /** Downscale pixel ratio on sustained low fps (fill-rate escape hatch). */
  private monitor(dt: number) {
    this.fpsAccum += dt;
    this.fpsFrames++;
    this.checkT += dt;
    if (this.checkT >= 2) {
      const fps = this.fpsFrames / this.fpsAccum;
      if (fps < 45 && this.dpr > 0.8) {
        this.dpr = Math.max(0.8, this.dpr * 0.8);
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
    this.sceneTex.forEach((t) => t.dispose());
    this.gpu.dispose();
    this.material.dispose();
    this.renderer.dispose();
  }
}
