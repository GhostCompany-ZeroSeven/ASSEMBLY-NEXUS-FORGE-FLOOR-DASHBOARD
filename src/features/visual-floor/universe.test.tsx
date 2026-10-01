import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '@/app/App';
import { assemblyNexusConfig } from '@/config/assemblyNexus.config';
import { testAdapter } from '@/test/fixtures';
import { waitForSurface } from '@/test/render';
import { APPROVED_HUMOR, BOLDNESS_BANNER } from './scene/humor';

/**
 * Phase 10: the Founder's Assembly Nexus character universe on the visual
 * Forge Floor (Baby Ghost, Snow Wolf Crew with A•N uniforms over personal
 * outfits, eight Crown-Top scientists across generations, banner, humor).
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
  it('has exactly eight Crown-Top scientists, mixing natural-bald and shaved-stubble crowns', async () => {
    const svg = await open();
    const sci = all(svg, '[data-character="crown-top"]');
    expect(sci).toHaveLength(8);
    const chrome = sci.filter((s) => s.dataset.crown === 'chrome').length;
    const stubble = sci.filter((s) => s.dataset.crown === 'stubble').length;
    expect(chrome + stubble).toBe(8);
    expect(chrome).toBeGreaterThanOrEqual(3);
    expect(stubble).toBeGreaterThanOrEqual(3);
  });

  it('has one younger-generation Crown-Top among veterans, with the same crown-top cut', async () => {
    const svg = await open();
    const sci = all(svg, '[data-character="crown-top"]');
    const young = sci.filter((s) => s.dataset.generation === 'young');
    expect(young).toHaveLength(1);
    expect(sci.filter((s) => s.dataset.generation === 'veteran')).toHaveLength(7);
    expect(['chrome', 'stubble']).toContain(young[0]!.dataset.crown);
  });

  it('draws no cheek blush circles on any scientist', async () => {
    const svg = await open();
    for (const s of all(svg, '[data-character="crown-top"]'))
      for (const c of s.querySelectorAll('circle'))
        expect(['#f87171', '#fca5a5', '#fb7185', '#f9a8d4']).not.toContain(
          c.getAttribute('fill')?.toLowerCase(),
        );
  });

  it('has an individual Snow Wolf Crew: distinct personas incl. Boxer, DJ, Wild Paw and Chuy', async () => {
    const svg = await open();
    const crew = all(svg, '[data-character="snow-wolf"]');
    expect(crew).toHaveLength(8);
    const personas = crew.map((c) => c.dataset.persona);
    expect(new Set(personas).size).toBe(8);
    for (const p of ['boxer', 'dj', 'wild-paw', 'chuy']) expect(personas).toContain(p);
    const boxer = crew.find((c) => c.dataset.persona === 'boxer')!;
    expect(boxer.querySelectorAll('[data-accessory="boxing-glove"]')).toHaveLength(2);
    expect(
      crew.find((c) => c.dataset.persona === 'dj')!.querySelector('[data-accessory="headphones"]'),
    ).toBeTruthy();
    expect(
      crew.find((c) => c.dataset.persona === 'chuy')!.querySelector('[data-accessory="crown"]'),
    ).toBeTruthy();
  });

  it('crew wear the A•N uniform OVER a visible personal outfit', async () => {
    const svg = await open();
    const crew = all(svg, '[data-character="snow-wolf"]');
    for (const c of crew) {
      const personal = c.querySelector('[data-layer="personal"]');
      const uniform = c.querySelector('[data-layer="an-uniform"]');
      expect(personal && uniform).toBeTruthy();
      // The uniform is drawn after (over) the personal layer.
      expect(
        personal!.compareDocumentPosition(uniform!) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(uniform!.textContent).toContain('A•N');
      expect(c.dataset.outfit).not.toBe(c.dataset.uniform);
    }
    // Personal outfits differ: not clones.
    expect(new Set(crew.map((c) => c.dataset.outfit)).size).toBeGreaterThanOrEqual(6);
  });

  it('shows Baby Ghost (decorative, never bound to data)', async () => {
    const svg = await open();
    expect(all(svg, '[data-character="baby-ghost"]').length).toBeGreaterThanOrEqual(2);
    const ghostSpots = [...document.querySelectorAll<HTMLElement>('.vf__hotspot')].filter((b) =>
      b.dataset.station?.startsWith('wisp'),
    );
    expect(ghostSpots.length).toBe(2);
    for (const b of ghostSpots) {
      expect(b.dataset.bound).toBe('false');
      expect(b.getAttribute('aria-label')).toBe('Baby Ghost: decorative, not bound to data');
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
    expect(detail.textContent).toContain('A•N uniform vest worn over it');
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
