import { describe, expect, it } from 'vitest';
import { href, parseRoute } from './router';

describe('parseRoute', () => {
  it('parses known routes', () => {
    expect(parseRoute('')).toEqual({ name: 'command' });
    expect(parseRoute('#/')).toEqual({ name: 'command' });
    expect(parseRoute('#/floor')).toEqual({ name: 'floor' });
    expect(parseRoute('#/missions/AN-0142')).toEqual({ name: 'mission', id: 'AN-0142' });
    expect(parseRoute('#/workers/w-ada/')).toEqual({ name: 'worker', id: 'w-ada' });
  });
  it('round-trips encoded ids', () => {
    expect(parseRoute(href.mission('a b/c'))).toEqual({ name: 'mission', id: 'a b/c' });
  });
  it('reports unknown paths', () => {
    expect(parseRoute('#/nope')).toEqual({ name: 'not-found', path: '/nope' });
  });
});

import { parseHashQuery, withQuery } from './router';

describe('hash query', () => {
  it('parses routes with queries and extracts the query', () => {
    expect(parseRoute('#/floor?room=build')).toEqual({ name: 'floor' });
    expect(parseRoute('#/missions/AN-1?focus=art-1')).toEqual({ name: 'mission', id: 'AN-1' });
    expect(parseHashQuery('#/floor?room=build&worker=w-a')).toEqual({
      room: 'build',
      worker: 'w-a',
    });
    expect(parseHashQuery('#/floor')).toEqual({});
  });
  it('builds queries and drops empty values', () => {
    expect(withQuery('#/alerts', { focus: 'ALR 7' })).toBe('#/alerts?focus=ALR+7');
    expect(withQuery('#/floor?room=x', { room: undefined })).toBe('#/floor');
  });
});
