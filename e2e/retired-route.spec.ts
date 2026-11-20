import { expect, test } from '@playwright/test';

test('retired routes return 404 and remaining navigation works', async ({ page, request }) => {
  for (const path of ['/thoughts-aloud', '/api/thoughts']) {
    expect((await request.get(path)).status()).toBe(404);
  }
  expect((await request.post('/api/thoughts', { data: { text: 'Not stored' } })).status()).toBe(404);

  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const path of ['/', '/concepts/margin', '/concepts/field-notes', '/concepts/afterimage']) {
      expect((await page.goto(path))?.status()).toBe(200);
      await expect(page.locator('a[href="/thoughts-aloud"]')).toHaveCount(0);
      await expect(page.locator('a[href="/photos"], a[href="/gallery"]').first()).toBeVisible();
    }
  }
  await test.info().attach('e2e-fixture-retired-route-mobile.png', { body: await page.screenshot(), contentType: 'image/png' });
  await test.info().attach('e2e-fixture-retired-route-result.json', { body: JSON.stringify({ errors }), contentType: 'application/json' });
  expect(errors).toEqual([]);
});
