/* ============================================================
   Shape generators — each returns a Float32Array (count * 3) of
   target positions, centered on the origin, scaled to a similar
   bounding box (~radius 1.4). The particle system tweens between
   these to create the morph: N-rune → globe → app grid → dissolve.
   ============================================================ */

const TAU = Math.PI * 2;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** A bold "N" letterform (nods to Nord), built from three strokes. */
export function makeLetterN(count: number): Float32Array {
  const pos = new Float32Array(count * 3);
  const H = 1.3; // half-height
  const W = 0.85; // half-width
  const thickness = 0.09;

  // Three strokes: left bar, diagonal, right bar. Weight by length.
  const diagLen = Math.hypot(2 * W, 2 * H);
  const barLen = 2 * H;
  const total = barLen * 2 + diagLen;
  const nLeft = Math.floor((barLen / total) * count);
  const nDiag = Math.floor((diagLen / total) * count);
  const nRight = count - nLeft - nDiag;

  let i = 0;
  const put = (x: number, y: number) => {
    pos[i * 3] = x + (Math.random() - 0.5) * thickness;
    pos[i * 3 + 1] = y + (Math.random() - 0.5) * thickness;
    pos[i * 3 + 2] = (Math.random() - 0.5) * thickness;
    i++;
  };

  for (let k = 0; k < nLeft; k++) put(-W, lerp(-H, H, k / nLeft));
  for (let k = 0; k < nDiag; k++) {
    const t = k / nDiag;
    put(lerp(-W, W, t), lerp(H, -H, t));
  }
  for (let k = 0; k < nRight; k++) put(W, lerp(-H, H, k / nRight));

  return pos;
}

/** A globe / network sphere via the Fibonacci sphere distribution. */
export function makeGlobe(count: number): Float32Array {
  const pos = new Float32Array(count * 3);
  const r = 1.25;
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let k = 0; k < count; k++) {
    const y = 1 - (k / (count - 1)) * 2; // 1 → -1
    const radius = Math.sqrt(1 - y * y);
    const theta = golden * k;
    pos[k * 3] = Math.cos(theta) * radius * r;
    pos[k * 3 + 1] = y * r;
    pos[k * 3 + 2] = Math.sin(theta) * radius * r;
  }
  return pos;
}

/** An iOS-style home-screen grid of rounded "app" squares. */
export function makeAppGrid(count: number): Float32Array {
  const pos = new Float32Array(count * 3);
  const cols = 4;
  const rows = 5;
  const icons = cols * rows;
  const gap = 0.62;
  const icon = 0.42; // half-size of an icon
  const originX = -((cols - 1) * gap) / 2;
  const originY = ((rows - 1) * gap) / 2;
  const per = Math.floor(count / icons);

  let i = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = originX + c * gap;
      const cy = originY - r * gap;
      const n = i + per <= count ? per : count - i;
      for (let k = 0; k < n; k++) {
        // rounded-square fill: sample square, push corners inward
        let x = (Math.random() * 2 - 1) * icon;
        let y = (Math.random() * 2 - 1) * icon;
        const corner = 0.72 * icon;
        if (Math.abs(x) > corner && Math.abs(y) > corner) {
          x *= 0.82;
          y *= 0.82;
        }
        pos[i * 3] = cx + x;
        pos[i * 3 + 1] = cy + y;
        pos[i * 3 + 2] = (Math.random() - 0.5) * 0.04;
        i++;
      }
    }
  }
  // fill any remainder
  while (i < count) {
    pos[i * 3] = (Math.random() * 2 - 1) * 1.2;
    pos[i * 3 + 1] = (Math.random() * 2 - 1) * 1.4;
    pos[i * 3 + 2] = 0;
    i++;
  }
  return pos;
}

/** A soft dissolved cloud — the rest/transition state. */
export function makeCloud(count: number): Float32Array {
  const pos = new Float32Array(count * 3);
  for (let k = 0; k < count; k++) {
    const r = 1.3 * Math.cbrt(Math.random());
    const theta = Math.random() * TAU;
    const phi = Math.acos(Math.random() * 2 - 1);
    pos[k * 3] = r * Math.sin(phi) * Math.cos(theta);
    pos[k * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 1.05;
    pos[k * 3 + 2] = r * Math.cos(phi);
  }
  return pos;
}

export function makeShapes(count: number): Float32Array[] {
  return [
    makeLetterN(count),
    makeGlobe(count),
    makeAppGrid(count),
    makeCloud(count),
  ];
}
