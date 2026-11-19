import { expect, test } from '@playwright/test';
import { MongoClient, ObjectId } from 'mongodb';

import type { MediaAsset } from '../lib/media/schemas';
import { makeHeldPlacesDocument, makeJourney, READY_MEDIA_ID } from '../tests/journeys/fixtures';

test('admin publication replays the same edit version', async ({ request }) => {
  const client = await MongoClient.connect(process.env.E2E_MONGODB_URI ?? 'mongodb://127.0.0.1:27018/journey_editor_e2e');
  const db = client.db();
  const id = new ObjectId();
  const mediaId = new ObjectId().toHexString();
  const journey = makeJourney({ _id: id, slug: `publish-${id}`, draftDocument: makeHeldPlacesDocument(), cover: undefined });
  journey.cover = { mediaAssetId: mediaId, role: 'cover', layout: { desktop: 'full', mobile: 'full' } };
  journey.draftDocument = JSON.parse(JSON.stringify(journey.draftDocument).split(READY_MEDIA_ID).join(mediaId));
  try {
    await db.collection('journeys').insertOne(journey);
    await db.collection<MediaAsset>('media_assets').insertOne({ _id: mediaId, schemaVersion: 1,
      provider: 'cloudinary', providerAssetId: mediaId, providerPublicId: mediaId,
      resourceType: 'image', deliveryType: 'upload', originalFilename: 'fixture.jpg',
      format: 'jpg', width: 1, height: 1, bytes: 1, tags: [], showInPhotos: false,
      status: 'ready', altText: 'Fixture coast', createdAt: new Date(), updatedAt: new Date() });
    const publish = () => request.post(`/api/admin/journeys/${id}/publish`, { data: { expectedEditVersion: 0 } });
    const first = await publish();
    const second = await publish();
    expect(first.status()).toBe(200);
    expect(second.status()).toBe(200);
    const count = await db.collection('journey_revisions').countDocuments({ journeyId: id });
    const live = await db.collection('journeys').findOne({ _id: id });
    const result = { revisionCount: count, liveRevision: live?.publishedRevisionId.toHexString() };
    console.log(`publish demo: ${JSON.stringify(result)}`);
    await test.info().attach('e2e-fixture-publish.json', { body: JSON.stringify(result), contentType: 'application/json' });
    expect(count).toBe(1);
    expect((await first.json()).revision._id).toBe((await second.json()).revision._id);
  } finally {
    await db.collection('journeys').deleteOne({ _id: id });
    await db.collection('journey_revisions').deleteMany({ journeyId: id });
    await db.collection('media_assets').deleteOne({ _id: mediaId });
    await client.close();
  }
});
