import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '@/app/App';
import { assemblyNexusConfig } from '@/config/assemblyNexus.config';
import { testAdapter } from '@/test/fixtures';
import { waitForSurface } from '@/test/render';
import { INTEGRATED_FOUNDER_ASSET_PATHS } from './scene/founderAssets';
import { APPROVED_HUMOR, BOLDNESS_BANNER } from './scene/humor';

/**
 * Founder-approved character universe on the visual Forge Floor. The rendered
 * images are immutable decorative assets and remain separate from every
 * factual worker and authority record.
 */

async function open(hash = '#/visual-floor') {
  window.location.hash = hash;
  render(<App config={assemblyNexusConfig} adapter={testAdapter()} />);
  await waitForSurface();
  return document.querySelector<HTMLElement>('.vf__art svg')!;
}
const all = (root: ParentNode, sel: string) => [...root.querySelectorAll<SVGElement>(sel)];

// Built in pieces so this file never contains the rejected phrase itself.
const PROHIBITED = ['AT', 'LEAST', 'I', 'TRIED'].join(' ');

describe('Assembly Nexus character universe', () => {
  it('renders exactly eight distinct approved Crown-Top assets, including Mr. Shades', async () => {
    const svg = await open();
    const sci = all(svg, '[data-character="crown-top"][data-founder-asset]');
    expect(sci).toHaveLength(8);
    expect(new Set(sci.map((s) => s.dataset.founderAsset)).size).toBe(8);
    expect(sci.map((s) => s.dataset.founderAsset).sort()).toEqual(
      Array.from({ length: 8 }, (_, i) => `CROWN_TOP_${String(i + 1).padStart(2, '0')}`),
    );
    const shades = sci.find((s) => s.dataset.founderAsset === 'CROWN_TOP_04')!;
    expect(shades.getAttribute('href')).toContain('crown-top-scientist-04-transparent.webp');
    for (const s of sci) {
      expect(s.dataset.factualBinding).toBe('NONE');
      expect(s.dataset.authorityBinding).toBe('NONE');
    }
  });

  it('renders all eight approved Snow Wolf identities as distinct decorative Chihuahuas', async () => {
    const svg = await open();
    const crew = all(svg, '[data-character="snow-wolf"][data-founder-asset]');
    expect(crew).toHaveLength(8);
    const personas = crew.map((c) => c.dataset.persona);
    expect(new Set(personas).size).toBe(8);
    for (const p of [
      'chuy',
      'boxer',
      'dj',
      'wild-paw',
      'coder',
      'hauler',
      'lookout',
      'snack-guard',
    ])
      expect(personas).toContain(p);
    for (const c of crew) {
      expect(c.dataset.factualBinding).toBe('NONE');
      expect(c.dataset.authorityBinding).toBe('NONE');
    }
  });

  it('keeps canonical Baby Ghost distinct from the two small blue 07 Ghost Sprites', async () => {
    const svg = await open();
    const skull = svg.querySelector<SVGElement>('[data-founder-focal="sacred-cyber-skull"]')!;
    expect(skull.dataset.founderAsset).toBe('BABY_GHOST_AND_SACRED_CYBER_SKULL');
    expect(skull.querySelector('image')!.getAttribute('href')).toContain(
      'baby-ghost-sacred-cyber-skull.webp',
    );
    const baby = svg.querySelector<SVGElement>('[data-character="baby-ghost-canon"]')!;
    expect(baby.getAttribute('href')).toContain('baby-ghost-transparent.webp');
    expect(baby.dataset.canonicalBabyGhost).toBe('true');
    expect(baby.dataset.factualBinding).toBe('NONE');
    expect(baby.dataset.authorityBinding).toBe('NONE');
    expect(skull.dataset.factualBinding).toBe('NONE');
    expect(skull.dataset.authorityBinding).toBe('NONE');
    const sprites = all(svg, '[data-character="07-ghost-sprite"]');
    expect(sprites).toHaveLength(2);
    for (const sprite of sprites) expect(sprite.dataset.canonicalBabyGhost).toBe('false');
    const ghostSpots = [...document.querySelectorAll<HTMLElement>('.vf__hotspot')].filter((b) =>
      b.dataset.station?.startsWith('wisp'),
    );
    expect(ghostSpots.length).toBe(2);
    for (const b of ghostSpots) {
      expect(b.dataset.bound).toBe('false');
      expect(b.getAttribute('aria-label')).toBe('07 Ghost Sprite: decorative, not bound to data');
    }
  });

  it('resolves every preserved manifest path and every integrated approved asset path', () => {
    const manifest = JSON.parse(
      readFileSync('public/assets/founder-universe/manifest.json', 'utf8'),
    ) as { assets: { relative_path: string }[] };
    expect(manifest.assets).toHaveLength(42);
    for (const record of manifest.assets) expect(existsSync(record.relative_path)).toBe(true);
    const preserved = new Set(manifest.assets.map((record) => `/${record.relative_path.slice(7)}`));
    const authorizedDerivative =
      '/assets/founder-universe/crown-top/crown-top-scientist-07-shades-ii-transparent.webp';
    expect(INTEGRATED_FOUNDER_ASSET_PATHS).toHaveLength(18);
    for (const path of INTEGRATED_FOUNDER_ASSET_PATHS) {
      if (path === authorizedDerivative) {
        expect(existsSync(`public${path}`)).toBe(true);
      } else {
        expect(preserved.has(path)).toBe(true);
      }
    }
  });

  it('named crew personas are never bound to data workers', async () => {
    await open();
    for (const id of ['ban-5', 'ban-6', 'ban-7', 'ban-8']) {
      const b = document.querySelector<HTMLElement>(`.vf__hotspot[data-station="${id}"]`)!;
      expect(b.dataset.bound).toBe('false');
    }
    const boxer = document.querySelector('.vf__hotspot[data-station="ban-5"]')!;
    expect(boxer.getAttribute('aria-label')).toBe(
      'Snow Wolf Crew · Boxer: decorative, not bound to data',
    );
  });

  it('crew details state the wardrobe and that named characters are not data', async () => {
    const user = userEvent.setup();
    await open();
    document.querySelector<HTMLButtonElement>('.vf__hotspot[data-station="ban-8"]')!.focus();
    await user.keyboard('{Enter}');
    const detail = document.querySelector('.vf__detail')!;
    expect(detail.textContent).toContain('Snow Wolf Crew · Chuy');
    expect(detail.textContent).toContain('Approved knitted balaclava');
    expect(detail.textContent).toContain('Never bound to data');
    expect(screen.getByRole('heading', { name: 'Details' })).toBeTruthy();
  });

  it('shows the Crown-Top banner, playful', async () => {
    const svg = await open();
    const banner = svg.querySelector('[data-banner="boldness"]')!;
    expect(banner.textContent).toContain('WITH BOLDNESS');
    expect(banner.textContent).toContain('INTELLIGENCE.');
    expect(banner.textContent).toContain(BOLDNESS_BANNER.subline);
    expect(banner.textContent).toContain('Crown-Top Research Division');
  });

  it('uses only approved humor phrases, sparingly, and the scene text matches them', async () => {
    const svg = await open();
    const used = all(svg, '[data-humor]');
    expect(used.length).toBeGreaterThanOrEqual(3);
    expect(used.length).toBeLessThanOrEqual(6);
    for (const g of used) {
      const phrase = g.dataset.humor!;
      expect(APPROVED_HUMOR as readonly string[]).toContain(phrase);
      // Same words, regardless of how the scene breaks the lines.
      expect((g.textContent ?? '').replace(/\s+/g, '')).toBe(phrase.replace(/\s+/g, ''));
    }
  });

  it('never contains the rejected phrase, in the page or anywhere in src', async () => {
    const svg = await open();
    expect(document.body.textContent!.toUpperCase()).not.toContain(PROHIBITED);
    expect(svg.textContent!.toUpperCase()).not.toContain(PROHIBITED);
    const hits: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (
          /\.(tsx?|css|json)$/.test(f) &&
          readFileSync(p, 'utf8').toUpperCase().includes(PROHIBITED)
        )
          hits.push(p);
      }
    };
    walk('src');
    expect(hits).toEqual([]);
  });

  it('keeps the truthfulness firewall: provenance chip and UNKNOWN remain visible', async () => {
    await open();
    expect(screen.getByText('VISUAL PREVIEW · DEMO DATA')).toBeTruthy();
    const sys = document.querySelector('.vf__hud--systems')!;
    expect(sys.textContent).toContain('UNKNOWN');
    expect(sys.textContent).toContain('not connected in this build');
  });
});
