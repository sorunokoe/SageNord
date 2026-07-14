/* ============================================================
   Scene target generators for the scroll story.
   Abstract / brand visual language, one distinct form per chapter:
     0 Hero      → airy volumetric orb (brand mark)
     1 Belief    → layered aurora curtain
     2 Services  → spiral (structure / craft)
     3 0 → 1     → flowing terrain (idea → form)
     4 Contact   → calm orb (return, at rest)
   Each returns Float32Array(count*3) centered on the origin,
   scaled to a comparable bounding box so morphs stay balanced.
   ============================================================ */

const TAU = Math.PI * 2;

function rand(a: number, b: number) {
  return a + Math.random() * (b - a);
}

/** Airy volumetric orb — a soft-edged glowing sphere (not a hard shell). */
export function orb(count: number): Float32Array {
  const p = new Float32Array(count * 3);
  const R = 1.2;
  for (let i = 0; i < count; i++) {
    // uniform direction on the sphere
    const u = Math.random() * 2 - 1;
    const th = Math.random() * TAU;
    const s = Math.sqrt(1 - u * u);
    // radius biased toward the surface but with soft inward falloff → airy
    const r = R * (1 - Math.pow(Math.random(), 2.2) * 0.5);
    p[i * 3] = s * Math.cos(th) * r;
    p[i * 3 + 1] = u * r;
    p[i * 3 + 2] = s * Math.sin(th) * r;
  }
  return p;
}

/** Layered aurora curtain — waving vertical filaments in a few depth layers. */
export function aurora(count: number): Float32Array {
  const p = new Float32Array(count * 3);
  const layers = 5;
  const cols = 70; // filament columns per layer
  for (let i = 0; i < count; i++) {
    const layer = i % layers;
    const z = (layer / (layers - 1) - 0.5) * 1.3;
    const phase = layer * 1.7;
    const col = Math.floor(Math.random() * cols);
    const cx = (col / (cols - 1)) * 4.4 - 2.2; // column center across width
    const baseline = Math.sin(cx * 1.2 + phase) * 0.32 + Math.sin(cx * 2.7) * 0.1;
    // vertical filament: dense at the base, thinning upward (pow biases low)
    const up = Math.pow(Math.random(), 0.55) * 1.9;
    p[i * 3] = cx + rand(-0.012, 0.012);
    p[i * 3 + 1] = baseline - 0.55 + up;
    p[i * 3 + 2] = z + rand(-0.05, 0.05);
  }
  return p;
}

/** Spiral — a multi-arm logarithmic spiral disk with a bright core. */
export function spiral(count: number): Float32Array {
  const p = new Float32Array(count * 3);
  const arms = 3;
  const turns = 1.15;
  const R = 1.7;
  for (let i = 0; i < count; i++) {
    if (i % 9 === 0) {
      // core concentration
      const u = Math.random() * 2 - 1;
      const th = Math.random() * TAU;
      const s = Math.sqrt(1 - u * u);
      const r = 0.28 * Math.pow(Math.random(), 0.5);
      p[i * 3] = s * Math.cos(th) * r;
      p[i * 3 + 1] = u * r * 0.6;
      p[i * 3 + 2] = s * Math.sin(th) * r;
      continue;
    }
    const t = Math.pow(Math.random(), 0.7); // more density inward
    const arm = i % arms;
    const spread = (1 - t) * 0.5 + 0.04; // arms tighten outward
    const angle =
      t * turns * TAU + (arm * TAU) / arms + rand(-spread, spread);
    const radius = t * R;
    p[i * 3] = Math.cos(angle) * radius;
    p[i * 3 + 1] = Math.sin(angle) * radius * 0.9;
    p[i * 3 + 2] = rand(-0.12, 0.12) * (0.3 + t);
  }
  return p;
}

/** Flowing terrain — a smooth layered wave sheet, gently tilted. */
export function terrain(count: number): Float32Array {
  const p = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const x = rand(-2.6, 2.6);
    const z = rand(-2.0, 1.4);
    const h =
      Math.sin(x * 1.1 + z * 0.6) * 0.26 +
      Math.sin(x * 0.5 - z * 1.3) * 0.16 +
      z * 0.32; // gentle tilt toward the viewer
    p[i * 3] = x;
    p[i * 3 + 1] = h - 0.35;
    p[i * 3 + 2] = z;
  }
  return p;
}

export interface SceneSet {
  positions: Float32Array[];
  cameraZ: number[];
}

export function buildScenes(count: number): SceneSet {
  return {
    positions: [
      orb(count),
      aurora(count),
      spiral(count),
      terrain(count),
      orb(count),
    ],
    cameraZ: [4.4, 4.2, 4.6, 4.4, 4.4],
  };
}

export const SCENE_COUNT = 5;
export { TAU };
