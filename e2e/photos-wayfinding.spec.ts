import { writeFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';
import { MongoClient, ObjectId } from 'mongodb';

test('photo sections show counts and the section navigation stays on screen', async ({ page }) => {
  test.setTimeout(120_000);
  const mongo = new MongoClient(process.env.E2E_MONGODB_URI ?? 'mongodb://127.0.0.1:27018/journey_editor_e2e', { serverSelectionTimeoutMS: 10_000 });
  const runId = new ObjectId().toHexString();
  const mediaIds = Array.from({ length: 26 }, () => new ObjectId().toHexString());
  const firstSectionId = new ObjectId().toHexString();
  const laterSectionId = new ObjectId().toHexString();
  let originalPhotosPage: Record<string, unknown> | null = null;
  let connected = false;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await mongo.connect();
    connected = true;
    const db = mongo.db();
    const now = new Date();
    originalPhotosPage = await db.collection('photos_pages').findOne({ _id: 'photos' as never }) as Record<string, unknown> | null;
    await db.collection<{ _id: string } & Record<string, unknown>>('media_assets').insertMany(mediaIds.map((id, index) => ({
      _id: id, schemaVersion: 1, provider: 'cloudinary', providerAssetId: `e2e-${id}`, providerPublicId: `e2e/${id}`,
      resourceType: 'image', deliveryType: 'upload', version: 1, originalFilename: `photos-wayfinding-${runId}-${index}.jpg`,
      format: 'jpg', width: 400, height: 300, bytes: 100, checksum: `e2e-${id}`, tags: [], altText: `Wayfinding photo ${index + 1}`,
      showInPhotos: true, status: 'ready', createdAt: new Date(now.getTime() + index), updatedAt: now,
    })));
    const photosDocument = { schemaVersion: 1, blocks: [
      { id: firstSectionId, type: 'section', title: 'First light' },
      ...mediaIds.flatMap((id, index) => [
        ...(index === 25 ? [{ id: laterSectionId, type: 'section', title: 'Last light' }] : []),
        { id: new ObjectId().toHexString(), type: 'media', mediaAssetId: id, decorative: false, altText: `Wayfinding photo ${index + 1}` },
      ]),
    ] };
    await db.collection<{ _id: string } & Record<string, unknown>>('photos_pages').replaceOne({ _id: 'photos' }, {
      _id: 'photos', schemaVersion: 1, draftDocument: photosDocument, draftVersion: 1, publishedDocument: photosDocument, createdAt: now, updatedAt: now, publishedAt: now,
    }, { upsert: true });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/photos');
    const nav = page.getByRole('navigation', { name: 'Photo sections' });
    await expect(nav.getByRole('link', { name: /First light/ })).toContainText('25');
    await expect(nav.getByRole('link', { name: /Last light/ })).toContainText('1');
    await expect(page.getByRole('region', { name: 'First light' })).toContainText('25 photos');

    await page.mouse.wheel(0, 2500);
    await expect.poll(async () => (await nav.boundingBox())?.y ?? -1).toBeGreaterThanOrEqual(0);
    const stuck = await nav.boundingBox();
    expect(stuck!.y).toBeLessThan(80);

    await nav.getByRole('link', { name: /Last light/ }).click();
    const lastRegion = page.getByRole('region', { name: 'Last light' });
    await expect(lastRegion).toContainText('1 photo');
    const heading = lastRegion.getByRole('heading', { level: 2 });
    await expect(heading).toBeInViewport();
    const navBox = await nav.boundingBox();
    expect((await heading.boundingBox())!.y).toBeGreaterThanOrEqual(navBox!.y + navBox!.height - 1);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/photos');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await test.info().attach('e2e-fixture-photos-wayfinding-mobile.png', { body: await page.screenshot(), contentType: 'image/png' });
    const resultPath = test.info().outputPath('e2e-fixture-photos-wayfinding-result.json');
    await writeFile(resultPath, JSON.stringify({ runId, stuck, navBox, overflow }, null, 2));
    await test.info().attach('e2e-fixture-photos-wayfinding-result.json', { path: resultPath, contentType: 'application/json' });
    expect(errors).toEqual([]);
  } finally {
    if (connected) {
      const db = mongo.db();
      await db.collection<{ _id: string }>('media_assets').deleteMany({ _id: { $in: mediaIds } });
      if (originalPhotosPage) await db.collection('photos_pages').replaceOne({ _id: 'photos' as never }, originalPhotosPage);
      else await db.collection<{ _id: string }>('photos_pages').deleteOne({ _id: 'photos' });
      await mongo.close();
    }
  }
});
