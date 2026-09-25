import { expect, test } from '@playwright/test';

const sampleImage = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+9+vWAAAAAElFTkSuQmCC',
  'base64',
);

test('an author can organize media in ordered reusable collections', async ({ page }) => {
  test.setTimeout(60_000);
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
  let collectionId: string | undefined;
  const mediaIds: string[] = [];

  try {
    await page.goto('/admin/media');
    await expect(page.getByRole('heading', { name: 'Media' })).toBeVisible();
    for (let index = 1; index <= 2; index += 1) {
      const finalizedResponse = page.waitForResponse((response) =>
        response.url().endsWith('/api/admin/media/finalize') && response.request().method() === 'POST',
      );
      await page.locator('input[type=file]').setInputFiles({
        name: `collection-${suffix}-${index}.png`,
        mimeType: 'image/png',
        buffer: sampleImage,
      });
      const finalized = await finalizedResponse;
      expect(finalized.ok()).toBe(true);
      mediaIds.push(((await finalized.json()) as { media: { _id: string } }).media._id);
    }

    const created = await page.request.post('/api/admin/collections', {
      data: { name: `Trip ${suffix}`, description: 'A reusable album of photographs' },
    });
    expect(created.status()).toBe(201);
    const { collection } = await created.json() as { collection: { _id: string } };
    collectionId = collection._id;
    const duplicate = await page.request.post('/api/admin/collections', { data: { name: `Trip ${suffix}` } });
    expect(duplicate.status()).toBe(409);

    const added = await page.request.post(`/api/admin/collections/${collectionId}/media`, {
      data: { mediaAssetIds: mediaIds },
    });
    expect(added.ok()).toBe(true);
    const reordered = await page.request.patch(`/api/admin/collections/${collectionId}/media`, {
      data: { mediaAssetIds: [...mediaIds].reverse() },
    });
    expect(reordered.ok()).toBe(true);

    const updated = await page.request.patch(`/api/admin/collections/${collectionId}`, {
      data: { description: 'Reviewed and ready to reuse' },
    });
    expect(updated.ok()).toBe(true);
    const fetched = await page.request.get(`/api/admin/collections/${collectionId}`);
    expect(fetched.ok()).toBe(true);
    const result = await fetched.json() as { collection: { description?: string; mediaAssetIds: string[] } };
    expect(result.collection.description).toBe('Reviewed and ready to reuse');
    expect(result.collection.mediaAssetIds).toEqual([...mediaIds].reverse());

    const removed = await page.request.delete(`/api/admin/collections/${collectionId}/media`, {
      data: { mediaAssetIds: [mediaIds[0]] },
    });
    expect(removed.ok()).toBe(true);
    const deleted = await page.request.delete(`/api/admin/collections/${collectionId}`);
    expect(deleted.ok()).toBe(true);
    collectionId = undefined;
  } finally {
    if (collectionId) await page.request.delete(`/api/admin/collections/${collectionId}`);
    for (const mediaId of mediaIds) await page.request.delete(`/api/admin/media/${mediaId}`);
  }
});
