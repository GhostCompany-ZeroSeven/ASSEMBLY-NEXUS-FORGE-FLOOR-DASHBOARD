import { describe, expect, it } from 'vitest';
import { buildSeedSnapshot } from '@/adapters/demo/seed';
import { assemblyNexusConfig } from '@/config/assemblyNexus.config';
import { buildSearchIndex, searchIndex } from './search';

const snap = buildSeedSnapshot(Date.parse('2026-09-30T12:00:00Z'));
const index = buildSearchIndex(snap, assemblyNexusConfig.floor);
const find = (q: string) => searchIndex(index, q);

describe('global search', () => {
  it('covers every entity type', () => {
    const types = new Set(index.map((e) => e.type));
    expect([...types].sort()).toEqual([
      'alert',
      'approval',
      'artifact',
      'event',
      'mission',
      'room',
      'worker',
    ]);
  });

  it('every result states type, title, status, surface and a target', () => {
    for (const r of find('a')) {
      expect(r.type && r.title && r.status && r.surface && r.href).toBeTruthy();
    }
  });

  it('exact id wins', () => {
    expect(find('AN-0142')[0]).toMatchObject({
      type: 'mission',
      id: 'AN-0142',
      href: '#/missions/AN-0142',
    });
    expect(find('APR-031')[0]).toMatchObject({
      type: 'approval',
      href: '#/approvals?focus=APR-031',
    });
    expect(find('ALR-007')[0]).toMatchObject({ type: 'alert', href: '#/alerts?focus=ALR-007' });
  });

  it('finds workers by name or role with their room and mission as context', () => {
    const r = find('security warden')[0]!;
    expect(r).toMatchObject({ type: 'worker', id: 'w-cyrus', status: 'Waiting' });
    expect(r.context).toMatch(/AN-0144/);
    expect(r.context).toMatch(/Founder Gate/);
  });

  it('finds rooms with occupancy and deep-links to the floor', () => {
    const r = find('build forge')[0]!;
    expect(r).toMatchObject({
      type: 'room',
      id: 'build',
      surface: 'Forge Floor',
      href: '#/floor?room=build',
    });
    expect(r.status).toMatch(/\d+ workers?/);
  });

  it('finds artifacts with their producing mission and worker', () => {
    const r = find('telemetry-schema')[0]!;
    expect(r).toMatchObject({ type: 'artifact', href: '#/missions/AN-0142?focus=art-0142-1' });
    expect(r.context).toMatch(/Ada Sprocket/);
  });

  it('finds events and links to the activity stream', () => {
    const r = find('approval requested').find((x) => x.type === 'event')!;
    expect(r.href).toMatch(/^#\/activity\?focus=/);
  });

  it('all terms must match; empty query returns nothing', () => {
    expect(find('cyrus zzzz')).toHaveLength(0);
    expect(find('   ')).toHaveLength(0);
  });
});
