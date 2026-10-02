import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { buildSeedSnapshot } from '@/adapters/demo/seed';
import { App } from '@/app/App';
import { ScientistFigure } from '@/characters/ScientistFigure';
import { fallbackCharacter } from '@/characters/fallback';
import type { ScientistAppearance } from '@/characters/types';
import { assemblyNexusConfig } from '@/config/assemblyNexus.config';
import { testAdapter } from '@/test/fixtures';
import { waitForSurface } from '@/test/render';

/**
 * Phase 11: one Assembly Nexus universe across the factual dashboard and the
 * visual Forge Floor, with characters kept separate from factual workers.
 */

async function open(hash: string) {
  window.location.hash = hash;
  render(<App config={assemblyNexusConfig} adapter={testAdapter()} />);
  await waitForSurface();
}

const ROLES = [
  'BUILD',
  'TEST',
  'REVIEW',
  'CERTIFICATION',
  'RESEARCH',
  'SYSTEMS',
  'ANALYSIS',
  'OPERATIONS',
];
const workerNames = buildSeedSnapshot(Date.parse('2026-09-30T12:00:00Z')).workers.map(
  (w) => w.name,
);

/** All absolute coordinate pairs of a hair group's shapes. */
function hairPoints(g: Element): [number, number][] {
  const pts: [number, number][] = [];
  for (const p of g.querySelectorAll('path')) {
    const nums = (p.getAttribute('d') ?? '').match(/-?\d+(\.\d+)?/g)!.map(Number);
    for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i]!, nums[i + 1]!]);
  }
  for (const c of g.querySelectorAll('circle'))
    pts.push([
      Number(c.getAttribute('cx')),
      Number(c.getAttribute('cy')) - Number(c.getAttribute('r')),
    ]);
  return pts;
}

function renderAvatar(a: ScientistAppearance) {
  const { container, unmount } = render(
    <svg viewBox="0 0 64 80">
      <ScientistFigure appearance={a} state="WORKING" />
    </svg>,
  );
  return { root: container.querySelector('[data-character="crown-top-avatar"]')!, unmount };
}

const scientists = Object.entries(assemblyNexusConfig.characters).flatMap(([id, d]) =>
  d.kind === 'procedural-scientist' ? [[id, d.appearance] as const] : [],
);

describe('Phase 11: visual Crown-Top stations use role/station labels', () => {
  it('has exactly 8 Crown-Top stations, each labelled with a distinct role', async () => {
    await open('#/visual-floor');
    const desks = [
      ...document.querySelectorAll<HTMLElement>('.vf__hotspot[data-kind="scientist"]'),
    ];
    expect(desks).toHaveLength(8);
    const roles = desks.map((d) => d.querySelector('.vf__nameplate--role')!.textContent!.trim());
    expect(new Set(roles).size).toBe(8);
    for (const r of roles) expect(ROLES).toContain(r);
    for (const d of desks)
      expect(d.getAttribute('aria-label')).toMatch(
        /^Crown-Top Scientist · [A-Z]+ station( \(younger generation\))?: decorative, not bound to data$/,
      );
  });

  it('never shows a demo worker name on a visual character (Juniper included)', async () => {
    await open('#/visual-floor');
    const stage = document.querySelector('.vf__stage-wrap .vf__canvas')!;
    for (const name of workerNames) {
      const first = new RegExp(`\\b${name.split(' ')[0]!}\\b`);
      expect(stage.textContent).not.toMatch(first);
      for (const b of stage.querySelectorAll('.vf__hotspot'))
        expect(b.getAttribute('aria-label')).not.toMatch(first);
    }
    expect(stage.textContent).not.toContain('Juniper');
  });

  it('decorative characters never become factual workers', async () => {
    await open('#/visual-floor');
    const spots = [...document.querySelectorAll<HTMLElement>('.vf__hotspot')];
    expect(spots).toHaveLength(18);
    expect(spots.every((b) => b.dataset.bound === 'false')).toBe(true);
    expect(document.querySelectorAll('.vf__art [data-character="baby-ghost"]')).toHaveLength(3);
    expect(document.querySelectorAll('.vf__art [data-character="snow-wolf"]')).toHaveLength(8);
    expect(document.querySelectorAll('.vf__art [data-character="crown-top"]')).toHaveLength(8);
  });

  it('a station detail states that the label is not a worker, Associate or authority', async () => {
    await open('#/visual-floor?station=sci-3');
    const d = document.querySelector('.vf__detail')!;
    expect(d.textContent).toContain('Crown-Top Scientist · TEST station');
    expect(d.textContent).toContain('It is not a worker, an Associate or an authority');
    expect(screen.getByRole('link', { name: 'Open Workers (factual)' }).getAttribute('href')).toBe(
      '#/workers',
    );
  });

  it('Juniper stays fully visible in the factual Workers view', async () => {
    await open('#/workers');
    expect(document.body.textContent).toContain('Juniper');
  });
});

