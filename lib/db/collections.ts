import type { Collection, Db, MongoClient } from 'mongodb';

import type { Journey, JourneyRevision } from '@/lib/journeys/schemas';

export const COLLECTION_NAMES = {
  journeys: 'journeys',
  journeyRevisions: 'journey_revisions',
  mediaAssets: 'media_assets',
  uploadSessions: 'upload_sessions',
} as const;

/**
 * Resolve the database lazily so importing domain modules does not open a
 * connection (or require MONGODB_URI) in unit tests and build tooling.
 */
export async function getDatabase(): Promise<Db> {
  const mongoModule = (await import('@/lib/mongodb.js')) as {
    default: Promise<MongoClient>;
  };
  const clientPromise: Promise<MongoClient> = mongoModule.default;
  const client = await clientPromise;
  return client.db();
}

export async function getJourneyCollections(db?: Db): Promise<{
  journeys: Collection<Journey>;
  revisions: Collection<JourneyRevision>;
}> {
  const database = db ?? (await getDatabase());

  return {
    journeys: database.collection<Journey>(COLLECTION_NAMES.journeys),
    revisions: database.collection<JourneyRevision>(
      COLLECTION_NAMES.journeyRevisions,
    ),
  };
}
