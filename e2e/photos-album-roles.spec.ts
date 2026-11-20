import { writeFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';
import { MongoClient, ObjectId } from 'mongodb';

type StoredBlock = { id: string; type: string; albumRole?: string };

test('author marks one cover per album and featured photos, and publishing exposes the roles', async ({ page }) => {
  test.setTimeout(120_000);
  const mongo = new MongoClient(process.env.E2E_MONGODB_URI ?? 'mongodb://127.0.0.1:27018/journey_editor_e2e', { serverSelectionTimeoutMS: 10_000 });
  const runId = new ObjectId().toHexString();
  const ids = Array.from({ length: 3 }, () => new ObjectId().toHexString());
  const blockIds = Array.from({ length: 3 }, () => new ObjectId().toHexString());
  const filenames = ids.map((_, index) => `album-role-${runId}-${index + 1}.jpg`);
  const observations: Record<string, unknown> = { runId };
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await mongo.connect();
  const db = mongo.db();
  const pages = db.collection<{ _id: string } & Record<string, unknown>>('photos_pages');
  const original = await pages.findOne({ _id: 'photos' });
  const draftBlocks = async () => ((await pages.findOne({ _id: 'photos' }))?.draftDocument as { blocks: StoredBlock[] }).blocks;
  const roleOf = async (index: number) => (await draftBlocks()).find((block) => block.id === blockIds[index])?.albumRole;
  try {
    const now = new Date();
    await db.collection<{ _id: string } & Record<string, unknown>>('media_assets').insertMany(ids.map((id, index) => ({
      _id: id, schemaVersion: 1, provider: 'cloudinary', providerAssetId: `e2e-${id}`, providerPublicId: `e2e/${id}`,
      resourceType: 'image', deliveryType: 'upload', version: 1, originalFilename: filenames[index], format: 'jpg',
      width: 400, height: 300, bytes: 100, checksum: `e2e-${id}`, tags: [], altText: `Album photo ${index + 1}`,
      showInPhotos: true, status: 'ready', createdAt: new Date(now.getTime() + index), updatedAt: now,
    })));
    const media = (index: number) => ({ id: blockIds[index], type: 'media', mediaAssetId: ids[index], decorative: false, altText: `Album photo ${index + 1}` });
    const document = { schemaVersion: 1, blocks: [
      { id: new ObjectId().toHexString(), type: 'section', title: 'Kumano' }, media(0), media(1),
      { id: new ObjectId().toHexString(), type: 'section', title: 'Egypt' }, media(2),
    ] };
    await pages.replaceOne({ _id: 'photos' }, { _id: 'photos', schemaVersion: 1, draftDocument: document, draftVersion: 1,
      publishedDocument: document, createdAt: now, updatedAt: now, publishedAt: now }, { upsert: true });

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/admin/photos');
    const setRole = async (index: number, label: string) => {
      await page.getByRole('button', { name: `Edit photo ${filenames[index]}`, exact: true }).click();
      const saved = page.waitForResponse((response) => response.url().endsWith('/api/admin/photos-page/draft') && response.request().method() === 'PATCH');
      await page.getByRole('complementary', { name: 'Selected photo inspector' }).getByLabel('Album role').selectOption({ label });
      expect((await saved).ok()).toBe(true);
    };

    await setRole(0, 'Album cover');
    expect(await roleOf(0)).toBe('cover');
    await setRole(1, 'Album cover');
    expect(await roleOf(1)).toBe('cover');
    expect(await roleOf(0)).toBeUndefined();
    await setRole(0, 'Featured in album');
    expect(await roleOf(0)).toBe('feature');
    await setRole(2, 'Album cover');
    expect(await roleOf(2)).toBe('cover');
    expect(await roleOf(1)).toBe('cover');
    await setRole(0, 'Regular photo');
    expect(await roleOf(0)).toBeUndefined();
    await setRole(0, 'Featured in album');
    observations.draftRoles = await Promise.all([0, 1, 2].map(roleOf));

    const tile = (index: number) => page.locator('article', { has: page.getByRole('button', { name: `Edit photo ${filenames[index]}`, exact: true }) });
    await expect(tile(0)).toContainText('Featured');
    await expect(tile(1)).toContainText('Cover');
    await expect(tile(2)).toContainText('Cover');
    const editorScreenshot = test.info().outputPath('e2e-fixture-photos-album-roles-editor.png');
    await page.screenshot({ path: editorScreenshot });
    await test.info().attach('e2e-fixture-photos-album-roles-editor.png', { path: editorScreenshot, contentType: 'image/png' });

    const publication = page.waitForResponse((response) => response.url().endsWith('/api/admin/photos-page/publish'));
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    expect((await publication).status()).toBe(200);
    const published = await (await page.request.get('/api/photos?limit=10')).json() as { items: Array<{ id: string; albumRole?: string }> };
    observations.publishedRoles = ids.map((id) => published.items.find((item) => item.id === id)?.albumRole ?? null);
    expect(observations.publishedRoles).toEqual(['feature', 'cover', 'cover']);
    expect(errors).toEqual([]);
  } finally {
    await db.collection('media_assets').deleteMany({ _id: { $in: ids as never[] } });
    if (original) await pages.replaceOne({ _id: 'photos' }, original);
    else await pages.deleteOne({ _id: 'photos' });
    await mongo.close();
    const path = test.info().outputPath('e2e-fixture-photos-album-roles.json');
    await writeFile(path, JSON.stringify({ ...observations, errors }, null, 2));
    await test.info().attach('e2e-fixture-photos-album-roles.json', { path, contentType: 'application/json' });
  }
});
