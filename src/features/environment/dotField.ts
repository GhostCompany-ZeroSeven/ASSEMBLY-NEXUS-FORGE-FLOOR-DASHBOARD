/**
 * NEXUS AMBIENT DOT FIELD: the C5 Manager dot-field mechanism, recovered by
 * C5-MANAGER-ASSEMBLY-NEXUS-VISUAL-SIGNATURE-FORENSIC-01 and adapted here.
 *
 * NOT a particle system. A fixed lattice of tiny dots whose positions never
 * change: dot (col, row) is ALWAYS at (col × 34, row × 34). The pointer moves
 * nothing; it acts like a flashlight over glitter set in asphalt, changing
 * only each dot's radius, opacity and blur from its CURRENT distance to the
 * pointer. No velocity, history, smoothing, randomness, trail or physics.
 *
 * Colour is environmental only and carries no meaning.
 */

export type FieldMode = 'off' | 'full' | 'reduced';

/* Locked reference values. */
export const SPACING = 34;
export const INFLUENCE_RADIUS = 150;
export const COLOR_CYCLE_MS = 8000;
export const REST_RADIUS = 1.0;
export const REST_ALPHA = 1.0;

/** Palette tokens in reference order: UV, LIME, CYAN (colour index 0, 1, 2). */
export const PALETTE_TOKENS = ['--nx-field-uv', '--nx-field-lime', '--nx-field-cyan'] as const;
export const REST_TOKEN = '--nx-field-rest';
/** Reference values (used when a theme does not provide the tokens). */
export const REFERENCE_PALETTE = ['#b14cff', '#9dff3c', '#3ce6ff'] as const;
export const REFERENCE_REST = '#161b26';

/**
 * Pointer exit (Forge Floor hardening; C5 had no exit handling): the lit
 * dots dim in place at the last pointer position over this short time, then
 * the field is exactly at rest. Nothing moves; reduced motion skips the fade.
 */
export const EXIT_FADE_MS = 180;

/** The same lit dots with their proximity scaled by `f` in [0, 1] (exit fade). */
export function dimmed(lit: readonly LitDot[], f: number): LitDot[] {
  const q = Math.min(1, Math.max(0, f));
  return lit.map((d) => ({ ...d, k: d.k * q }));
}

/** Columns and rows, iterated inclusively (0..cols, 0..rows) so no edge is bald. */
export function latticeSize(width: number, height: number): { cols: number; rows: number } {
  return {
    cols: Math.ceil(Math.max(0, width) / SPACING),
    rows: Math.ceil(Math.max(0, height) / SPACING),
  };
}

/** Dot position. A pure function of its indices: nothing can move it. */
export function dotPosition(col: number, row: number): readonly [number, number] {
  return [col * SPACING, row * SPACING];
}

/** Number of dots in the inclusive lattice. */
export function latticeCount(width: number, height: number): number {
  const { cols, rows } = latticeSize(width, height);
  return (cols + 1) * (rows + 1);
}

/** Proximity factor: 0 beyond the radius, 1 at the pointer. Distance only. */
export function proximity(d: number): number {
  return d > INFLUENCE_RADIUS ? 0 : 1 - d / INFLUENCE_RADIUS;
}

export interface LitStyle {
  glowRadius: number;
  glowAlpha: number;
  /** Gaussian standard deviation of the glow blur (Flutter MaskFilter sigma). */
  blurSigma: number;
  coreRadius: number;
  coreAlpha: number;
}

/** The locked lit-dot response for k in [0, 1]. */
export function litStyle(k: number): LitStyle {
  const q = Math.min(1, Math.max(0, k));
  return {
    glowRadius: 1.5 + 3.5 * q,
    glowAlpha: 0.9 * q,
    blurSigma: 6.0 * q,
    coreRadius: 1.0 + 1.6 * q,
    coreAlpha: 0.25 + 0.75 * q,
  };
}

/** Colour-cycle time t in [0, 1): linear over 8 s, repeating. */
export function cycleT(nowMs: number): number {
  return (((nowMs % COLOR_CYCLE_MS) + COLOR_CYCLE_MS) % COLOR_CYCLE_MS) / COLOR_CYCLE_MS;
}

/** Deterministic diagonal colour bands; snaps between colours (no lerp). */
export function colorIndex(col: number, row: number, t: number): number {
  const phase = ((((col * 3 + row * 5) / 8 + t) % 1) + 1) % 1;
  return Math.floor(phase * 3) % 3;
}

export interface LitDot {
  col: number;
  row: number;
  k: number;
}

/**
 * The dots inside the influence disc of the CURRENT pointer position (and
 * nothing else). Only a bounding box of the lattice is visited.
 */
