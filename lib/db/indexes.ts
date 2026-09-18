import type { Db } from 'mongodb';

import { COLLECTION_NAMES, getDatabase } from '@/lib/db/collections';

export async function ensureJourneyIndexes(db?: Db): Promise<void> {
  const database = db ?? (await getDatabase());
  const journeys = database.collection(COLLECTION_NAMES.journeys);
  const revisions = database.collection(COLLECTION_NAMES.journeyRevisions);
  const mediaAssets = database.collection(COLLECTION_NAMES.mediaAssets);
  const uploadSessions = database.collection(COLLECTION_NAMES.uploadSessions);

  await Promise.all([
    journeys.createIndex(
      { slug: 1 },
      {
        name: 'unique_active_journey_slug',
        unique: true,
        partialFilterExpression: { archivedAt: { $exists: false } },
      },
    ),
    journeys.createIndex(
      { status: 1, updatedAt: -1 },
      { name: 'journey_status_updated' },
    ),
    revisions.createIndex(
      { journeyId: 1, sequence: 1 },
      { name: 'unique_journey_revision_sequence', unique: true },
    ),
    revisions.createIndex(
      { journeyId: 1, createdAt: -1 },
      { name: 'journey_revision_history' },
    ),
    mediaAssets.createIndex(
      { provider: 1, providerAssetId: 1 },
      { name: 'unique_provider_asset', unique: true },
    ),
    mediaAssets.createIndex(
      { checksum: 1 },
      { name: 'media_checksum', sparse: true },
    ),
    mediaAssets.createIndex(
      { title: 'text', originalFilename: 'text', caption: 'text', tags: 'text' },
      { name: 'media_search' },
    ),
    uploadSessions.createIndex(
      { idempotencyKey: 1 },
      { name: 'unique_upload_idempotency_key', unique: true },
    ),
    uploadSessions.createIndex(
      { expiresAt: 1 },
      { name: 'expire_upload_sessions', expireAfterSeconds: 60 * 60 * 24 },
    ),
  ]);
}
