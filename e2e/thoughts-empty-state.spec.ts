import { expect, test } from '@playwright/test';
import { MongoClient } from 'mongodb';

test('successful empty feed is quiet at desktop and mobile widths', async ({ page }, testInfo) => {
  const mongo = new MongoClient(process.env.E2E_MONGODB_URI ?? 'mongodb://127.0.0.1:27018/journey_editor_e2e');
  await mongo.connect();
  const collection = mongo.db().collection('thoughts');
  const original = await collection.find().toArray();
  try {
    await collection.deleteMany({});
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });

    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const response = page.waitForResponse(response => response.url().includes('/api/thoughts?'));
      await page.goto('/thoughts-aloud');
      expect((await response).status()).toBe(200);
      await expect(page.getByText('Loading…', { exact: true })).toHaveCount(0);
      await expect(page.getByText('Nothing here yet.', { exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      await testInfo.attach(`e2e-fixture-thoughts-empty-${width}.png`, {
        body: await page.screenshot({ fullPage: true }), contentType: 'image/png',
      });
    }
    expect(errors).toEqual([]);
    await testInfo.attach('e2e-fixture-thoughts-empty.json', {
      body: JSON.stringify({ widths: [1440, 390], errors }), contentType: 'application/json',
    });
  } finally {
    if (original.length) await collection.insertMany(original);
    await mongo.close();
  }
});

test('loading, failed and populated feeds do not show the empty line', async ({ page }) => {
  let release: () => void = () => {};
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/thoughts?*', async route => {
    await pending;
    await route.fulfill({ status: 503, json: { error: 'Unavailable' } });
  });
  await page.goto('/thoughts-aloud');
  await expect(page.getByText('Loading…', { exact: true })).toBeVisible();
  await expect(page.getByText('Nothing here yet.', { exact: true })).toHaveCount(0);
  release();
  await expect(page.getByText('Loading…', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Nothing here yet.', { exact: true })).toHaveCount(0);

  await page.unroute('**/api/thoughts?*');
  await page.route('**/api/thoughts?*', route => route.fulfill({ json: {
    data: [{ _id: 'fixture', text: 'A thought for today.', createdAt: '2026-01-01T12:00:00Z' }],
    nextCursor: null,
  } }));
  await page.reload();
  await expect(page.getByText('A thought for today.', { exact: true })).toBeVisible();
  await expect(page.getByText('Nothing here yet.', { exact: true })).toHaveCount(0);
});
