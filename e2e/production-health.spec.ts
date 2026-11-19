import { expect, test } from '@playwright/test';

test('health reports a live database without caching', async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toBe('no-store');
  const body = await response.json();
  expect(body).toEqual({
    status: 'healthy',
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    environment: process.env.VERCEL_ENV ?? null,
    checks: { mongodb: 'healthy' },
  });
  await test.info().attach('e2e-fixture-health.json', {
    body: JSON.stringify(body), contentType: 'application/json',
  });
});
