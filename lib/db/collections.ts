import type { Collection, Db, MongoClient } from 'mongodb';

import type { Journey, JourneyRevision } from '@/lib/journeys/schemas';
import type { MediaAsset, UploadSession } from '@/lib/media/schemas';
import type { PhotosPage } from '@/lib/photos/schemas';

export const COLLECTION_NAMES = {
  journeys: 'journeys',
  journeyRevisions: 'journey_revisions',
  mediaAssets: 'media_assets',
  uploadSessions: 'upload_sessions',
  photosPages: 'photos_pages',
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

export async function getMediaCollections(db?: Db): Promise<{
  mediaAssets: Collection<MediaAsset>;
  uploadSessions: Collection<UploadSession>;
}> {
  const database = db ?? (await getDatabase());

  return {
    mediaAssets: database.collection<MediaAsset>(COLLECTION_NAMES.mediaAssets),
    uploadSessions: database.collection<UploadSession>(COLLECTION_NAMES.uploadSessions),
  };
}

export async function getPhotosCollections(db?: Db): Promise<{
  photosPages: Collection<PhotosPage>;
  mediaAssets: Collection<MediaAsset>;
}> {
  const database = db ?? (await getDatabase());
  return {
    photosPages: database.collection<PhotosPage>(COLLECTION_NAMES.photosPages),
    mediaAssets: database.collection<MediaAsset>(COLLECTION_NAMES.mediaAssets),
  };
}
