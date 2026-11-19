import { describe, expect, it } from 'vitest';

import { smoke } from '../../scripts/smoke/production.mjs';

const health = () => Response.json({ status: 'healthy', checks: { mongodb: 'healthy' }, commit: 'abc' });
const pause: typeof import('node:timers/promises').setTimeout = async <T,>(_delay?: number, value?: T) => value as T;

describe('production smoke', () => {
  it('passes all public routes and retries a cold start', async () => {
    let calls = 0;
    const results = await smoke('http://localhost', 'abc', {
      pause,
      fetcher: async (input: string | URL | Request) => {
        const url = new URL(input instanceof Request ? input.url : input);
        if (calls++ === 0) throw new Error('cold start');
        return url.pathname === '/api/health' ? health() : new Response('<html>OK</html>');
      },
    });
    expect(results.map((row: { result: string }) => row.result)).toEqual(Array(5).fill('PASS'));
    expect(calls).toBe(6);
  });

  it.each([
    ['commit mismatch', () => health(), 'wrong'],
    ['HTTP 503', () => new Response('', { status: 503 }), undefined],
    ['Unexpected end of JSON input', () => new Response(''), undefined],
  ])('fails health: %s', async (detail, fetcher, sha) => {
    const results = await smoke('http://localhost', sha, { pause, fetcher: async () => fetcher() });
    expect(results[0]).toMatchObject({ result: 'FAIL', detail });
  });

  it('rejects Next error HTML even with HTTP 200 and continues all routes', async () => {
    const results = await smoke('http://localhost', undefined, {
      pause,
      fetcher: async (input: string | URL | Request) => new URL(input instanceof Request ? input.url : input).pathname === '/api/health'
        ? health() : new Response('<html id="__next_error__">error</html>'),
    });
    expect(results).toHaveLength(5);
    expect(results[0].result).toBe('PASS');
    expect(results.slice(1).every((row: { result: string }) => row.result === 'FAIL')).toBe(true);
  });
});
