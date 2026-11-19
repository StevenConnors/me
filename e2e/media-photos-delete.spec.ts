import { MongoClient, ObjectId } from 'mongodb';
import { expect, test } from '@playwright/test';

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
