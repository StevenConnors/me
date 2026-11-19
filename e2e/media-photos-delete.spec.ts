import { MongoClient, ObjectId } from 'mongodb';
import { expect, test } from '@playwright/test';

test('Photos editor saves draft removal before deleting a draft-only upload', async ({ page }) => {
  test.setTimeout(120_000);
  const mongo = new MongoClient(process.env.E2E_MONGODB_URI ?? 'mongodb://127.0.0.1:27018/journey_editor_e2e');
  await mongo.connect();
  const db = mongo.db();
  const pages = db.collection<{ _id: string }>('photos_pages');
  const assets = db.collection<{ _id: string; [key: string]: unknown }>('media_assets');
  const original = await pages.findOne({ _id: 'photos' });
  const ids = [new ObjectId().toHexString(), new ObjectId().toHexString()];
  const filename = `delete-draft-${ids[1]}.jpg`;
  const errors: string[] = [];
  const observations = { draftSaved: false, confirmationEnabled: false, removalSavedBeforeDelete: false, deleted: false, published: false };
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  try {
    const now = new Date();
    await assets.insertMany(ids.map((id, index) => ({ _id: id, schemaVersion: 1, provider: 'cloudinary',
      providerAssetId: `e2e-${id}`, providerPublicId: `e2e/${id}`, resourceType: 'image',
      deliveryType: 'upload', originalFilename: index ? filename : 'retained-fixture.jpg', format: 'jpg',
      width: 400, height: 300, bytes: 100, tags: [], altText: 'Fixture photo', showInPhotos: false,
      status: 'ready', createdAt: now, updatedAt: now })));
    await pages.replaceOne({ _id: 'photos' }, { _id: 'photos', schemaVersion: 1,
      draftDocument: { schemaVersion: 1, blocks: [{ id: 'retained-photo', type: 'media',
        mediaAssetId: ids[0], decorative: false, altText: 'Retained photo' }] }, draftVersion: 0,
      createdAt: now, updatedAt: now }, { upsert: true });
    await page.goto('/admin/photos');
    await page.getByRole('button', { name: 'Add media', exact: true }).click();
    const picker = page.getByRole('dialog', { name: 'Add media from library' });
    await picker.getByRole('searchbox', { name: 'Search media uploads' }).fill(filename);
    await picker.getByRole('button', { name: 'Search', exact: true }).click();
    await picker.getByRole('checkbox', { name: new RegExp(filename) }).check();
    const insertionSave = page.waitForResponse((response) => response.url().endsWith('/api/admin/photos-page/draft') && response.request().method() === 'PATCH');
    await picker.getByRole('button', { name: 'Insert selected' }).click();
    expect((await insertionSave).ok()).toBe(true);
    const saved = await pages.findOne({ _id: 'photos' });
    expect(JSON.stringify(saved)).toContain(ids[1]);
    observations.draftSaved = true;
    await page.getByRole('button', { name: `Select photo ${filename}`, exact: true }).click();
    await page.getByRole('button', { name: 'Delete selected uploads…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Confirm permanent upload deletion' });
    const confirm = dialog.getByRole('button', { name: 'Permanently delete ready uploads' });
    await expect(confirm).toBeEnabled();
    observations.confirmationEnabled = true;
    await test.info().attach('e2e-fixture-photos-delete-confirm.png', { body: await page.screenshot(), contentType: 'image/png' });
    await page.route('**/api/admin/media/bulk-delete', async (route) => {
      const current = await pages.findOne({ _id: 'photos' });
      observations.removalSavedBeforeDelete = !JSON.stringify(current).includes(ids[1]);
      await route.continue();
    });
    const deletion = page.waitForResponse((response) => response.url().endsWith('/api/admin/media/bulk-delete'));
    await confirm.click();
    const result = await deletion;
    expect(result.ok()).toBe(true);
    expect((await result.json()).results[0].result).toBe('deleted');
    expect(observations.removalSavedBeforeDelete).toBe(true);
    expect(await assets.findOne({ _id: ids[1] })).toBeNull();
    observations.deleted = true;
    await expect(dialog.getByText('Eligible uploads were permanently deleted.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByRole('button', { name: `Select photo ${filename}`, exact: true })).toHaveCount(0);
    const publication = page.waitForResponse((response) => response.url().endsWith('/api/admin/photos-page/publish'));
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    expect((await publication).status()).toBe(200);
    await expect(page.getByText('Live · no unpublished changes', { exact: true })).toBeVisible();
    observations.published = true;
    expect(errors).toEqual([]);
    await test.info().attach('e2e-fixture-photos-delete-published.png', { body: await page.screenshot(), contentType: 'image/png' });
  } finally {
    await assets.deleteMany({ _id: { $in: ids } });
    if (original) await pages.replaceOne({ _id: 'photos' }, original);
    else await pages.deleteOne({ _id: 'photos' });
    await mongo.close();
    console.log(JSON.stringify(observations));
    await test.info().attach('e2e-fixture-photos-editor-delete.json', { body: JSON.stringify(observations), contentType: 'application/json' });
  }
});

test('Photos draft and published placements prevent single and bulk deletion', async ({ request }) => {
  test.setTimeout(120_000);
  const mongo = new MongoClient(process.env.E2E_MONGODB_URI ?? 'mongodb://127.0.0.1:27018/journey_editor_e2e');
  await mongo.connect();
  const db = mongo.db();
  const pages = db.collection<{ _id: string }>('photos_pages');
  const assets = db.collection<{ _id: string; [key: string]: unknown }>('media_assets');
  const original = await pages.findOne({ _id: 'photos' });
  const ids: string[] = [];
  const observations: unknown[] = [];
  try {
    for (const placement of ['draft', 'published', 'empty', 'missing']) {
      for (const bulk of [false, true]) {
        const id = new ObjectId().toHexString();
        ids.push(id);
        const now = new Date();
        await assets.insertOne({ _id: id, schemaVersion: 1, provider: 'cloudinary',
          providerAssetId: `e2e-${id}`, providerPublicId: `e2e/${id}`, resourceType: 'image',
          deliveryType: 'upload', originalFilename: 'draft-fixture.jpg', format: 'jpg',
          width: 400, height: 300, bytes: 100, tags: [], showInPhotos: false,
          status: 'ready', createdAt: now, updatedAt: now });
        const document = { schemaVersion: 1, blocks: [{ id: 'fixture-photo', type: 'media',
          mediaAssetId: id, decorative: false, altText: 'Fixture photo' }] };
        const empty = { schemaVersion: 1, blocks: [] };
        if (placement === 'missing') await pages.deleteOne({ _id: 'photos' });
        else await pages.replaceOne({ _id: 'photos' }, { _id: 'photos', schemaVersion: 1,
          draftDocument: placement === 'draft' ? document : empty, draftVersion: 0,
          ...(placement === 'published' ? { publishedDocument: document, publishedAt: now } : {}),
          createdAt: now, updatedAt: now }, { upsert: true });
        const planned = await request.post('/api/admin/media/bulk-delete/plan', { data: { mediaIds: [id] } });
        expect(planned.ok()).toBe(true);
        expect((await planned.json()).plan[0].classification).toBe(placement === 'draft'
          ? 'used_by_photos_draft' : placement === 'published' ? 'publish_removal_first' : 'ready_to_delete');
        const deletion = bulk
          ? await request.post('/api/admin/media/bulk-delete', { data: { mediaIds: [id] } })
          : await request.delete(`/api/admin/media/${id}`);
        const deletionBody = deletion.status() === 204 ? null : await deletion.json();
        const publish = placement === 'draft'
          ? await request.post('/api/admin/photos-page/publish', { data: { expectedVersion: 0 } }) : null;
        observations.push({ placement, bulk, deleteStatus: deletion.status(), deletionBody,
          publishStatus: publish?.status() });
        console.log(JSON.stringify(observations.at(-1)));
        const protectedAsset = placement === 'draft' || placement === 'published';
        if (!bulk) {
          expect.soft(deletion.status()).toBe(protectedAsset ? 409 : 204);
          if (protectedAsset) expect.soft(deletionBody?.error?.code).toBe('MEDIA_IN_USE');
        } else {
          expect.soft(deletion.status()).toBe(200);
          expect.soft(deletionBody.results[0].result).toBe(protectedAsset ? 'protected' : 'deleted');
        }
        expect.soft(Boolean(await assets.findOne({ _id: id }))).toBe(protectedAsset);
        if (publish) expect.soft(publish.status()).toBe(200);
      }
    }
  } finally {
    await assets.deleteMany({ _id: { $in: ids } });
    if (original) await pages.replaceOne({ _id: 'photos' }, original);
    else await pages.deleteOne({ _id: 'photos' });
    await mongo.close();
    await test.info().attach('e2e-fixture-photos-delete.json', {
      body: JSON.stringify(observations, null, 2), contentType: 'application/json',
    });
  }
});
