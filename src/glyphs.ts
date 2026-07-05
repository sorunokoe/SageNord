/* ============================================================
   Text / glyph → particle targets.
   Rasterizes words (or a symbol) to an offscreen canvas, samples
   the opaque pixels, and maps them into world-space particle
   target positions. The flow-field then morphs between these, so
   the particles literally form the site's headlines and marks.
   ============================================================ */

export interface GlyphSpec {
  lines: string[];
  weight?: number;
  worldWidth?: number; // desired width in world units
  spread?: number; // z depth jitter
}

const FONT_STACK =
  '"SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif';

/** Sample a word/phrase (or glyph) into `count` particle positions. */
export function sampleGlyph(count: number, spec: GlyphSpec): Float32Array {
  const { lines, weight = 700, worldWidth = 4.4, spread = 0.06 } = spec;
  const CW = 1024;
  const CH = 512;
  const out = new Float32Array(count * 3);

  const canvas = document.createElement("canvas");
  canvas.width = CW;
  canvas.height = CH;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return out;

  ctx.clearRect(0, 0, CW, CH);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const lineH = 1.04;
  let fontSize = 260;
  const measure = () => {
    ctx.font = `${weight} ${fontSize}px ${FONT_STACK}`;
    let maxW = 0;
    for (const ln of lines) maxW = Math.max(maxW, ctx.measureText(ln).width);
    return { maxW, totalH: lines.length * fontSize * lineH };
  };
  for (let k = 0; k < 60; k++) {
    const { maxW, totalH } = measure();
    if (maxW <= CW * 0.9 && totalH <= CH * 0.9) break;
    fontSize *= 0.92;
  }
  ctx.font = `${weight} ${fontSize}px ${FONT_STACK}`;
  const totalH = lines.length * fontSize * lineH;
  let y = CH / 2 - totalH / 2 + (fontSize * lineH) / 2;
  for (const ln of lines) {
    ctx.fillText(ln, CW / 2, y);
    y += fontSize * lineH;
  }

  const data = ctx.getImageData(0, 0, CW, CH).data;
  const pts: number[] = [];
  const step = 2;
  for (let py = 0; py < CH; py += step) {
    for (let px = 0; px < CW; px += step) {
      if (data[(py * CW + px) * 4 + 3] > 128) pts.push(px, py);
    }
  }
  const M = pts.length / 2;
  const scale = worldWidth / CW;
  if (M === 0) {
    // fallback: soft cloud so we never render an empty scene
    for (let i = 0; i < count; i++) {
      out[i * 3] = (Math.random() * 2 - 1) * 1.2;
      out[i * 3 + 1] = (Math.random() * 2 - 1) * 0.8;
      out[i * 3 + 2] = (Math.random() * 2 - 1) * 0.4;
    }
    return out;
  }
  // shuffle sample order once so density is even when count != M
  for (let i = M - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const ax = pts[i * 2], ay = pts[i * 2 + 1];
    pts[i * 2] = pts[j * 2]; pts[i * 2 + 1] = pts[j * 2 + 1];
    pts[j * 2] = ax; pts[j * 2 + 1] = ay;
  }
  for (let i = 0; i < count; i++) {
    const s = i % M;
    const px = pts[s * 2];
    const py = pts[s * 2 + 1];
    out[i * 3] = (px - CW / 2) * scale + (Math.random() - 0.5) * 0.014;
    out[i * 3 + 1] = -(py - CH / 2) * scale + (Math.random() - 0.5) * 0.014;
    out[i * 3 + 2] = (Math.random() - 0.5) * spread;
  }
  return out;
}
