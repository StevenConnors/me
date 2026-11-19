import { expect, test } from '@playwright/test';

const sampleImage = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+9+vWAAAAAElFTkSuQmCC',
  'base64',
);

test('the media library uploads, organizes, finds, and reuses one original', async ({ page }) => {
  test.setTimeout(90_000);
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
  const filename = `library-${suffix}.png`;
  const title = `Library coast ${suffix}`;
  const collectionName = `Coast ${suffix}`;
  let mediaId: string | undefined;
  let collectionId: string | undefined;
  const finalizationBodies: string[] = [];
  const errors: string[] = [];
  let providerRequests = 0;
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('503')) errors.push(message.text());
  });
  page.on('request', (request) => {
    if (request.url().includes('/api/e2e/media-upload')) providerRequests++;
  });
  await page.route('**/api/admin/media/finalize', async (route) => {
    finalizationBodies.push(route.request().postData() ?? '');
    const response = await route.fetch();
    if (finalizationBodies.length === 1) {
      expect(response.ok()).toBe(true);
      mediaId = (await response.json()).media._id;
      await route.fulfill({ status: 503, json: { error: { message: 'Lost finalization response' } } });
    } else await route.fulfill({ response });
  });

  try {
    await page.goto('/admin/media');
    await expect(page.getByRole('heading', { name: 'Media' })).toBeVisible();

    const finalizeResponse = page.waitForResponse((response) =>
      response.url().endsWith('/api/admin/media/finalize') && response.request().method() === 'POST' && response.ok(),
    );
    await page.locator('input[type=file]').first().setInputFiles({
      name: filename,
      mimeType: 'image/png',
      buffer: sampleImage,
    });
    const finalized = await finalizeResponse;
    expect(finalized.ok()).toBe(true);
    expect((await finalized.json()).media._id).toBe(mediaId);
    expect(finalizationBodies).toHaveLength(2);
    expect(finalizationBodies[1]).toBe(finalizationBodies[0]);
    expect(providerRequests).toBe(1);

    const item = page.locator('article').filter({ has: page.locator(`#media-date-${mediaId}`) });
    await expect(item).toBeVisible();
    await test.info().attach('e2e-fixture-finalization-retry.png', { body: await page.screenshot(), contentType: 'image/png' });
    await test.info().attach('e2e-fixture-finalization-retry.json', {
      body: JSON.stringify({ mediaId, providerRequests, finalizationAttempts: finalizationBodies.length }), contentType: 'application/json',
    });
    await item.locator('summary').click();
    await item.getByLabel('Display title').fill(title);
    await item.getByLabel('Date taken').fill('2024-04-18');
    await item.getByRole('button', { name: 'Save media details' }).click();
    await expect(item.getByText('Saved', { exact: true })).toBeVisible();

    await page.getByRole('searchbox', { name: 'Search media' }).fill(title);
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(item).toBeVisible();

    await page.getByRole('textbox', { name: 'New collection name' }).fill(collectionName);
    const collectionResponse = page.waitForResponse((response) =>
      response.url().endsWith('/api/admin/collections') && response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Create collection' }).click();
    const created = await collectionResponse;
    expect(created.ok()).toBe(true);
    collectionId = (await created.json() as { collection: { _id: string } }).collection._id;
    await expect(page.getByLabel('Filter by collection')).toHaveValue('');
    await expect(item).toBeVisible();

    await item.getByRole('checkbox', { name: 'Select sample-image.png' }).check();
    await page.getByLabel('Add selected to collection').selectOption(collectionId);
    await page.getByRole('button', { name: 'Add to collection' }).click();
    await expect(page.getByText('1 asset added to collection.')).toBeVisible();
    await expect(item.getByRole('button', { name: `Remove from ${collectionName}` })).toBeVisible();

    await page.getByLabel('Filter by collection').selectOption(collectionId);
    await expect(item).toBeVisible();
    await page.reload();
    await page.getByLabel('Filter by collection').selectOption(collectionId);
    await expect(item).toBeVisible();
    await item.locator('summary').click();
    await expect(item.getByLabel('Date taken')).toHaveValue('2024-04-18');
    await item.getByRole('button', { name: `Remove from ${collectionName}` }).click();
    await expect(page.getByText('No matching media. Upload media or change your filters.')).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    if (collectionId) await page.request.delete(`/api/admin/collections/${collectionId}`);
    if (mediaId) await page.request.delete(`/api/admin/media/${mediaId}`);
  }
});
