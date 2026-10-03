import { describe, expect, it } from 'vitest';
import { assemblyNexusConfig } from '@/config/assemblyNexus.config';
import { boundaryIndex, composeOffsets, fitGlyph, glyphTarget, segmentLine } from './brandGeometry';

const { hierarchy, hierarchyLayout } = assemblyNexusConfig.branding;

describe('branding canon text', () => {
  it('keeps the five lines exactly, with the SMALL square and the ○● pair', () => {
    expect(hierarchy).toEqual([
      'Founder #0007',
      'A•N',
      '《Assembly▪︎Nexus》',
      'Wolf◇Technologies',
      'Ghost○●Company-07',
    ]);
    expect(hierarchy.join('')).not.toMatch(/[■□]/); // no large ■ or □
  });
});

describe('segmentLine', () => {
  it('splits controlled symbols out and concatenates back to the line verbatim', () => {
    for (const line of hierarchy) {
      expect(
        segmentLine(line)
          .map((s) => s.text)
          .join(''),
      ).toBe(line);
    }
  });

  it('keeps the text-presentation selector with the small square', () => {
    expect(segmentLine(hierarchy[2]!)).toEqual([
      { text: '《Assembly' },
      { text: '▪︎', glyph: 'small-square' },
      { text: 'Nexus》' },
    ]);
    expect(segmentLine(hierarchy[4]!).filter((s) => s.glyph)).toEqual([
      { text: '○', glyph: 'circle' },
      { text: '●', glyph: 'circle' },
    ]);
  });
});

describe('glyph fitting', () => {
  const t = { xHeight: 55, capHeight: 73 };

  it('gives the hollow and the filled circle the same visible diameter, whatever their metrics', () => {
    const hollow = { width: 77, height: 78, ascent: 65, descent: 13 };
    const filled = { width: 90, height: 92, ascent: 75, descent: 17 }; // a larger fallback glyph
    const target = glyphTarget('circle', t);
    const a = fitGlyph(hollow, target, t);
    const b = fitGlyph(filled, target, t);
    expect(a.scale * 78).toBeCloseTo(target);
    expect(b.scale * 92).toBeCloseTo(target);
  });

  it('draws the square small: half the x-height', () => {
    const fit = fitGlyph(
      { width: 50, height: 50, ascent: 51, descent: -1 },
      glyphTarget('small-square', t),
      t,
    );
    expect(fit.scale * 50).toBeCloseTo(27.5);
  });

  it('centres a fitted glyph on the x-height midline', () => {
    const ink = { width: 40, height: 40, ascent: 40, descent: 0 };
    const fit = fitGlyph(ink, 20, t);
    // ink centre after scaling and raising = x-height / 2
    expect(fit.raise + (fit.scale * (ink.ascent - ink.descent)) / 2).toBeCloseTo(t.xHeight / 2);
  });
});

describe('composeOffsets (Assembly Nexus geometry)', () => {
  // Synthetic monospace measurements: every character is 10 units wide.
  const widths = hierarchy.map((l) => l.replace('︎', '').length * 10);
  const x = (line: number, index: number) =>
    hierarchy[line]!.slice(0, index).replace('︎', '').length * 10;
  const off = composeOffsets(hierarchy, hierarchyLayout!, { widths, x });

  it('centres A•N between the m|b boundary and the y|▪ transition of Assembly', () => {
    const ref = hierarchy[2]!;
    const from = off[2]! + x(2, boundaryIndex(ref, 'Assem|bly'));
    const to = off[2]! + x(2, boundaryIndex(ref, 'Assembly|▪'));
    expect(off[1]! + widths[1]! / 2).toBeCloseTo((from + to) / 2);
  });

  it('is not plain left alignment and not per-line centring', () => {
    expect(new Set(off).size).toBeGreaterThan(1);
    const centres = off.map((o, i) => o + widths[i]! / 2);
    expect(new Set(centres.map((c) => Math.round(c))).size).toBeGreaterThan(1);
  });

  it('never moves a line left of the block edge', () => {
    expect(Math.min(...off)).toBeGreaterThanOrEqual(0);
  });
});

describe('Wolf/Ghost nudge (Founder review)', () => {
  const widths = hierarchy.map((l) => l.replace('\uFE0E', '').length * 10);
  const x = (line: number, index: number) =>
    hierarchy[line]!.slice(0, index).replace('\uFE0E', '').length * 10;
  const unNudged = {
    ...hierarchyLayout!,
    rules: hierarchyLayout!.rules.map((r) => (r.kind === 'center' ? { ...r, nudge: 0 } : r)),
  };
  const before = composeOffsets(hierarchy, unNudged, { widths, x, em: 11 });
  const after = composeOffsets(hierarchy, hierarchyLayout!, { widths, x, em: 11 });

  it('moves Wolf a half-em right of the shared start', () => {
    expect(after[3]! - before[3]!).toBeCloseTo(5.5);
  });

  it('starts Ghost one space (0.281em) left of Wolf', () => {
    expect(after[3]! - after[4]!).toBeCloseTo(0.281 * 11);
  });

  it('leaves Founder #0007, A•N and 《Assembly▪︎Nexus》 exactly where they were', () => {
    expect(after.slice(0, 3)).toEqual(before.slice(0, 3));
  });
});