export function litDots(width: number, height: number, px: number, py: number): LitDot[] {
  const { cols, rows } = latticeSize(width, height);
  const out: LitDot[] = [];
  const c0 = Math.max(0, Math.ceil((px - INFLUENCE_RADIUS) / SPACING));
  const c1 = Math.min(cols, Math.floor((px + INFLUENCE_RADIUS) / SPACING));
  const r0 = Math.max(0, Math.ceil((py - INFLUENCE_RADIUS) / SPACING));
  const r1 = Math.min(rows, Math.floor((py + INFLUENCE_RADIUS) / SPACING));
  for (let row = r0; row <= r1; row++)
    for (let col = c0; col <= c1; col++) {
      const [x, y] = dotPosition(col, row);
      const d = Math.hypot(x - px, y - py);
      if (d <= INFLUENCE_RADIUS) out.push({ col, row, k: proximity(d) });
    }
  return out;
}

/* ------------------------------------------------------------------------- */
/* Canvas 2D renderer                                                        */
/* ------------------------------------------------------------------------- */

/**
 * Glow sprites are pre-rendered (no per-frame allocation or filters): k is
 * quantised to GLOW_LEVELS steps per colour (radius error ≤ 0.03 px). Blur
 * mapping: Flutter MaskFilter.blur(normal, σ) is a Gaussian of standard
 * deviation σ; canvas `shadowBlur` is specified as 2σ, so shadowBlur = 2 × σ.
 */
export const GLOW_LEVELS = 64;

export interface Sprites {
  /** [colour][level] glow sprite canvases. */
  glow: HTMLCanvasElement[][];
  /** Half-size of each sprite in device px (sprite is drawn centred). */
  half: number;
  dpr: number;
}

export function makeSprites(colours: readonly string[], dpr: number): Sprites {
  const max = litStyle(1);
  // Enough room for the full Gaussian tail (3σ) around the largest glow.
  const half = Math.ceil((max.glowRadius + 3 * max.blurSigma + 2) * dpr);
  const size = half * 2;
  const glow = colours.map((colour) =>
    Array.from({ length: GLOW_LEVELS + 1 }, (_, i) => {
      const s = litStyle(i / GLOW_LEVELS);
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const g = c.getContext('2d');
      if (!g || s.glowAlpha <= 0) return c;
      // Draw the circle off-canvas and keep only its blurred shadow.
      const off = size * 2;
      g.shadowColor = rgba(colour, s.glowAlpha);
      g.shadowBlur = 2 * s.blurSigma * dpr;
      g.shadowOffsetX = off;
      g.fillStyle = '#000';
      g.beginPath();
      g.arc(half - off, half, s.glowRadius * dpr, 0, Math.PI * 2);
      g.fill();
      if (s.blurSigma === 0) {
        g.shadowColor = 'transparent';
        g.fillStyle = rgba(colour, s.glowAlpha);
        g.beginPath();
        g.arc(half, half, s.glowRadius * dpr, 0, Math.PI * 2);
        g.fill();
      }
      return c;
    }),
  );
  return { glow, half, dpr };
}

export function rgba(hex: string, a: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1]!, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** The resting lattice, drawn once per size onto its own canvas. */
export function drawRest(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  dpr: number,
  rest: string,
): void {
  const { cols, rows } = latticeSize(width, height);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.globalAlpha = REST_ALPHA;
  ctx.fillStyle = rest;
  ctx.beginPath();
  for (let row = 0; row <= rows; row++)
    for (let col = 0; col <= cols; col++) {
      const [x, y] = dotPosition(col, row);
      ctx.moveTo((x + REST_RADIUS) * dpr, y * dpr);
      ctx.arc(x * dpr, y * dpr, REST_RADIUS * dpr, 0, Math.PI * 2);
    }
  ctx.fill();
}

/**
 * One frame: the resting lattice, then each lit dot replaces its resting dot
 * with a blurred glow and a sharp core of the same colour (normal source-over
 * compositing; no additive blending).
 */
export function drawFrame(
  ctx: CanvasRenderingContext2D,
  restLayer: HTMLCanvasElement,
  lit: readonly LitDot[],
  sprites: Sprites,
  colours: readonly string[],
  t: number,
): void {
  const { dpr, half } = sprites;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.drawImage(restLayer, 0, 0);
  for (const d of lit) {
    const [x, y] = dotPosition(d.col, d.row);
    const X = x * dpr;
    const Y = y * dpr;
    // A lit dot is drawn instead of (not on top of) its resting dot.
    const r = Math.ceil((REST_RADIUS + 0.5) * dpr);
    ctx.clearRect(X - r, Y - r, r * 2, r * 2);
    const ci = colorIndex(d.col, d.row, t);
    const level = Math.round(Math.min(1, Math.max(0, d.k)) * GLOW_LEVELS);
    const sprite = sprites.glow[ci]?.[level];
    if (sprite) ctx.drawImage(sprite, X - half, Y - half);
    const s = litStyle(d.k);
    ctx.fillStyle = rgba(colours[ci]!, s.coreAlpha);
    ctx.beginPath();
    ctx.arc(X, Y, s.coreRadius * dpr, 0, Math.PI * 2);
    ctx.fill();
  }
}
