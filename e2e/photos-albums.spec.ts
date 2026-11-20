import { writeFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';
import { MongoClient, ObjectId } from 'mongodb';

test('albums lead to chapters with a cover hero and wide featured photos', async ({ page }) => {
  test.setTimeout(120_000);
  const mongo = new MongoClient(process.env.E2E_MONGODB_URI ?? 'mongodb://127.0.0.1:27018/journey_editor_e2e', { serverSelectionTimeoutMS: 10_000 });
  const ids = Array.from({ length: 34 }, () => new ObjectId().toHexString());
  const kumanoId = new ObjectId().toHexString();
  const egyptId = new ObjectId().toHexString();
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
      resourceType: 'image', deliveryType: 'upload', version: 1, originalFilename: `albums-${index + 1}.jpg`, format: 'jpg',
      width: index === 5 ? 1600 : 900, height: index === 5 ? 900 : 1200, bytes: 100, checksum: `e2e-${id}`, tags: [],
      altText: `Album photo ${index + 1}`, showInPhotos: true, status: 'ready', createdAt: new Date(now.getTime() + index), updatedAt: now,
    })));
    const role = (index: number) => index === 27 ? { albumRole: 'cover' } : index === 3 ? { albumRole: 'feature' } : {};
    const media = (index: number) => ({ id: new ObjectId().toHexString(), type: 'media', mediaAssetId: ids[index], decorative: false, altText: `Album photo ${index + 1}`, ...role(index) });
    const photosDocument = { schemaVersion: 1, blocks: [
      { id: kumanoId, type: 'section', title: 'Kumano', text: 'Old pilgrim roads.' }, ...ids.slice(0, 30).map((_, index) => media(index)),
      { id: egyptId, type: 'section', title: 'Egypt' }, ...ids.slice(30).map((_, index) => media(index + 30)),
    ] };
    await pages.replaceOne({ _id: 'photos' }, { _id: 'photos', schemaVersion: 1, draftDocument: photosDocument, draftVersion: 1,
      publishedDocument: photosDocument, createdAt: now, updatedAt: now, publishedAt: now }, { upsert: true });

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/photos');
    const albums = page.getByRole('navigation', { name: 'Albums' });
    await expect(albums.getByRole('link')).toHaveCount(2);
    await expect(albums.getByRole('link', { name: /Kumano/ })).toContainText('30 photos');
    await expect(albums.getByRole('link', { name: /Egypt/ })).toContainText('4 photos');
    await expect(albums.getByRole('link', { name: /Kumano/ }).getByRole('img', { name: 'Album photo 28' })).toBeVisible();
    await expect(albums.getByRole('link', { name: /Egypt/ }).getByRole('img', { name: 'Album photo 31' })).toBeVisible();

    const kumano = page.getByRole('region', { name: 'Kumano' });
    const hero = kumano.locator('button[class*="chapterHero"]');
    await expect(hero).toHaveCount(1);
    await expect(hero).toHaveAccessibleName('Open Kumano cover');
    await expect(hero.getByRole('img', { name: 'Album photo 28' })).toBeAttached();
    await expect(kumano.getByRole('button', { name: 'Open photo 25', exact: true })).toHaveCount(0);
    const regionBox = (await kumano.boundingBox())!;
    const heroBox = (await hero.boundingBox())!;
    const tileBox = (await kumano.getByRole('button', { name: 'Open photo 1', exact: true }).boundingBox())!;
    const featureBox = (await kumano.getByRole('button', { name: 'Open photo 4', exact: true }).boundingBox())!;
    const landscapeBox = (await kumano.getByRole('button', { name: 'Open photo 6', exact: true }).boundingBox())!;
    observations.desktop = { regionWidth: regionBox.width, hero: heroBox, tileWidth: tileBox.width, featureWidth: featureBox.width, landscapeWidth: landscapeBox.width };
    expect(heroBox.width).toBeGreaterThan(regionBox.width * 0.9);
    expect(heroBox.height).toBeLessThan(900 * 0.85);
    expect(heroBox.y).toBeLessThan(tileBox.y);
    expect(featureBox.width).toBeGreaterThan(tileBox.width * 1.8);
    expect(landscapeBox.width).toBeGreaterThan(tileBox.width * 1.8);

    await hero.click();
    await expect(page.getByRole('dialog').getByRole('img', { name: 'Album photo 28' })).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('dialog').getByRole('img', { name: 'Album photo 29' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(hero).toHaveAccessibleName('Open photo 28');
    await expect(kumano.getByRole('button', { name: 'Open photo 28', exact: true })).toHaveCount(1);

    await albums.getByRole('link', { name: /Egypt/ }).click();
    const egypt = page.getByRole('region', { name: 'Egypt' });
    await expect(egypt.getByRole('heading', { level: 2 })).toBeInViewport();
    await expect(egypt.getByRole('button', { name: 'Open photo 31', exact: true })).toBeVisible();
    await test.info().attach('e2e-fixture-photos-albums-desktop.png', { body: await page.screenshot(), contentType: 'image/png' });

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/photos');
    await expect(albums.getByRole('link')).toHaveCount(2);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    observations.mobileOverflow = overflow;
    expect(overflow).toBeLessThanOrEqual(0);
    const mobileHero = (await hero.boundingBox())!;
    observations.mobileHero = mobileHero;
    expect(mobileHero.height).toBeLessThan(844 * 0.85);
    const mobileScreenshot = test.info().outputPath('e2e-fixture-photos-albums-mobile.png');
    await page.screenshot({ path: mobileScreenshot, fullPage: true });
    await test.info().attach('e2e-fixture-photos-albums-mobile.png', { path: mobileScreenshot, contentType: 'image/png' });
    expect(errors).toEqual([]);
  } finally {
    await db.collection('media_assets').deleteMany({ _id: { $in: ids as never[] } });
    if (original) await pages.replaceOne({ _id: 'photos' }, original);
    else await pages.deleteOne({ _id: 'photos' });
    await mongo.close();
    const path = test.info().outputPath('e2e-fixture-photos-albums.json');
    await writeFile(path, JSON.stringify({ ...observations, errors }, null, 2));
    await test.info().attach('e2e-fixture-photos-albums.json', { path, contentType: 'application/json' });
  }
});
