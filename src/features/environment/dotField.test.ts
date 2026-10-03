import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  colorIndex,
  COLOR_CYCLE_MS,
  cycleT,
  dimmed,
  dotPosition,
  EXIT_FADE_MS,
  INFLUENCE_RADIUS,
  latticeCount,
  latticeSize,
  litDots,
  litStyle,
  proximity,
  REFERENCE_PALETTE,
  REFERENCE_REST,
  REST_ALPHA,
  REST_RADIUS,
  SPACING,
} from './dotField';

/** Locked reference mechanism (C5 dot field) — acceptance checks. */

describe('geometry (locked)', () => {
  it('spacing 34; inclusive lattice covers the edges', () => {
    expect(SPACING).toBe(34);
    expect(latticeSize(1220, 844)).toEqual({ cols: 36, rows: 25 });
    expect(latticeCount(1220, 844)).toBe(37 * 26);
    // The last column/row reaches or passes the far edge: no bald margin.
    expect(dotPosition(36, 25)[0]).toBeGreaterThanOrEqual(1220);
    expect(dotPosition(36, 25)[1]).toBeGreaterThanOrEqual(844);
  });

  it('TEST 1 position immutability: a dot is always at (col×34, row×34)', () => {
    const before = dotPosition(7, 11);
    for (const [px, py] of [
      [0, 0],
      [238, 374],
      [900, 120],
    ])
      litDots(1220, 844, px!, py!); // pointer activity cannot move anything
    expect(dotPosition(7, 11)).toEqual(before);
    expect(before).toEqual([238, 374]);
    for (const d of litDots(1220, 844, 238, 374))
      expect(dotPosition(d.col, d.row)).toEqual([d.col * 34, d.row * 34]);
  });

  it('TEST 2 no randomness: identical lattice and lit set every time', () => {
    expect(litDots(1220, 844, 500, 300)).toEqual(litDots(1220, 844, 500, 300));
    // No randomness or motion state anywhere in the field's code (comments aside).
    for (const f of ['dotField.ts', 'NexusFieldCanvas.tsx']) {
      const code = readFileSync(`src/features/environment/${f}`, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      expect(code, f).not.toMatch(/Math\.random|velocity|\bvx\b|spring|friction|inertia|trail/i);
    }
  });
});

describe('pointer response (locked)', () => {
  it('TEST 5 influence boundary at 150px: rest beyond, response within', () => {
    expect(INFLUENCE_RADIUS).toBe(150);
    expect(proximity(150.0001)).toBe(0);
    expect(proximity(150)).toBe(0);
    expect(proximity(75)).toBeCloseTo(0.5);
    expect(proximity(0)).toBe(1);
    for (const d of litDots(1220, 844, 500, 300)) {
      const [x, y] = dotPosition(d.col, d.row);
      expect(Math.hypot(x - 500, y - 300)).toBeLessThanOrEqual(150);
    }
  });

  it('TEST 4 cursor centre: k = 1 → core 2.6px, glow 5.0px, blur σ 6', () => {
    const s = litStyle(proximity(0));
    expect(s.coreRadius).toBeCloseTo(2.6);
    expect(s.glowRadius).toBeCloseTo(5.0);
    expect(s.blurSigma).toBeCloseTo(6.0);
    expect(s.glowAlpha).toBeCloseTo(0.9);
    expect(s.coreAlpha).toBeCloseTo(1.0);
  });

  it('k = 0 edge of the disc: glow 1.5px with no alpha or blur, core 1.0px at 0.25', () => {
    expect(litStyle(0)).toEqual({
      glowRadius: 1.5,
      glowAlpha: 0,
      blurSigma: 0,
      coreRadius: 1.0,
      coreAlpha: 0.25,
    });
  });

  it('resting dot: radius 1.0, alpha 1.0, colour #161B26', () => {
    expect(REST_RADIUS).toBe(1);
    expect(REST_ALPHA).toBe(1);
    expect(REFERENCE_REST).toBe('#161b26');
  });

  it('TEST 6 lit population ≈ π·150²/34² ≈ 61 at an interior pointer', () => {
    const counts = [
      [500, 300],
      [517, 317],
      [612, 401],
    ].map(([x, y]) => litDots(1220, 844, x!, y!).length);
    for (const n of counts) {
      expect(n).toBeGreaterThanOrEqual(55);
      expect(n).toBeLessThanOrEqual(67);
    }
  });

  it('TEST 7 no trail: the lit set depends only on the current pointer', () => {
    const direct = litDots(1220, 844, 900, 500);
    // A fast sweep beforehand changes nothing: there is no history to keep.
    for (let x = 0; x < 1200; x += 40) litDots(1220, 844, x, 100);
    expect(litDots(1220, 844, 900, 500)).toEqual(direct);
  });
});

describe('pointer exit (Forge Floor hardening)', () => {
  it('dims the dots lit at exit IN PLACE over a short fade; positions never change', () => {
    expect(EXIT_FADE_MS).toBeGreaterThan(0);
    expect(EXIT_FADE_MS).toBeLessThanOrEqual(250);
    const lit = litDots(1220, 844, 500, 300);
    const half = dimmed(lit, 0.5);
    expect(half.map(({ col, row }) => [col, row])).toEqual(lit.map(({ col, row }) => [col, row]));
    half.forEach((d, i) => expect(d.k).toBeCloseTo(lit[i]!.k * 0.5));
    expect(dimmed(lit, 0).every((d) => d.k === 0)).toBe(true);
    expect(dimmed(lit, 2)).toEqual(lit); // clamped: never brighter than lit
    expect(lit[0]!.k).toBe(litDots(1220, 844, 500, 300)[0]!.k); // input untouched
  });
});

describe('colour (locked)', () => {
  it('reference triad UV, LIME, CYAN', () => {
    expect(REFERENCE_PALETTE).toEqual(['#b14cff', '#9dff3c', '#3ce6ff']);
    const css = readFileSync('src/styles/nexus-palette.css', 'utf8');
    expect(css).toMatch(/--nx-field-uv:\s*#b14cff/);
    expect(css).toMatch(/--nx-field-lime:\s*#9dff3c/);
    expect(css).toMatch(/--nx-field-cyan:\s*#3ce6ff/);
    expect(css).toMatch(/--nx-field-rest:\s*#161b26/);
  });

  it('t runs 0→1 over 8 s and repeats', () => {
    expect(COLOR_CYCLE_MS).toBe(8000);
    expect(cycleT(0)).toBe(0);
    expect(cycleT(4000)).toBe(0.5);
    expect(cycleT(8000)).toBe(0);
    expect(cycleT(10_000)).toBe(0.25);
  });

  it('phase = ((col·3 + row·5)/8 + t) mod 1; index = floor(phase·3) mod 3; snaps', () => {
    expect(colorIndex(0, 0, 0)).toBe(0);
    expect(colorIndex(1, 0, 0)).toBe(1); // phase 0.375
    expect(colorIndex(0, 1, 0)).toBe(1); // phase 0.625
    expect(colorIndex(2, 0, 0)).toBe(2); // phase 0.75
    expect(colorIndex(1, 1, 0)).toBe(0); // phase 0
    // Only integer indices: colours snap, never blend.
    for (let t = 0; t < 1; t += 0.01) expect([0, 1, 2]).toContain(colorIndex(5, 9, t));
  });
});
