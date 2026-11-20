import { stat } from 'node:fs/promises';
import { MongoClient, ObjectId } from 'mongodb';
import { fixtureDatabase, fixtureImage, fixtureJourney, fixturePhoto, fixtureThought } from './fixtures.mjs';

if (process.env.MONGODB_URI !== fixtureDatabase) {
  throw new Error(`Refusing to seed outside the disposable database: ${fixtureDatabase}`);
}

const client = new MongoClient(fixtureDatabase, { serverSelectionTimeoutMS: 10_000 });
const now = new Date('2025-01-01T12:00:00Z');
const id = (n) => n.toString(16).padStart(24, '0');
const mediaId = id(1);
const journeyId = new ObjectId(id(2));
const revisionId = new ObjectId(id(3));
const thoughtId = new ObjectId(id(4));
const photoDocument = { schemaVersion: 1, blocks: [
  { id: id(5), type: 'media', mediaAssetId: mediaId, decorative: false, altText: fixturePhoto },
] };
const journeyDocument = {
  schemaVersion: 2, template: 'held-places-v1',
  chapters: [{ id: 'one', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A visit to Japan.' }] }] }, media: [] }],
};
const metadata = {
  slug: 'ux-performance-fixture', title: fixtureJourney, summary: 'A visit to Japan.',
  locations: [{ id: 'jp', label: 'Japan', countryCode: 'JP' }],
  cover: { mediaAssetId: mediaId, role: 'cover', layout: { desktop: 'full', mobile: 'full' }, decorative: true },
};

try {
  await client.connect();
  const db = client.db();
  const put = (collection, record) => db.collection(collection).replaceOne({ _id: record._id }, record, { upsert: true });
  await put('media_assets', {
    _id: mediaId, schemaVersion: 1, provider: 'cloudinary', providerAssetId: 'perf-photo',
    providerPublicId: 'perf-photo', version: 1, resourceType: 'image', deliveryType: 'upload',
    originalFilename: fixtureImage.pathname.split('/').at(-1), format: 'png', width: 1448, height: 1086,
    bytes: (await stat(fixtureImage)).size, tags: [], altText: fixturePhoto, status: 'ready', showInPhotos: true, createdAt: now, updatedAt: now,
  });
  await put('photos_pages', {
    _id: 'photos', schemaVersion: 1, draftDocument: photoDocument, draftVersion: 1,
    publishedDocument: photoDocument, createdAt: now, updatedAt: now, publishedAt: now,
  });
  await put('journey_revisions', {
    _id: revisionId, journeyId, sequence: 1, schemaVersion: 1, reason: 'published',
    document: journeyDocument, metadataSnapshot: metadata, createdAt: now,
  });
  await put('journeys', {
    _id: journeyId, schemaVersion: 1, ...metadata, status: 'published', draftDocument: journeyDocument,
    editVersion: 1, publishedRevisionId: revisionId, firstPublishedAt: now, publishedAt: now, createdAt: now, updatedAt: now,
  });
  await put('travel', {
    _id: 'travel', schemaVersion: 1, version: 1, updatedAt: now,
    selections: { countries: ['JP', 'FR'], usStates: [], japanPrefectures: [] },
  });
  await put('thoughts', { _id: thoughtId, text: fixtureThought, createdAt: now });
  console.log('Seeded benchmark fixtures for Home, Photos, Travel and Thoughts Aloud.');
} finally {
  await client.close();
}
