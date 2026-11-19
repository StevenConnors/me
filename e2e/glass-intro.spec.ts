import { writeFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';
import { MongoClient, ObjectId } from 'mongodb';

type Doc = { _id: string } & Record<string, unknown>;

test('Glass has a visible introduction and groups photographs by month', async ({ page }) => {
  test.setTimeout(90_000);
  const mongo = new MongoClient(process.env.E2E_MONGODB_URI ?? 'mongodb://127.0.0.1:27018/journey_editor_e2e', { serverSelectionTimeoutMS: 10_000 });
  const mediaIds = Array.from({ length: 3 }, () => new ObjectId().toHexString());
  const collectionId = new ObjectId().toHexString();
  let originalGlass: Doc[] = [];
  let connected = false;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await mongo.connect();
    connected = true;
    const db = mongo.db();
    const collections = db.collection<Doc>('media_collections');
    originalGlass = await collections.find({ name: 'Glass' }).toArray();
    await collections.deleteMany({ name: 'Glass' });
    const dates = [
      { captureDate: '2024-10-05', createdAt: new Date('2024-12-01T00:00:00Z') },
      { captureDate: '2024-10-19', createdAt: new Date('2024-12-01T00:00:00Z') },
      { createdAt: new Date('2024-11-20T00:00:00Z') },
    ];
    await db.collection<Doc>('media_assets').insertMany(mediaIds.map((id, index) => ({
      _id: id, schemaVersion: 1, provider: 'cloudinary', providerAssetId: `e2e-${id}`, providerPublicId: `e2e/${id}`,
      resourceType: 'image', deliveryType: 'upload', version: 1, originalFilename: `glass-intro-${id}.jpg`,
      format: 'jpg', width: 900, height: 1600, bytes: 100, checksum: `e2e-${id}`, tags: [], altText: `Glass piece ${index + 1}`,
      status: 'ready', updatedAt: new Date(), ...dates[index],
    })));
    await collections.insertOne({ _id: collectionId, schemaVersion: 1, name: 'Glass', mediaAssetIds: mediaIds, createdAt: new Date(), updatedAt: new Date() });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/glass');
    await expect(page.getByRole('heading', { level: 1, name: 'Glass' })).toBeVisible();
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('[data-gallery-intro]')).toBeVisible();
    const october = page.getByRole('region', { name: 'October 2024' });
    const november = page.getByRole('region', { name: 'November 2024' });
    await expect(october.getByRole('heading', { level: 2 })).toContainText('2 photos');
    await expect(november.getByRole('heading', { level: 2 })).toContainText('1 photo');
    await expect(october.getByAltText('Glass piece 2')).toBeAttached();
    await expect(november.getByAltText('Glass piece 3')).toBeAttached();

    await october.getByRole('button', { name: 'Open photo 2' }).click();
    await expect(page.getByRole('dialog', { name: 'Glass, 2 of 3' })).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('dialog', { name: 'Glass, 3 of 3' })).toBeVisible();
    await page.keyboard.press('Escape');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/glass');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await test.info().attach('e2e-fixture-glass-intro-mobile.png', { body: await page.screenshot(), contentType: 'image/png' });
    const resultPath = test.info().outputPath('e2e-fixture-glass-intro-result.json');
    await writeFile(resultPath, JSON.stringify({ collectionId, mediaIds, overflow }, null, 2));
    await test.info().attach('e2e-fixture-glass-intro-result.json', { path: resultPath, contentType: 'application/json' });
    expect(errors).toEqual([]);
  } finally {
    if (connected) {
      const db = mongo.db();
      await db.collection<Doc>('media_collections').deleteOne({ _id: collectionId });
      if (originalGlass.length) await db.collection<Doc>('media_collections').insertMany(originalGlass);
      await db.collection<Doc>('media_assets').deleteMany({ _id: { $in: mediaIds } });
      await mongo.close();
    }
  }
});