describe('Phase 11: factual scientist avatars join the Crown-Top family', () => {
  it('every configured scientist has a chrome or stubble crown, roughly half each', () => {
    const crowns = scientists.map(([, a]) => a.crown);
    for (const c of crowns) expect(['chrome', 'stubble']).toContain(c);
    const chrome = crowns.filter((c) => c === 'chrome').length;
    expect(chrome).toBeGreaterThanOrEqual(3);
    expect(crowns.length - chrome).toBeGreaterThanOrEqual(3);
  });

  it('renders both crown variants', () => {
    for (const crown of ['chrome', 'stubble'] as const) {
      const { root, unmount } = renderAvatar({ ...scientists[0]![1], crown });
      expect(root.getAttribute('data-crown')).toBe(crown);
      expect(root.querySelector(`[data-crown-render="${crown}"]`)).toBeTruthy();
      unmount();
    }
  });

  it('keeps hair at the sides/back only: nothing covers the crown, for every hair style', () => {
    const styles: ScientistAppearance['hairStyle'][] = ['sides', 'tufts', 'wild', 'bun', 'swoop'];
    for (const hairStyle of styles) {
      const { root, unmount } = renderAvatar({ ...scientists[0]![1], hairStyle });
      const groups = [...root.querySelectorAll('[data-hair]')];
      expect(groups.length).toBeGreaterThan(0);
      for (const g of groups) {
        expect(['sides', 'back']).toContain(g.getAttribute('data-hair'));
        for (const [x, y] of hairPoints(g)) {
          // The crown cap spans roughly x 20..44, y 7..19 in the 64x80 avatar.
          expect(y, `${hairStyle} hair at ${x},${y}`).toBeGreaterThanOrEqual(13);
          if (x > 22 && x < 42)
            expect(y, `${hairStyle} hair over crown`).toBeGreaterThanOrEqual(26);
        }
      }
      unmount();
    }
  });

  it('goggles hang at the neck, never over the crown', () => {
    const { root, unmount } = renderAvatar({ ...scientists[0]![1], eyewear: 'goggles' });
    const g = root.querySelector('[data-accessory="goggles"]')!;
    for (const [, y] of hairPoints(g)) expect(y).toBeGreaterThanOrEqual(34);
    unmount();
  });

  it('has no cheek marks on any avatar', () => {
    // A cheek mark is a round fill on either cheek (below the eyes, beside the nose).
    for (const [, a] of scientists) {
      const { root, unmount } = renderAvatar(a);
      for (const c of root.querySelectorAll('circle, ellipse')) {
        const cx = Number(c.getAttribute('cx'));
        const cy = Number(c.getAttribute('cy'));
        const onCheek = cy >= 25 && cy <= 30 && ((cx >= 21 && cx <= 27) || (cx >= 37 && cx <= 43));
        expect(onCheek, `cheek shape at ${cx},${cy}`).toBe(false);
      }
      unmount();
    }
  });

  it('fallback (unknown backend) avatars also get a Crown-Top crown', () => {
    const crowns = new Set(
      ['x1', 'x2', 'x3', 'x4', 'x5', 'x6', 'x7', 'x8'].map((id) => {
        const d = fallbackCharacter(id);
        return d.kind === 'procedural-scientist' ? d.appearance.crown : undefined;
      }),
    );
    expect([...crowns].every((c) => c === 'chrome' || c === 'stubble')).toBe(true);
  });

  it('the factual Forge Floor renders Crown-Top family avatars for its scientists', async () => {
    await open('#/floor');
    const avatars = [...document.querySelectorAll('[data-character="crown-top-avatar"]')];
    expect(avatars.length).toBeGreaterThanOrEqual(9);
    const crowns = new Set(avatars.map((a) => a.getAttribute('data-crown')));
    expect(crowns).toEqual(new Set(['chrome', 'stubble']));
  });
});

describe('Phase 11: branding and prohibited phrase', () => {
  it('uses A•N (never A.N) and keeps approved Snow Wolves decorative', async () => {
    await open('#/visual-floor');
    expect(document.body.textContent).not.toMatch(/\bA\.N\b/);
    const crew = [
      ...document.querySelectorAll<SVGElement>('.vf__art [data-character="snow-wolf"]'),
    ];
    expect(crew).toHaveLength(8);
    expect(new Set(crew.map((c) => c.dataset.founderAsset)).size).toBe(8);
    for (const c of crew) {
      expect(c.dataset.decorative).toBe('true');
      expect(c.dataset.factualBinding).toBe('NONE');
      expect(c.dataset.authorityBinding).toBe('NONE');
    }
  });

  it('no variant of the rejected phrase appears on any surface', async () => {
    const rejected = new RegExp(['AT', 'LEAST', 'I', 'TRIED'].join('[\\s,.!-]*'), 'i');
    for (const hash of ['#/visual-floor', '#/visual-floor?preview=red-alert', '#/floor', '#/']) {
      await open(hash);
      expect(document.body.textContent).not.toMatch(rejected);
      document.body.innerHTML = '';
    }
  });
});
