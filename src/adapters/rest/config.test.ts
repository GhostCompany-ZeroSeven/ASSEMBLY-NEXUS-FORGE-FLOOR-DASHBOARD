import { describe, expect, it } from 'vitest';
import { resolveRestConfig, RestConfigError } from './config';

describe('resolveRestConfig', () => {
  it('accepts absolute http(s) URLs and same-origin paths', () => {
    expect(resolveRestConfig({ baseUrl: 'https://ops.example.com/api/' }).baseUrl).toBe(
      'https://ops.example.com/api',
    );
    expect(resolveRestConfig({ baseUrl: '/api/forge' }).baseUrl).toBe('/api/forge');
  });

  it.each([
    ['', /required/],
    ['javascript:alert(1)', /http or https/],
    ['ftp://x.test', /http or https/],
    ['//evil.test', /not a valid URL/],
    ['https://user:pass@x.test', /must not contain credentials/],
    ['https://x.test/api?token=abc', /secret-looking/],
    ['https://x.test/api?api_key=abc', /secret-looking/],
  ])('rejects unsafe baseUrl %s', (baseUrl, msg) => {
    expect(() => resolveRestConfig({ baseUrl })).toThrow(RestConfigError);
    expect(() => resolveRestConfig({ baseUrl })).toThrow(msg);
  });

  it('rejects unsafe endpoints and credential modes', () => {
    expect(() => resolveRestConfig({ baseUrl: '/api', endpoints: { workers: 'workers' } })).toThrow(
      /must be a path/,
    );
    expect(() =>
      resolveRestConfig({ baseUrl: '/api', endpoints: { workers: '//x.test/w' } }),
    ).toThrow(/must be a path/);
    expect(() =>
      resolveRestConfig({ baseUrl: '/api', endpoints: { health: '/h?secret=1' } }),
    ).toThrow(/secret-looking/);
    expect(() =>
      resolveRestConfig({ baseUrl: '/api', credentials: 'include' as unknown as 'omit' }),
    ).toThrow(/credentials/);
  });

  it('clamps timing and derives staleness', () => {
    const c = resolveRestConfig({ baseUrl: '/api', pollIntervalMs: 10, requestTimeoutMs: 999_999 });
    expect(c.pollIntervalMs).toBe(1000);
    expect(c.requestTimeoutMs).toBe(60_000);
    expect(c.staleAfterMs).toBe(3000);
    expect(c.credentials).toBe('omit');
  });

  it('enables decisions/acknowledgement only when endpoints are configured', () => {
    const c = resolveRestConfig({ baseUrl: '/api' });
    expect(c.endpoints.decide).toBeUndefined();
    expect(c.endpoints.acknowledge).toBeUndefined();
  });
});
