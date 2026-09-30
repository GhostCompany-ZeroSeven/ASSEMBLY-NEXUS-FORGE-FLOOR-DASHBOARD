import { describe, expect, it } from 'vitest';
import { buildSeedSnapshot } from '@/adapters/demo/seed';
import { assemblyNexusConfig } from '@/config/assemblyNexus.config';
import { describeEvent } from '@/domain/describe';
import {
  ALERT_SEVERITY_META,
  APPROVAL_STATUS_META,
  HEALTH_STATUS_META,
  MISSION_STATUS_META,
  REVIEW_STATUS_META,
  WORKER_STATE_META,
} from '@/domain/status';
import { en } from './en';
import { es } from './es';
import { formatDurationIn, formatRelativeIn, localizeConfig } from './format';
import { allStrings } from '@/test/i18nStrings';
import { browserLocale, isLocalePreference, resolveLocale } from './locales';

type Tree = Record<string, unknown>;

/** Every key path in a catalog, with the kind of value found there. */
function shape(obj: Tree, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') Object.assign(out, shape(v as Tree, path));
    else out[path] = typeof v === 'function' ? `fn/${(v as () => unknown).length}` : typeof v;
  }
  return out;
}

describe('catalogs', () => {
  it('Spanish has exactly the same keys (and function arities) as English', () => {
    expect(shape(es as unknown as Tree)).toEqual(shape(en as unknown as Tree));
  });

  it('no message is empty in either language', () => {
    for (const [name, m] of [
      ['en', en],
      ['es', es],
    ] as const) {
      const empty = allStrings(m).filter((s) => s.trim() === '');
      expect(empty, name).toEqual([]);
    }
  });

  it('status labels are keyed by the domain enum values, never by display text', () => {
    // The key set is the machine vocabulary; only values differ per language.
    expect(Object.keys(es.status.worker)).toEqual(Object.keys(en.status.worker));
    expect(Object.keys(es.decision.label)).toEqual(['APPROVE', 'DENY', 'HOLD']);
    expect(es.decision.label.APPROVE).not.toBe('APPROVE');
  });
});

describe('English catalog stays identical to the domain status labels', () => {
  const pick = (meta: Record<string, { label: string }>) =>
    Object.fromEntries(Object.entries(meta).map(([k, v]) => [k, v.label]));
  it('labels and worker descriptions match exactly (no accidental copy changes)', () => {
    expect(en.status.worker).toEqual(pick(WORKER_STATE_META));
    expect(en.status.workerDescription).toEqual(
      Object.fromEntries(Object.entries(WORKER_STATE_META).map(([k, v]) => [k, v.description])),
    );
    expect(en.status.mission).toEqual(pick(MISSION_STATUS_META));
    expect(en.status.review).toEqual(pick(REVIEW_STATUS_META));
    expect(en.status.approval).toEqual(pick(APPROVAL_STATUS_META));
    expect(en.status.severity).toEqual(pick(ALERT_SEVERITY_META));
    expect(en.status.health).toEqual(pick(HEALTH_STATUS_META));
  });
});

describe('locale resolution', () => {
  it('browser language is only an initial preference; unsupported falls back to English', () => {
    expect(browserLocale(['es-MX', 'en'])).toBe('es');
    expect(browserLocale(['fr-FR', 'de'])).toBe('en');
    expect(browserLocale([])).toBe('en');
    expect(resolveLocale('auto', ['es-ES'])).toBe('es');
    expect(resolveLocale('en', ['es-ES'])).toBe('en'); // explicit choice wins
  });

  it('rejects unknown locale values', () => {
    expect(isLocalePreference('es')).toBe(true);
    expect(isLocalePreference('auto')).toBe(true);
    expect(isLocalePreference('xx')).toBe(false);
    expect(isLocalePreference(undefined)).toBe(false);
    expect(isLocalePreference('__proto__')).toBe(false);
  });
});

describe('formatting', () => {
  it('relative time and durations per language', () => {
    const now = Date.parse('2026-09-30T12:00:00Z');
    const t = new Date(now - 18 * 60_000).toISOString();
    expect(formatRelativeIn(en, t, now)).toBe('18m ago');
    expect(formatRelativeIn(es, t, now)).toBe('hace 18min');
    expect(formatDurationIn(es, 3 * 3_600_000 + 4 * 60_000)).toBe('3h 04min');
    expect(formatRelativeIn(es, 'not-a-date', now)).toBe('desconocido');
  });

  it('event descriptions are rendered per language from language-free event data', () => {
    const s = buildSeedSnapshot(Date.parse('2026-09-30T12:00:00Z'));
    const e = s.events.find((x) => x.kind === 'approval.requested')!;
    expect(describeEvent(e, s, en).title).toBe('Approval requested');
    expect(describeEvent(e, s, es).title).toBe('Aprobación solicitada');
    // Backend text (the request title) is never translated.
    expect(describeEvent(e, s, es).detail).toBe(describeEvent(e, s, en).detail);
  });
});

describe('config localization', () => {
  it('changes display text only; ids, kinds, routes and authority are untouched', () => {
    const c = localizeConfig(assemblyNexusConfig, 'es');
    const gate = c.floor.rooms.find((r) => r.id === 'founder-gate')!;
    expect(gate.label).toBe('Puerta del Founder');
    expect(c.floor.rooms.map((r) => r.id)).toEqual(
      assemblyNexusConfig.floor.rooms.map((r) => r.id),
    );
    expect(c.floor.rooms.map((r) => r.kind)).toEqual(
      assemblyNexusConfig.floor.rooms.map((r) => r.kind),
    );
    expect(c.floor.stateRoutes).toEqual(assemblyNexusConfig.floor.stateRoutes);
    expect(c.floor.approvalRoomId).toBe(assemblyNexusConfig.floor.approvalRoomId);
    expect(c.governance).toBe(assemblyNexusConfig.governance);
    expect(c.governance.humanAuthority).toBe('Founder #0007');
    expect(localizeConfig(assemblyNexusConfig, 'en')).toBe(assemblyNexusConfig);
  });
});
