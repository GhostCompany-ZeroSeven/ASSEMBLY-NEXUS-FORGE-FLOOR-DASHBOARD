import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Visual DNA token architecture: core semantic tokens → theme mappings →
 * (optional) Nexus palette. These checks keep the layers honest; whether
 * anything LOOKS different is the visual suite's job.
 */

const DIR = 'src/styles';
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const files = readdirSync(DIR).filter((f) => f.endsWith('.css'));
const css = Object.fromEntries(files.map((f) => [f, strip(readFileSync(join(DIR, f), 'utf8'))]));
const all = Object.values(css).join('\n');
const tokens = css['tokens.css']!;
const rootBlock = tokens.slice(0, tokens.indexOf("[data-theme='snow-wolf']"));

describe('token architecture', () => {
  it('every custom property a style uses is defined somewhere', () => {
    const defined = new Set([...all.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
    const used = new Set([...all.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]));
    expect([...used].filter((u) => !defined.has(u))).toEqual([]);
  });

  it('separates Founder and simulated amber from caution (same colour in Wave A)', () => {
    expect(rootBlock).toMatch(/--tone-founder:\s*var\(--tone-warning\)/);
    expect(rootBlock).toMatch(/--tone-simulated:\s*var\(--tone-warning\)/);
    expect(rootBlock).toMatch(/--focus-ring:\s*var\(--focus\)/);
  });

  it('never aliases a token that Red Alert re-declares below the root', () => {
    // An alias resolves where it is declared, so it would stop following them.
    expect(rootBlock).not.toMatch(/:\s*var\(--(accent|line-strong)\)/);
  });

  it('the core layer does not depend on the Assembly Nexus palette', () => {
    expect(rootBlock).not.toMatch(/var\(--nx-/);
    for (const [f, text] of Object.entries(css))
      if (f !== 'nexus-palette.css' && f !== 'visual-floor.css' && f !== 'features.css')
        expect(text, f).not.toMatch(/var\(--nx-/);
  });

  it('keeps both shipped themes', () => {
    expect(tokens).toMatch(/\[data-theme='forge'\]/);
    expect(tokens).toMatch(/\[data-theme='snow-wolf'\]\s*\{[^}]*--accent:/);
  });
});
