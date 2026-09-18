import type { Db } from 'mongodb';

import { COLLECTION_NAMES, getDatabase } from '@/lib/db/collections';

export async function ensureJourneyIndexes(db?: Db): Promise<void> {
  const database = db ?? (await getDatabase());
  const journeys = database.collection(COLLECTION_NAMES.journeys);
  const revisions = database.collection(COLLECTION_NAMES.journeyRevisions);

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
  ]);
}
