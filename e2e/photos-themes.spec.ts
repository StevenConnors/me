import { writeFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';
import { MongoClient, ObjectId } from 'mongodb';

test('theme wall filters published photos by shared tags and opens the viewer', async ({ page }) => {
  test.setTimeout(120_000);
  const mongo = new MongoClient(process.env.E2E_MONGODB_URI ?? 'mongodb://127.0.0.1:27018/journey_editor_e2e', { serverSelectionTimeoutMS: 10_000 });
  const ids = Array.from({ length: 10 }, () => new ObjectId().toHexString());
  const tagsFor = (index: number) => [
    ...(index < 5 ? ['cat'] : []),
    ...(index >= 3 && index <= 8 ? ['sunset'] : []),
    ...(index === 9 ? ['lonely'] : []),
    'legacy-story', `upload-session-${index}`,
  ];
  const observations: Record<string, unknown> = {};
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await mongo.connect();
  const db = mongo.db();
  const pages = db.collection<{ _id: string } & Record<string, unknown>>('photos_pages');
  const original = await pages.findOne({ _id: 'photos' });
  try {
    const now = new Date();
    await db.collection<{ _id: string } & Record<string, unknown>>('media_assets').insertMany(ids.map((id, index) => ({
      _id: id, schemaVersion: 1, provider: 'cloudinary', providerAssetId: `e2e-${id}`, providerPublicId: `e2e/${id}`,
      resourceType: 'image', deliveryType: 'upload', version: 1, originalFilename: `themes-${index + 1}.jpg`, format: 'jpg',
      width: 900, height: 1200, bytes: 100, checksum: `e2e-${id}`, tags: tagsFor(index),
      altText: `Theme photo ${index + 1}`, showInPhotos: true, status: index === 8 ? 'pending' : 'ready', createdAt: new Date(now.getTime() + index), updatedAt: now,
    })));
    const photosDocument = { schemaVersion: 1, blocks: [
      { id: new ObjectId().toHexString(), type: 'section', title: 'Everything' },
      ...ids.map((id, index) => ({ id: new ObjectId().toHexString(), type: 'media', mediaAssetId: id, decorative: false, altText: `Theme photo ${index + 1}` })),
    ] };
    await pages.replaceOne({ _id: 'photos' }, { _id: 'photos', schemaVersion: 1, draftDocument: photosDocument, draftVersion: 1,
      publishedDocument: photosDocument, createdAt: now, updatedAt: now, publishedAt: now }, { upsert: true });

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/photos');
    await page.getByRole('link', { name: 'Browse by theme' }).click();
    await expect(page).toHaveURL(/\/photos\/themes$/);
    const themes = page.getByRole('navigation', { name: 'Themes' });
    observations.themes = await themes.getByRole('link').allInnerTexts();
    await expect(themes.getByRole('link')).toHaveText([/All\s*9/, /cat\s*5/, /sunset\s*5/]);
    await expect(themes.getByRole('link', { name: /All/ })).toHaveAttribute('aria-current', 'page');
    const wall = page.getByRole('list', { name: 'Photos' });
    await expect(wall.getByRole('listitem')).toHaveCount(9);

    await themes.getByRole('link', { name: /cat/ }).click();
    await expect(page).toHaveURL(/\/photos\/themes\?theme=cat$/);
    await expect(themes.getByRole('link', { name: /cat/ })).toHaveAttribute('aria-current', 'page');
    await expect(wall.getByRole('listitem')).toHaveCount(5);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('cat');
    await test.info().attach('e2e-fixture-photos-themes-desktop.png', { body: await page.screenshot(), contentType: 'image/png' });

    await wall.getByRole('link', { name: 'Theme photo 4' }).click();
    await expect(page).toHaveURL(new RegExp(`/photos\\?photo=${ids[3]}$`));
    await expect(page.getByRole('dialog').getByRole('img', { name: 'Theme photo 4' })).toBeVisible();
    await page.getByRole('button', { name: 'Next photo' }).click();
    await expect(page.getByRole('dialog').getByRole('img', { name: 'Theme photo 5' })).toBeVisible();
    await page.goBack();
    await page.goBack();
    await expect(page).toHaveURL(/\/photos\/themes\?theme=cat$/);
    await expect(wall.getByRole('listitem')).toHaveCount(5);

    await page.goto('/photos/themes?theme=nothing-here');
    await expect(page.getByText('No photos have the theme “nothing-here”.')).toBeVisible();
    await page.getByRole('link', { name: 'See all themes' }).click();
    await expect(wall.getByRole('listitem')).toHaveCount(9);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/photos/themes?theme=sunset');
    await expect(wall.getByRole('listitem')).toHaveCount(5);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    observations.mobileOverflow = overflow;
    expect(overflow).toBeLessThanOrEqual(0);
    const mobileScreenshot = test.info().outputPath('e2e-fixture-photos-themes-mobile.png');
    await page.screenshot({ path: mobileScreenshot, fullPage: true });
    await test.info().attach('e2e-fixture-photos-themes-mobile.png', { path: mobileScreenshot, contentType: 'image/png' });
    // The pending fixture photo is logged by /photos on purpose; anything else is a failure.
    expect(errors.filter((error) => !error.includes('Photos page skipped unavailable published media'))).toEqual([]);
  } finally {
    await db.collection('media_assets').deleteMany({ _id: { $in: ids as never[] } });
    if (original) await pages.replaceOne({ _id: 'photos' }, original);
    else await pages.deleteOne({ _id: 'photos' });
    await mongo.close();
    const path = test.info().outputPath('e2e-fixture-photos-themes.json');
    await writeFile(path, JSON.stringify({ ...observations, errors }, null, 2));
    await test.info().attach('e2e-fixture-photos-themes.json', { path, contentType: 'application/json' });
  }
});
