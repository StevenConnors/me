import { expect, test } from '@playwright/test';
import { MongoClient, ObjectId } from 'mongodb';

import type { MediaAsset } from '../lib/media/schemas';

test('Photos reveals controls on touch and desktop hover or focus', async ({ browser, baseURL }) => {
  const client = await MongoClient.connect(
    process.env.E2E_MONGODB_URI ?? 'mongodb://127.0.0.1:27018/journey_editor_e2e',
  );
  if (!client.db().databaseName.endsWith('_e2e')) {
    await client.close();
    throw new Error('Photos fixtures require a disposable _e2e database');
  }
  const pages = client.db().collection<{ _id: string }>('photos_pages');
  const media = client.db().collection<MediaAsset>('media_assets');
  const original = await pages.findOne({ _id: 'photos' });
  const mediaId = new ObjectId().toHexString();
  try {
    const now = new Date();
    await media.insertOne({
      _id: mediaId,
      schemaVersion: 1,
      provider: 'cloudinary',
      providerAssetId: mediaId,
      providerPublicId: mediaId,
      resourceType: 'image',
      deliveryType: 'upload',
      originalFilename: 'quiet-coast.jpg',
      format: 'jpg',
      width: 1200,
      height: 800,
      bytes: 100,
      tags: [],
      showInPhotos: true,
      status: 'ready',
      altText: 'A quiet coast',
      createdAt: now,
      updatedAt: now,
    });
    await pages.replaceOne({ _id: 'photos' }, {
      _id: 'photos',
      schemaVersion: 1,
      draftDocument: {
        schemaVersion: 1,
        blocks: [{
          id: new ObjectId().toHexString(),
          type: 'media',
          mediaAssetId: mediaId,
          decorative: false,
          altText: 'A quiet coast',
        }],
      },
      draftVersion: 0,
      createdAt: now,
      updatedAt: now,
    }, { upsert: true });

    for (const touch of [true, false]) {
      const context = await browser.newContext({
        baseURL,
        viewport: {
          width: touch ? 390 : 1280,
          height: 844,
        },
        hasTouch: touch,
        isMobile: touch,
      });
      try {
        const page = await context.newPage();
        await page.goto('/admin/photos');
        const edit = page.getByRole('button', { name: 'Edit photo quiet-coast.jpg' });
        const select = page.getByText('Select quiet-coast.jpg', { exact: true }).locator('..');
        await expect(edit).toHaveCSS('opacity', touch ? '1' : '0');
        await expect(select).toHaveCSS('opacity', touch ? '1' : '0');
        if (!touch) {
          await edit.hover();
          await expect(edit).toHaveCSS('opacity', '1');
          await expect(select).toHaveCSS('opacity', '1');
          await page.mouse.move(0, 0);
          await expect(edit).toHaveCSS('opacity', '0');
          await expect(select).toHaveCSS('opacity', '0');
          await edit.focus();
          await expect(edit).toHaveCSS('opacity', '1');
          await expect(select).toHaveCSS('opacity', '1');
        }
      } finally {
        await context.close();
      }
    }
  } finally {
    await media.deleteOne({ _id: mediaId });
    if (original) await pages.replaceOne({ _id: 'photos' }, original);
    else await pages.deleteOne({ _id: 'photos' });
    await client.close();
  }
});
