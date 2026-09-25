import { writeFile } from 'node:fs/promises';

import { MongoClient, ObjectId } from 'mongodb';
import { expect, test } from '@playwright/test';

test('home previews published photos, section navigation reaches later pages, and media scrolls', async ({ page }) => {
  test.setTimeout(120_000);
  const mongo = new MongoClient(
    process.env.E2E_MONGODB_URI ?? 'mongodb://127.0.0.1:27018/journey_editor_e2e',
    { serverSelectionTimeoutMS: 10_000 },
  );
  const runId = new ObjectId().toHexString();
  const mediaIds = Array.from({ length: 26 }, () => new ObjectId().toHexString());
  const firstSectionId = new ObjectId().toHexString();
  const laterSectionId = new ObjectId().toHexString();
  let originalPhotosPage: Record<string, unknown> | null = null;
  let connected = false;
  const artifact = { runId, mediaCount: mediaIds.length, laterSectionReached: false, collapsed: false, adminAutoLoaded: false, curatedHomepage: false, draftRequestsAfterFirstPick: 0 };

  try {
    await mongo.connect();
    connected = true;
    const db = mongo.db();
    const now = new Date();
    originalPhotosPage = await db.collection('photos_pages').findOne({ _id: 'photos' }) as Record<string, unknown> | null;
    await db.collection<{ _id: string }>('media_assets').insertMany(mediaIds.map((id, index) => ({
      _id: id, schemaVersion: 1, provider: 'cloudinary', providerAssetId: `e2e-${id}`,
      providerPublicId: `e2e/${id}`, resourceType: 'image', deliveryType: 'upload', version: 1,
      originalFilename: `homepage-e2e-${runId}-${index}.jpg`, format: 'jpg', width: 400, height: 300,
      bytes: 100, checksum: `e2e-${id}`, tags: [], altText: `E2E photo ${index + 1}`,
      showInPhotos: true, status: 'ready', createdAt: new Date(now.getTime() + index), updatedAt: now,
    })));
    const photosDocument = { schemaVersion: 1, blocks: [
      { id: firstSectionId, type: 'section', title: 'First light' },
      ...mediaIds.flatMap((id, index) => [
        ...(index === 25 ? [{ id: laterSectionId, type: 'section', title: 'Last light' }] : []),
        { id: new ObjectId().toHexString(), type: 'media', mediaAssetId: id, decorative: false, altText: `E2E photo ${index + 1}`, ...(index === 5 ? { displayDate: '2024-04-18' } : {}) },
      ]),
    ] };
    await db.collection('photos_pages').replaceOne({ _id: 'photos' }, {
      _id: 'photos', schemaVersion: 1, draftDocument: photosDocument, draftVersion: 1,
      publishedDocument: photosDocument, createdAt: now, updatedAt: now, publishedAt: now,
    }, { upsert: true });

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Photos' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'See all photos', exact: true })).toHaveAttribute('href', '/photos');
    await expect(page.locator('[data-home-photo]')).toHaveCount(8);
    await expect(page.getByRole('heading', { name: 'Journeys' })).toBeVisible();

    await page.getByRole('link', { name: 'See all photos', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Last light' })).toBeVisible();
    await page.getByRole('link', { name: 'Last light' }).click();
    await expect(page.getByRole('heading', { name: 'Last light' })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`#section-${laterSectionId}$`));
    artifact.laterSectionReached = true;
    await page.getByRole('button', { name: 'Collapse Last light' }).click();
    await expect(page.getByRole('button', { name: 'Open photo 26' })).toBeHidden();
    artifact.collapsed = true;

    await page.goto('/admin/media');
    const firstCard = page.locator('article').filter({ hasText: `homepage-e2e-${runId}-25.jpg` });
    await expect(firstCard).toBeVisible();
    await expect(firstCard.getByLabel('Display title')).toBeHidden();
    await firstCard.locator('summary').click();
    await expect(firstCard.getByLabel('Display title')).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(page.locator('article').filter({ hasText: `homepage-e2e-${runId}-0.jpg` })).toBeVisible();
    artifact.adminAutoLoaded = true;

    await page.goto('/admin/photos');
    await page.getByRole('button', { name: 'Load more photos' }).click();
    const draftRequests: string[] = [];
    page.on('request', (request) => {
      if (request.url().endsWith('/api/admin/photos-page/draft') && request.method() === 'PATCH') draftRequests.push(request.postData() ?? '');
    });
    for (const index of [5, 25]) {
      await page.getByRole('button', { name: `Edit photo homepage-e2e-${runId}-${index}.jpg` }).click();
      await page.getByRole('checkbox', { name: 'Show on homepage' }).check();
      if (index === 5) {
        await expect.poll(() => draftRequests.length).toBe(1);
        await page.waitForTimeout(1700);
        artifact.draftRequestsAfterFirstPick = draftRequests.length;
        expect(draftRequests).toHaveLength(1);
      }
    }
    const publishResponse = page.waitForResponse((response) => response.url().endsWith('/api/admin/photos-page/publish') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    expect((await publishResponse).ok()).toBe(true);
    await expect(page.getByText('Published', { exact: true })).toBeVisible();
    await page.goto('/');
    await expect(page.locator('[data-home-photo]')).toHaveCount(2);
    await expect(page.locator('[data-home-photo]').first().locator('img')).toHaveAttribute('alt', 'E2E photo 6');
    await expect(page.locator('[data-home-photo]').last().locator('img')).toHaveAttribute('alt', 'E2E photo 26');
    artifact.curatedHomepage = true;
  } finally {
    if (connected) {
      const db = mongo.db();
      await db.collection('media_assets').deleteMany({ _id: { $in: mediaIds } });
      if (originalPhotosPage) await db.collection('photos_pages').replaceOne({ _id: 'photos' }, originalPhotosPage);
      else await db.collection('photos_pages').deleteOne({ _id: 'photos' });
      await mongo.close();
    }
    const artifactPath = test.info().outputPath('home-photos-media-result.json');
    await writeFile(artifactPath, JSON.stringify(artifact, null, 2));
    await test.info().attach('home-photos-media-result.json', { path: artifactPath, contentType: 'application/json' });
  }
});
