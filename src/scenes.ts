/* ============================================================
   Scene target generators for the scroll story.
   Abstract / brand visual language (aurora, brand mark,
   constellation, terrain). Each returns Float32Array(count*3)
   centered on origin. The renderer lerps between consecutive
   scenes as global scroll progress advances.

   Scene order (keyframes):
     0 Hero      → brand mark (calm orb)
     1 Belief    → aurora band (flowing curtain)
     2 Services  → constellation (nodes)
     3 0 → 1     → terrain (flowing plane)
     4 Contact   → brand mark at rest (orb)
   ============================================================ */

const TAU = Math.PI * 2;

function rand(a: number, b: number) {
  return a + Math.random() * (b - a);
}

/** Calm brand mark — a Fibonacci sphere (orb). */
export function orb(count: number): Float32Array {
  const p = new Float32Array(count * 3);
  const r = 1.15;
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const rad = Math.sqrt(1 - y * y);
    const th = golden * i;
    p[i * 3] = Math.cos(th) * rad * r;
    p[i * 3 + 1] = y * r;
    p[i * 3 + 2] = Math.sin(th) * rad * r;
  }
  return p;
}

/** Aurora curtain — vertical filaments waving across a wide band. */
export function aurora(count: number): Float32Array {
  const p = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const x = rand(-2.3, 2.3);
    const wave = Math.sin(x * 1.6) * 0.35 + Math.sin(x * 3.1) * 0.12;
    // vertical filament: cluster around a waving baseline
    const y = wave + rand(-0.9, 0.9) * (0.6 + 0.4 * Math.random());
    const z = rand(-0.8, 0.8);
    p[i * 3] = x;
    p[i * 3 + 1] = y;
    p[i * 3 + 2] = z;
  }
  return p;
}

/** Constellation — a wide scattered field with a few bright clusters. */
export function constellation(count: number): Float32Array {
  const p = new Float32Array(count * 3);
  const nodes = [
    [-1.9, 0.7],
    [-0.9, -0.6],
    [0.2, 0.5],
    [1.2, -0.4],
    [2.0, 0.6],
  ];
  for (let i = 0; i < count; i++) {
    if (i % 3 === 0) {
      // clustered near a node
      const n = nodes[i % nodes.length];
      p[i * 3] = n[0] + rand(-0.28, 0.28);
      p[i * 3 + 1] = n[1] + rand(-0.28, 0.28);
      p[i * 3 + 2] = rand(-0.4, 0.4);
    } else {
      // sparse background field
      p[i * 3] = rand(-2.5, 2.5);
      p[i * 3 + 1] = rand(-1.5, 1.5);
      p[i * 3 + 2] = rand(-0.9, 0.9);
    }
  }
  return p;
}

/** Flowing terrain — a tilted plane with layered wave height. */
export function terrain(count: number): Float32Array {
  const p = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const x = rand(-2.6, 2.6);
    const z = rand(-2.2, 1.4);
    const h =
      Math.sin(x * 1.3 + z * 0.7) * 0.3 +
      Math.sin(x * 2.7 - z * 1.1) * 0.12 +
      z * 0.35; // gentle tilt toward viewer
    p[i * 3] = x;
    p[i * 3 + 1] = h - 0.3;
    p[i * 3 + 2] = z;
  }
  return p;
}

export interface SceneSet {
  positions: Float32Array[];
  /** camera z distance per scene (subtle dolly) */
  cameraZ: number[];
}

export function buildScenes(count: number): SceneSet {
  return {
    positions: [
      orb(count),
      aurora(count),
      constellation(count),
      terrain(count),
      orb(count),
    ],
    cameraZ: [4.4, 4.0, 4.8, 4.2, 4.5],
  };
}

export const SCENE_COUNT = 5;
export { TAU };
