import { expect, test } from '@playwright/test';

test('Retry restores collections after the collections request fails', async ({ page }) => {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
  const collectionName = `Retry ${suffix}`;
  let collectionId: string | undefined;
  let collectionRequests = 0;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('503')) errors.push(message.text());
  });
  await page.route('**/api/admin/collections', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    collectionRequests += 1;
    if (collectionRequests <= 2) {
      return route.fulfill({ status: 503, json: { error: { message: 'Collections are temporarily unavailable' } } });
    }
    return route.continue();
  });

  try {
    const created = await page.request.post('/api/admin/collections', { data: { name: collectionName } });
    expect(created.status()).toBe(201);
    collectionId = (await created.json() as { collection: { _id: string } }).collection._id;

    await page.goto('/admin/media');
    const alert = page.getByRole('alert').filter({ has: page.getByRole('button', { name: 'Retry' }) });
    const collectionFilter = page.getByLabel('Filter by collection');
    const collectionOption = collectionFilter.getByRole('option', { name: collectionName });
    await expect(alert).toContainText('Collections are temporarily unavailable');
    await expect(collectionOption).toHaveCount(0);
    await test.info().attach('e2e-fixture-collections-failed.png', { body: await page.screenshot(), contentType: 'image/png' });

    await alert.getByRole('button', { name: 'Retry' }).click();
    await expect.poll(() => collectionRequests).toBe(2);
    await expect(alert).toContainText('Collections are temporarily unavailable');
    await expect(collectionOption).toHaveCount(0);

    await alert.getByRole('button', { name: 'Retry' }).click();
    await expect(alert).toBeHidden();
    await expect(collectionOption).toHaveCount(1);
    await collectionFilter.selectOption(collectionId);
    await expect(collectionFilter).toHaveValue(collectionId);
    expect(collectionRequests).toBe(3);
    await test.info().attach('e2e-fixture-collections-retried.png', { body: await page.screenshot(), contentType: 'image/png' });
    await test.info().attach('e2e-fixture-collections-retry.json', {
      body: JSON.stringify({ collectionRequests, collectionVisibleAfterRetry: true }), contentType: 'application/json',
    });
    expect(errors).toEqual([]);
  } finally {
    if (collectionId) await page.request.delete(`/api/admin/collections/${collectionId}`);
  }
});

test('Retry reloads media after the media request fails', async ({ page }) => {
  let mediaRequests = 0;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('503')) errors.push(message.text());
  });
  await page.route('**/api/admin/media?*', async (route) => {
    mediaRequests += 1;
    if (mediaRequests === 1) return route.fulfill({ status: 503, json: { error: { message: 'Media is temporarily unavailable' } } });
    return route.continue();
  });

  await page.goto('/admin/media');
  const alert = page.getByRole('alert').filter({ has: page.getByRole('button', { name: 'Retry' }) });
  await expect(alert).toContainText('Media is temporarily unavailable');
  await alert.getByRole('button', { name: 'Retry' }).click();
  await expect(alert).toBeHidden();
  await expect(page.getByText(/\d+ assets? in this view/)).toBeVisible();
  expect(mediaRequests).toBe(2);
  expect(errors).toEqual([]);
});
