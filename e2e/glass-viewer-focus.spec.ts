import { expect, test, type Page } from '@playwright/test';
import { MongoClient, ObjectId } from 'mongodb';

type Doc = { _id: string } & Record<string, unknown>;

const focusedLabel = (page: Page) =>
  page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.tagName);

test('the Glass viewer keeps keyboard focus inside and returns it to the opening photo', async ({ page }) => {
  test.setTimeout(90_000);
  const mongo = new MongoClient(process.env.E2E_MONGODB_URI ?? 'mongodb://127.0.0.1:27018/journey_editor_e2e', { serverSelectionTimeoutMS: 10_000 });
  const mediaIds = Array.from({ length: 3 }, () => new ObjectId().toHexString());
  const collectionId = new ObjectId().toHexString();
  let originalGlass: Doc[] = [];
  let connected = false;
  const errors: string[] = [];
  const observations: Array<{ viewport: string; key: string; focused: string | undefined }> = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  try {
    await mongo.connect();
    connected = true;
    const db = mongo.db();
    const collections = db.collection<Doc>('media_collections');
    originalGlass = await collections.find({ name: 'Glass' }).toArray();
    await collections.deleteMany({ name: 'Glass' });
    await db.collection<Doc>('media_assets').insertMany(mediaIds.map((id, index) => ({
      _id: id, schemaVersion: 1, provider: 'cloudinary', providerAssetId: `e2e-${id}`, providerPublicId: `e2e/${id}`,
      resourceType: 'image', deliveryType: 'upload', version: 1, originalFilename: `glass-focus-${id}.jpg`,
      format: 'jpg', width: 900, height: 1600, bytes: 100, checksum: `e2e-${id}`, tags: [], altText: `Glass piece ${index + 1}`,
      status: 'ready', captureDate: '2024-10-05', createdAt: new Date(), updatedAt: new Date(),
    })));
    await collections.insertOne({ _id: collectionId, schemaVersion: 1, name: 'Glass', mediaAssetIds: mediaIds, createdAt: new Date(), updatedAt: new Date() });

    const dialog = page.getByRole('dialog');
    const close = page.getByRole('button', { name: 'Close gallery' });
    const trigger = page.getByRole('button', { name: 'Open photo 2', exact: true });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/glass');
    await trigger.press('Enter');
    await expect(close).toBeFocused();
    for (const [key, expected] of [['Tab', 'Previous item'], ['Tab', 'Next item'], ['Tab', 'Close gallery'], ['Shift+Tab', 'Next item']]) {
      await page.keyboard.press(key);
      const focused = await focusedLabel(page);
      observations.push({ viewport: '1280', key, focused });
      expect.soft(focused, `1280 px: focus after ${key}`).toBe(expected);
    }
    for (const [key, expected] of [['Tab', 'Close gallery'], ['Shift+Tab', 'Next item']]) {
      await dialog.getByText('2 / 3').click();
      await page.keyboard.press(key);
      const focused = await focusedLabel(page);
      observations.push({ viewport: '1280', key: `click counter, ${key}`, focused });
      expect.soft(focused, `1280 px: focus after clicking the counter and pressing ${key}`).toBe(expected);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();

    await trigger.press('Enter');
    await close.click();
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/glass');
    await trigger.press('Enter');
    await expect(close).toBeFocused();
    const image = dialog.getByRole('img');
    const imageBox = await image.boundingBox();
    expect(imageBox).not.toBeNull();
    for (const name of ['Previous item', 'Next item']) {
      const button = dialog.getByRole('button', { name });
      await expect(button).toBeVisible();
      const box = await button.boundingBox();
      expect(box).not.toBeNull();
      if (!box || !imageBox) throw new Error('Viewer bounds are unavailable');
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(390);
      expect(box.y >= imageBox.y + imageBox.height || box.y + box.height <= imageBox.y || box.x >= imageBox.x + imageBox.width || box.x + box.width <= imageBox.x).toBe(true);
    }
    await dialog.getByRole('button', { name: 'Next item' }).click();
    await expect(dialog).toHaveAccessibleName('Glass, 3 of 3');
    await expect(image).toHaveAttribute('alt', 'Glass piece 3');
    await dialog.getByRole('button', { name: 'Next item' }).click();
    await expect(dialog).toHaveAccessibleName('Glass, 1 of 3');
    await dialog.getByRole('button', { name: 'Previous item' }).click();
    await expect(dialog).toHaveAccessibleName('Glass, 3 of 3');
    const media = image.locator('..');
    await media.dispatchEvent('touchstart', { changedTouches: [{ identifier: 0, clientX: 300, clientY: 400 }] });
    await media.dispatchEvent('touchend', { changedTouches: [{ identifier: 0, clientX: 100, clientY: 400 }] });
    await expect(dialog).toHaveAccessibleName('Glass, 1 of 3');
    await close.focus();
    for (const [key, expected] of [['Tab', 'Previous item'], ['Tab', 'Next item'], ['Tab', 'Close gallery'], ['Shift+Tab', 'Next item']]) {
      await page.keyboard.press(key);
      const focused = await focusedLabel(page);
      observations.push({ viewport: '390', key, focused });
      expect.soft(focused, `390 px: focus after ${key}`).toBe(expected);
    }
    await test.info().attach('e2e-fixture-glass-viewer-focus-mobile.png', { body: await page.screenshot(), contentType: 'image/png' });
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();

    await trigger.press('Enter');
    await page.mouse.click(8, 836);
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    expect(errors).toEqual([]);
  } finally {
    await test.info().attach('e2e-fixture-glass-viewer-focus.json', { body: JSON.stringify(observations, null, 2), contentType: 'application/json' });
    if (connected) {
      const db = mongo.db();
      await db.collection<Doc>('media_collections').deleteOne({ _id: collectionId });
      if (originalGlass.length) await db.collection<Doc>('media_collections').insertMany(originalGlass);
      await db.collection<Doc>('media_assets').deleteMany({ _id: { $in: mediaIds } });
      await mongo.close();
    }
  }
});
