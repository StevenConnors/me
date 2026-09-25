import { expect, test } from '@playwright/test';

const sampleImage = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+9+vWAAAAAElFTkSuQmCC',
  'base64',
);

test('the public Glass gallery renders assets referenced by its media collection', async ({ page }) => {
  test.setTimeout(60_000);
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
  const filename = `glass-collection-${suffix}.png`;
  let mediaId: string | undefined;
  let collectionId: string | undefined;
  let createdCollection = false;

  try {
    await page.goto('/admin/media');
    await expect(page.getByRole('heading', { name: 'Media' })).toBeVisible();
    const finalizedResponse = page.waitForResponse((response) =>
      response.url().endsWith('/api/admin/media/finalize') && response.request().method() === 'POST',
    );
    await page.locator('input[type=file]').first().setInputFiles({
      name: filename,
      mimeType: 'image/png',
      buffer: sampleImage,
    });
    const finalized = await finalizedResponse;
    expect(finalized.ok()).toBe(true);
    mediaId = (await finalized.json() as { media: { _id: string } }).media._id;

    const listed = await page.request.get('/api/admin/collections');
    expect(listed.ok()).toBe(true);
    const existing = (await listed.json() as { collections: Array<{ _id: string; name: string }> })
      .collections.find((collection) => collection.name === 'Glass');
    if (existing) {
      collectionId = existing._id;
    } else {
      const created = await page.request.post('/api/admin/collections', { data: { name: 'Glass' } });
      expect(created.status()).toBe(201);
      collectionId = (await created.json() as { collection: { _id: string } }).collection._id;
      createdCollection = true;
    }

    const added = await page.request.post(`/api/admin/collections/${collectionId}/media`, {
      data: { mediaAssetIds: [mediaId] },
    });
    expect(added.ok()).toBe(true);
    const { collection } = await added.json() as { collection: { mediaAssetIds: string[] } };

    await page.goto('/glass');
    await expect(page.getByRole('button', { name: /^Open photo \d+$/ })).toHaveCount(collection.mediaAssetIds.length);
  } finally {
    if (collectionId && mediaId) {
      await page.request.delete(`/api/admin/collections/${collectionId}/media`, {
        data: { mediaAssetIds: [mediaId] },
      });
    }
    if (createdCollection && collectionId) await page.request.delete(`/api/admin/collections/${collectionId}`);
    if (mediaId) await page.request.delete(`/api/admin/media/${mediaId}`);
  }
});
