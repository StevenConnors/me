import { expect, test } from '@playwright/test';
import { MongoClient, ObjectId } from 'mongodb';

test('photos keep their server layout through hydration and resize in canonical order', async ({ browser, page }) => {
  const mongo = new MongoClient(process.env.E2E_MONGODB_URI ?? 'mongodb://127.0.0.1:27018/journey_editor_e2e');
  await mongo.connect();
  const db = mongo.db();
  const pages = db.collection<{ _id: string } & Record<string, unknown>>('photos_pages');
  const media = db.collection<{ _id: string } & Record<string, unknown>>('media_assets');
  const original = await pages.findOne({ _id: 'photos' });
  const ids = Array.from({ length: 12 }, () => new ObjectId().toHexString());
  const now = new Date();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  try {
    await media.insertMany(ids.map((id, index) => ({
      _id: id, schemaVersion: 1, provider: 'cloudinary', providerAssetId: `e2e-${id}`,
      providerPublicId: 'sample', resourceType: 'image', deliveryType: 'upload',
      originalFilename: `masonry-${index}.jpg`, format: 'jpg', width: 400,
      height: [300, 600, 400][index % 3], bytes: 100, tags: [],
      altText: `Masonry photo ${index + 1}`, showInPhotos: true, status: 'ready', createdAt: now, updatedAt: now,
    })));
    const photosDocument = { schemaVersion: 1, blocks: ids.map((id) => ({
      id: new ObjectId().toHexString(), type: 'media', mediaAssetId: id, decorative: false,
    })) };
    await pages.replaceOne({ _id: 'photos' }, { _id: 'photos', schemaVersion: 1,
      draftDocument: photosDocument, publishedDocument: photosDocument, draftVersion: 1, createdAt: now, updatedAt: now, publishedAt: now,
    }, { upsert: true });

    const geometry = async (target: typeof page) => target.getByRole('button', { name: /^Open photo / }).evaluateAll((tiles) => tiles.map((tile) => {
      const { x, y, width, height } = tile.getBoundingClientRect();
      return { x, y, width, height };
    }));
    for (const width of [390, 412]) {
      const server = await browser.newContext({ javaScriptEnabled: false, viewport: { width, height: 844 } });
      try {
        const firstPaint = await server.newPage();
        await firstPaint.goto('/photos');
        const before = await geometry(firstPaint);
        await page.setViewportSize({ width, height: 844 });
        await page.goto('/photos');
        await expect(page.getByRole('button', { name: 'Open photo 12', exact: true })).toBeVisible();
        await expect.poll(() => geometry(page)).toEqual(before);
        expect(new Set(before.map((tile) => tile.x)).size).toBe(2);
        before.forEach((tile, index) => {
          expect(Math.abs(tile.height - tile.width * [0.75, 1.5, 1][index % 3])).toBeLessThan(1);
          before.slice(index + 1).filter((other) => other.x === tile.x).forEach((other) => {
            expect(other.y).toBeGreaterThanOrEqual(tile.y + tile.height + 7.9);
          });
        });
      } finally {
        await server.close();
      }
    }
    const sources = await page.locator('button img').evaluateAll((images) => images.map((image) => image.getAttribute('src')));
    const images = await page.locator('button img').evaluateAll((images) => images.map((image) => ({
      source: image.getAttribute('src') ?? '', loading: image.getAttribute('loading'),
    })));
    expect(images.slice(0, 2).map((image) => image.loading)).not.toContain('lazy');
    images.slice(2).forEach((image) => {
      expect(image.loading).toBe(/^(data|blob):/.test(image.source) ? null : 'lazy');
    });
    const observations = [];
    for (const [width, columns] of [[1280, 4], [900, 3], [390, 2]]) {
      await page.setViewportSize({ width, height: 844 });
      await expect.poll(async () => new Set((await geometry(page)).map((tile) => tile.x)).size).toBe(columns);
      expect(await page.locator('button img').evaluateAll((images) => images.map((image) => image.getAttribute('src')))).toEqual(sources);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      observations.push({ width, columns });
    }
    const brandLeft = (await page.getByRole('link', { name: '佑治', exact: true }).first().boundingBox())!.x;
    const tiles = await geometry(page);
    const galleryLeft = Math.min(...tiles.map((tile) => tile.x));
    const galleryRight = Math.max(...tiles.map((tile) => tile.x + tile.width));
    expect((await page.getByRole('heading', { level: 1, name: 'Photos' }).boundingBox())!.x).toBeCloseTo(brandLeft, 0);
    expect(galleryLeft).toBeCloseTo(brandLeft, 0);
    expect(390 - galleryRight).toBeCloseTo(galleryLeft, 0);
    await test.info().attach('e2e-fixture-masonry-mobile.png', { body: await page.screenshot(), contentType: 'image/png' });
    await test.info().attach('e2e-fixture-masonry-layout.json', { body: JSON.stringify(observations), contentType: 'application/json' });
    await page.evaluate(() => {
      const fallback = Array.from(document.styleSheets).flatMap((sheet) => Array.from(sheet.cssRules))
        .find((rule) => rule instanceof CSSSupportsRule && /not.*container-type/.test(rule.conditionText));
      if (!(fallback instanceof CSSSupportsRule)) throw new Error('Missing non-container-query grid fallback');
      const style = document.createElement('style');
      style.textContent = Array.from(fallback.cssRules).map((rule) => rule.cssText).join('\n');
      document.head.append(style);
    });
    const fallbackTiles = await geometry(page);
    expect(new Set(fallbackTiles.map((tile) => tile.x)).size).toBe(2);
    fallbackTiles.forEach((tile, index) => {
      expect(Math.abs(tile.height - tile.width * [0.75, 1.5, 1][index % 3])).toBeLessThan(1);
      fallbackTiles.slice(index + 1).forEach((other) => {
        const overlaps = tile.x < other.x + other.width && tile.x + tile.width > other.x
          && tile.y < other.y + other.height && tile.y + tile.height > other.y;
        expect(overlaps).toBe(false);
      });
    });
    expect(await page.locator('button img').evaluateAll((images) => images.map((image) => image.getAttribute('src')))).toEqual(sources);
    await test.info().attach('e2e-fixture-masonry-fallback.png', { body: await page.screenshot(), contentType: 'image/png' });
    expect(errors).toEqual([]);
  } finally {
    await media.deleteMany({ _id: { $in: ids } });
    if (original) await pages.replaceOne({ _id: 'photos' }, original);
    else await pages.deleteOne({ _id: 'photos' });
    await mongo.close();
  }
});

test('an empty draft photo section keeps its heading and editor controls', async ({ page }) => {
  const mongo = new MongoClient(process.env.E2E_MONGODB_URI ?? 'mongodb://127.0.0.1:27018/journey_editor_e2e');
  await mongo.connect();
  const pages = mongo.db().collection<{ _id: string } & Record<string, unknown>>('photos_pages');
  const original = await pages.findOne({ _id: 'photos' });
  const now = new Date();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    const draftDocument = { schemaVersion: 1, blocks: [{ id: new ObjectId().toHexString(), type: 'section', title: 'Empty light' }] };
    await pages.replaceOne({ _id: 'photos' }, { _id: 'photos', schemaVersion: 1, draftDocument,
      draftVersion: 1, createdAt: now, updatedAt: now,
    }, { upsert: true });
    await page.goto('/admin/photos');
    await page.getByRole('button', { name: 'Mobile', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Empty light' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Insert section at top', exact: true })).toBeEnabled();
    await expect(page.locator('article[data-block-type="media"]')).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    if (original) await pages.replaceOne({ _id: 'photos' }, original);
    else await pages.deleteOne({ _id: 'photos' });
    await mongo.close();
  }
});
