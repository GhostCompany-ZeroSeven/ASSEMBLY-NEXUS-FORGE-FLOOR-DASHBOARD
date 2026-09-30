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
