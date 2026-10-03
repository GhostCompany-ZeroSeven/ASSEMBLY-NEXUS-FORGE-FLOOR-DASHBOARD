import { render } from '@testing-library/react';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Panel } from './ui';

/**
 * Nexus Signature panel families are an explicit, typed contract: chosen by
 * the caller as a literal, never derived from rendered text, DOM order or
 * status. A family is a frame colour, not a state.
 */

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.tsx') ? [p] : [];
  });
}

describe('Panel family contract', () => {
  it('renders the family and the truthful tone as separate attributes', () => {
    const { container } = render(
      <Panel title="x" family="founder" tone="warning">
        body
      </Panel>,
    );
    const s = container.querySelector('section')!;
    expect(s.dataset.family).toBe('founder');
    expect(s.dataset.tone).toBe('warning');
  });

  it('defaults to the quiet neutral family and no tone', () => {
    const { container } = render(<Panel title="x">body</Panel>);
    const s = container.querySelector('section')!;
    expect(s.dataset.family).toBe('neutral');
    expect(s.hasAttribute('data-tone')).toBe(false);
  });

  it('every family in the source is a literal (no title matching, no computed families)', () => {
    const offenders: string[] = [];
    let literals = 0;
    for (const f of files('src')) {
      if (f.endsWith('.test.tsx') || f === join('src', 'components', 'ui.tsx')) continue; // the Panel itself
      const text = readFileSync(f, 'utf8');
      literals += (
        text.match(/\b(data-)?family="(ops|floor|signal|review|systems|founder|neutral)"/g) ?? []
      ).length;
      if (/\b(data-)?family=\{/.test(text)) offenders.push(f);
    }
    expect(offenders).toEqual([]);
    expect(literals).toBeGreaterThan(50);
  });

  it('styles never pick a colour from text content', () => {
    for (const f of readdirSync('src/styles').filter((x) => x.endsWith('.css'))) {
      const css = readFileSync(join('src/styles', f), 'utf8');
      expect(css, f).not.toMatch(/:has\([^)]*:contains|\[title[*^$]?=/);
    }
  });
});
