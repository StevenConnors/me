import { writeFile } from 'node:fs/promises';

import { MongoClient, ObjectId } from 'mongodb';
import { expect, test } from '@playwright/test';

test('photo viewer navigates, displays details, and opens shared photo URLs', async ({ page }) => {
  test.setTimeout(120_000);
  const mongo = new MongoClient(process.env.E2E_MONGODB_URI ?? 'mongodb://127.0.0.1:27018/journey_editor_e2e');
  const ids = Array.from({ length: 26 }, () => new ObjectId().toHexString());
  const artifact = { firstPhoto: ids[0], secondPhoto: ids[1], laterPhoto: ids[25], navigation: [] as string[] };
  let originalPhotosPage: Record<string, unknown> | null = null;
  let connected = false;

  try {
    await mongo.connect();
    connected = true;
    const db = mongo.db();
    const now = new Date();
    originalPhotosPage = await db.collection('photos_pages').findOne({ _id: 'photos' }) as Record<string, unknown> | null;
    await db.collection<{ _id: string }>('media_assets').insertMany(ids.map((id, index) => ({
      _id: id, schemaVersion: 1, provider: 'cloudinary', providerAssetId: `e2e-${id}`,
      providerPublicId: `e2e/${id}`, resourceType: 'image', deliveryType: 'upload', version: 1,
      originalFilename: `viewer-${index + 1}.jpg`, format: 'jpg', width: 400, height: 300,
      bytes: 100, tags: index === 1 ? ['night', 'Tokyo'] : [],
      ...(index === 1 ? { title: 'City lights', caption: 'After the rain' } : {}),
      altText: `Viewer photo ${index + 1}`, showInPhotos: true, status: 'ready',
      createdAt: new Date(now.getTime() + index), updatedAt: now,
    })));
    const document = { schemaVersion: 1, blocks: ids.map((id) => ({
      id: new ObjectId().toHexString(), type: 'media', mediaAssetId: id, decorative: false,
    })) };
    await db.collection('photos_pages').replaceOne({ _id: 'photos' }, {
      _id: 'photos', schemaVersion: 1, draftDocument: document, draftVersion: 1,
      publishedDocument: document, createdAt: now, updatedAt: now, publishedAt: now,
    }, { upsert: true });

    await page.goto('/photos');
    await page.getByRole('button', { name: 'Open photo 1', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`[?&]photo=${ids[0]}(?:&|$)`));
    await expect(page.getByRole('dialog').getByRole('img', { name: 'Viewer photo 1' })).toBeVisible();
    artifact.navigation.push('open first');

    await page.getByRole('button', { name: 'Next photo' }).click();
    await expect(page).toHaveURL(new RegExp(`[?&]photo=${ids[1]}(?:&|$)`));
    await expect(page.getByRole('dialog').getByRole('img', { name: 'Viewer photo 2' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'City lights' })).toBeVisible();
    await expect(page.getByText('After the rain')).toBeVisible();
    await expect(page.getByText('night', { exact: true })).toBeVisible();
    await expect(page.getByText('Tokyo', { exact: true })).toBeVisible();
    const detailsScreenshot = test.info().outputPath('photo-viewer-details.png');
    await page.screenshot({ path: detailsScreenshot });
    await test.info().attach('photo-viewer-details.png', { path: detailsScreenshot, contentType: 'image/png' });
    artifact.navigation.push('next with details');

    await page.goBack();
    await expect(page.getByRole('dialog').getByRole('img', { name: 'Viewer photo 1' })).toBeVisible();
    await page.goForward();
    await expect(page.getByRole('dialog').getByRole('img', { name: 'Viewer photo 2' })).toBeVisible();
    artifact.navigation.push('browser history');

    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('dialog').getByRole('img', { name: 'Viewer photo 1' })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`[?&]photo=${ids[0]}(?:&|$)`));
    artifact.navigation.push('previous by keyboard');

    await page.getByRole('button', { name: 'Close gallery' }).click();
    await expect(page).toHaveURL(/\/photos$/);
    await page.goto(`/photos?photo=${ids[23]}`);
    await expect(page.getByRole('dialog').getByRole('img', { name: 'Viewer photo 24' })).toBeVisible();
    await page.getByRole('button', { name: 'Next photo' }).click();
    await expect(page.getByRole('dialog').getByRole('img', { name: 'Viewer photo 25' })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`[?&]photo=${ids[24]}(?:&|$)`));
    artifact.navigation.push('next across page boundary');

    await page.goto(`/photos?photo=${ids[25]}`);
    await expect(page.getByRole('dialog').getByRole('img', { name: 'Viewer photo 26' })).toBeVisible();
    await page.getByRole('button', { name: 'Previous photo' }).click();
    await expect(page.getByRole('dialog').getByRole('img', { name: 'Viewer photo 25' })).toBeVisible();
    artifact.navigation.push('shared later photo and previous');
  } finally {
    if (connected) {
      const db = mongo.db();
      await db.collection('media_assets').deleteMany({ _id: { $in: ids } });
      if (originalPhotosPage) await db.collection('photos_pages').replaceOne({ _id: 'photos' }, originalPhotosPage);
      else await db.collection('photos_pages').deleteOne({ _id: 'photos' });
      await mongo.close();
    }
    const path = test.info().outputPath('photo-viewer-result.json');
    await writeFile(path, JSON.stringify(artifact, null, 2));
    await test.info().attach('photo-viewer-result.json', { path, contentType: 'application/json' });
  }
});
