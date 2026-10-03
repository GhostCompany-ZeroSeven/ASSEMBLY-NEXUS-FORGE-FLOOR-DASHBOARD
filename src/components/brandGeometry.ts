import type { HierarchyLayout } from '@/config/types';

/**
 * Typographic geometry of the identity hierarchy. Pure functions only: the
 * component measures the rendered text (character positions, glyph ink) in
 * the viewer's own fonts and this module turns the measurements into offsets
 * and glyph sizes. No whitespace is ever inserted into the text.
 */

/** Symbols drawn at a controlled size, with an optional text-presentation selector. */
const GLYPH = /([▪○●]︎?)/u;

export type GlyphKind = 'small-square' | 'circle';

export interface Segment {
  text: string;
  glyph?: GlyphKind;
}

function kindOf(ch: string): GlyphKind {
  return ch === '▪' ? 'small-square' : 'circle';
}

/** Split a line into plain text and controlled glyphs; concatenation is the line verbatim. */
export function segmentLine(line: string): Segment[] {
  return line
    .split(GLYPH)
    .filter((s) => s !== '')
    .map((text) =>
      GLYPH.test(text) && text.replace('︎', '').length === 1
        ? { text, glyph: kindOf(text[0]!) }
        : { text },
    );
}

/** Ink box of a glyph as reported by canvas measureText (same font fallback as the DOM). */
export interface Ink {
  width: number;
  height: number;
  /** actualBoundingBoxAscent: ink top above the baseline. */
  ascent: number;
  /** actualBoundingBoxDescent: ink bottom below the baseline (positive = below). */
  descent: number;
}

/** Parent text metrics, in the same units as the ink measurements. */
export interface TextMetrics {
  xHeight: number;
  capHeight: number;
}

/**
 * Visible size targets. Both circles share one diameter, so the hollow and
 * filled circle read as a matched pair whatever their font's metrics; the
 * square is the SMALL square, half the x-height.
 */
export function glyphTarget(kind: GlyphKind, t: TextMetrics): number {
  return kind === 'circle' ? 0.8 * t.capHeight : 0.5 * t.xHeight;
}

export interface GlyphFit {
  /** Font-size multiplier for the glyph's span (em). */
  scale: number;
  /** Baseline shift in the measurement units (positive = up). */
  raise: number;
}

/**
 * Scale a glyph so its larger ink dimension equals the target, and raise it
 * so its ink is centred on the x-height midline of the surrounding text.
 */
export function fitGlyph(ink: Ink, target: number, t: TextMetrics): GlyphFit {
  const size = Math.max(ink.width, ink.height);
  if (!(size > 0)) return { scale: 1, raise: 0 };
  const scale = target / size;
  const inkCentre = (scale * (ink.ascent - ink.descent)) / 2;
  return { scale, raise: t.xHeight / 2 - inkCentre };
}

/** Find a boundary written as `left|right` inside a line; returns its character index. */
export function boundaryIndex(line: string, marker: string): number {
  const cut = marker.indexOf('|');
  if (cut < 0) return -1;
  const at = line.indexOf(marker.slice(0, cut) + marker.slice(cut + 1));
  return at < 0 ? -1 : at + cut;
}

export interface Measured {
  /** Advance width of every line. */
  widths: number[];
  /** x of a boundary (character index) inside a line, from that line's start. */
  x: (line: number, index: number) => number;
  /** Font size of the mark in px (converts `nudge` from em). */
  em?: number;
}

/**
 * Horizontal offset of every line, from the measured text and the layout
 * rules. The axis line is the reference; lines without a rule share its
 * start. The result is shifted so the leftmost line starts at 0; a block's
 * `nudge` is applied after that shift, so it moves only its own lines.
 */
export function composeOffsets(
  lines: readonly string[],
  layout: HierarchyLayout,
  m: Measured,
): number[] {
  const axis = layout.axis;
  const offsets: number[] = lines.map(() => 0);
  const axisCentre = (m.widths[axis] ?? 0) / 2;
  for (const rule of layout.rules) {
    if (rule.kind === 'center') {
      const block = Math.max(...rule.lines.map((i) => m.widths[i] ?? 0));
      for (const i of rule.lines) offsets[i] = axisCentre - block / 2;
    } else {
      const ref = lines[rule.ref] ?? '';
      const a = boundaryIndex(ref, rule.from);
      const b = boundaryIndex(ref, rule.to);
      if (a < 0 || b < 0) continue;
      const centre = offsets[rule.ref]! + (m.x(rule.ref, a) + m.x(rule.ref, b)) / 2;
      offsets[rule.line] = centre - (m.widths[rule.line] ?? 0) / 2;
    }
  }
  const min = Math.min(...offsets);
  const placed = offsets.map((o) => o - min);
  for (const rule of layout.rules) {
    if (rule.kind !== 'center' || !rule.nudge) continue;
    const { nudge } = rule;
    rule.lines.forEach((i, k) => {
      const em = Array.isArray(nudge) ? (nudge[k] ?? 0) : nudge;
      placed[i] = placed[i]! + em * (m.em ?? 16);
    });
  }
  return placed.map((o) => Math.round(o * 100) / 100);
}
