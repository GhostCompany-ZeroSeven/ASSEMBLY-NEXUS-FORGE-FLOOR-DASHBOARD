import { describe, expect, it } from 'vitest';
import { assemblyNexusConfig } from '@/config/assemblyNexus.config';
import { allStrings } from '@/test/i18nStrings';
import { en } from './en';
import { PSEUDO_CLOSE, PSEUDO_OPEN, pseudoConfig, pseudoMessages, pseudoText } from './pseudo';

describe('pseudo-locale', () => {
  const p = pseudoMessages();

  it('has exactly the English catalog shape', () => {
    const shape = (v: unknown): unknown =>
      typeof v === 'function'
        ? `fn${(v as () => void).length}`
        : v && typeof v === 'object'
          ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shape(x)]))
          : typeof v;
    expect(shape(p)).toEqual(shape(en));
  });

  it('accents every letter, pads and wraps', () => {
    const s = pseudoText('Approval Gates');
    expect(s.startsWith(PSEUDO_OPEN) && s.endsWith(PSEUDO_CLOSE)).toBe(true);
    expect(s).not.toMatch(/[A-Za-z]{2}/);
    expect(s.length).toBeGreaterThan('Approval Gates'.length * 1.4);
    expect(pseudoText('—')).toBe('—');
  });

  it('leaves no plain-ASCII words in any message', () => {
    for (const s of allStrings(p)) {
      const own = s.replace(/X/g, '');
      expect(own, s).not.toMatch(/[A-Za-z]{2,}/);
    }
  });

  it('interpolated values stay exact: ids, names and the authority are never altered', () => {
    expect(p.situation.needs('Founder #0007')).toContain('Founder #0007');
    expect(p.nav.home('Assembly Nexus', 'Forge Floor')).toContain('Assembly Nexus Forge Floor');
    expect(p.brief.figure.needsFounder('Founder #0007')).toContain('Founder #0007');
    // Numbers pass through and plurals still follow the English rules.
    expect(p.common.more(3)).toContain('+3');
  });

  it('config display text is pseudo-localized; ids and authority are not', () => {
    const c = pseudoConfig(assemblyNexusConfig);
    expect(c.floor.rooms[0]!.label).toContain(PSEUDO_OPEN);
    expect(c.floor.rooms[0]!.id).toBe(assemblyNexusConfig.floor.rooms[0]!.id);
    expect(c.governance.humanAuthority).toBe('Founder #0007');
    expect(c.branding).toEqual(assemblyNexusConfig.branding);
  });
});
