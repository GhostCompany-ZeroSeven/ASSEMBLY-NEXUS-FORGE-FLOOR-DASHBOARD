import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assemblyNexusConfig } from '@/config/assemblyNexus.config';
import { allStrings } from '@/test/i18nStrings';
import { en } from './en';
import { es } from './es';

/**
 * Rendering determinism guard. Every character the UI renders must be covered
 * by the bundled fonts (Inter, JetBrains Mono). An uncovered glyph (e.g. "→")
 * falls back to an OS font, which differs per machine: that made visual
 * baselines environment-dependent in Phase 3. Use icons for arrows and symbols.
 */

const ranges: [number, number][] = [];
for (const pkg of ['inter', 'jetbrains-mono']) {
  const css = readFileSync(`node_modules/@fontsource-variable/${pkg}/index.css`, 'utf8');
  for (const m of css.matchAll(/unicode-range:([^;]+);/g))
    for (const r of m[1]!.split(',')) {
      const [a, b] = r.trim().slice(2).split('-');
      ranges.push([parseInt(a!, 16), parseInt(b ?? a!, 16)]);
    }
}
const covered = (cp: number) => cp < 0x80 || ranges.some(([a, b]) => cp >= a && cp <= b);
const uncovered = (s: string) =>
  [...new Set([...s].filter((ch) => !covered(ch.codePointAt(0)!)))].map(
    (ch) => `${ch} U+${ch.codePointAt(0)!.toString(16).toUpperCase()}`,
  );

describe('glyph coverage (bundled fonts only)', () => {
  it('has font ranges to check against', () => {
    expect(ranges.length).toBeGreaterThan(10);
  });

  it('every message in every locale uses covered glyphs', () => {
    for (const [name, m] of [
      ['en', en],
      ['es', es],
    ] as const) {
      expect(uncovered(allStrings(m).join('')), name).toEqual([]);
    }
  });

  it('config display text (all locales) uses covered glyphs', () => {
    const c = assemblyNexusConfig;
    const texts = [
      c.branding.productName,
      c.branding.surfaceName,
      c.branding.monogram,
      c.branding.tagline ?? '',
      ...c.themes.flatMap((t) => [t.label, t.description, JSON.stringify(t.i18n ?? {})]),
      ...c.crews.flatMap((x) => [x.label, x.motto ?? '', JSON.stringify(x.i18n ?? {})]),
      ...c.floor.rooms.flatMap((r) => [r.label, r.description, JSON.stringify(r.i18n ?? {})]),
    ];
    expect(uncovered(texts.join(''))).toEqual([]);
    // Exception: branding.hierarchy is the Founder's identity text, rendered
    // verbatim by contract (config/types.ts). It is masked in visual tests.
  });

  it('rendered source (TSX/CSS, comments excluded) uses covered glyphs', () => {
    const files: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(tsx|css)$/.test(f) && !/\.test\./.test(f)) files.push(p);
      }
    };
    walk('src');
    const problems: string[] = [];
    for (const f of files) {
      const code = readFileSync(f, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      const bad = uncovered(code);
      if (bad.length) problems.push(`${f}: ${bad.join(' ')}`);
    }
    expect(problems).toEqual([]);
  });
});
