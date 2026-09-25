import { writeFile } from 'node:fs/promises';

import { MongoClient, ObjectId } from 'mongodb';
import { expect, test } from '@playwright/test';

test('admin analytics shows its setup state and ranks actual grid photo opens', async ({ page }) => {
  const photoId = new ObjectId().toHexString();
  const testPhotoId = new ObjectId().toHexString();
  const mongo = new MongoClient(
    process.env.E2E_MONGODB_URI ?? 'mongodb://127.0.0.1:27018/journey_editor_e2e',
    { serverSelectionTimeoutMS: 10_000 },
  );
  let mongoConnected = false;
  const artifact = {
    scope: 'local E2E analytics flow',
    photoId,
    opensRecorded: 0,
  };
  let originalPhotosPage: Record<string, unknown> | null = null;

  try {
    await mongo.connect();
    mongoConnected = true;
    const db = mongo.db();
    const now = new Date();
    const document = {
      schemaVersion: 1,
      blocks: [{ id: photoId, type: 'media', mediaAssetId: photoId, decorative: false, altText: 'Analytics E2E photo' }],
    };
    originalPhotosPage = await db.collection('photos_pages').findOne({ _id: 'photos' }) as Record<string, unknown> | null;
    const photoAsset = {
      _id: photoId,
      schemaVersion: 1,
      provider: 'cloudinary',
      providerAssetId: `e2e-${testPhotoId}`,
      providerPublicId: `e2e/${testPhotoId}`,
      resourceType: 'image',
      deliveryType: 'upload',
      version: 1,
      originalFilename: 'analytics-e2e-photo.jpg',
      format: 'jpg',
      width: 400,
      height: 300,
      bytes: 100,
      checksum: 'analytics-e2e',
      tags: [],
      altText: 'Analytics E2E photo',
      showInPhotos: true,
      status: 'ready',
      createdAt: now,
      updatedAt: now,
    };
    await db.collection<{ _id: string }>('media_assets').insertOne(photoAsset);
    await db.collection('photos_pages').replaceOne({ _id: 'photos' }, {
      _id: 'photos',
      schemaVersion: 1,
      draftDocument: document,
      draftVersion: 1,
      publishedDocument: document,
      createdAt: now,
      updatedAt: now,
      publishedAt: now,
    }, { upsert: true });

    await page.goto('/admin/analytics');
    await expect(page.getByRole('heading', { name: 'Analytics' })).toBeVisible();
    await expect(page.getByText(/Vercel Web Analytics is not configured/i)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Analytics' })).toHaveAttribute('href', '/admin/analytics');

    await page.goto('/photos');
    await expect(page.getByRole('button', { name: 'Open photo 1' })).toBeVisible();
    for (let index = 0; index < 2; index += 1) {
      const opened = page.waitForResponse((response) =>
        response.url().endsWith('/api/photos/open') && response.request().method() === 'POST',
      );
      await page.getByRole('button', { name: 'Open photo 1' }).click();
      expect((await opened).status()).toBe(204);
      await expect(page.getByRole('dialog', { name: 'Photos, 1 of 1' })).toBeVisible();
      await page.getByRole('button', { name: 'Close gallery' }).click();
      artifact.opensRecorded += 1;
    }

    const invalid = await page.request.post('/api/photos/open', { data: { photoId: 'not-a-published-photo' } });
    expect(invalid.status()).toBe(404);

    await page.goto('/admin/analytics');
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Most-opened photos' })).toBeVisible();
    await expect(page.getByText('analytics-e2e-photo.jpg')).toBeVisible();
    await expect(page.getByText('2 opens', { exact: true })).toBeVisible();
  } finally {
    if (mongoConnected) {
      const db = mongo.db();
      await db.collection('media_assets').deleteOne({ _id: photoId });
      if (originalPhotosPage) await db.collection('photos_pages').replaceOne({ _id: 'photos' }, originalPhotosPage);
      else await db.collection('photos_pages').deleteOne({ _id: 'photos' });
      await db.collection('photo_open_daily').deleteMany({ photoId });
      await mongo.close();
    }
    const artifactPath = test.info().outputPath('analytics-e2e-result.json');
    const artifactBody = JSON.stringify(artifact, null, 2);
    await writeFile(artifactPath, artifactBody);
    await test.info().attach('analytics-e2e-result.json', {
      path: artifactPath,
      contentType: 'application/json',
    });
  }
});
