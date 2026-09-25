import 'server-only';

import type { Collection } from 'mongodb';

import { getDatabase } from '@/lib/db/collections';
import { MediaRepository } from '@/lib/media/repository';
import { PhotosPageRepository } from '@/lib/photos/repository';

export type PhotoOpenDaily = {
  photoId: string;
  day: string;
  opens: number;
};

export type MostOpenedPhoto = {
  photoId: string;
  name: string;
  opens: number;
};

let photoOpenIndexReady: Promise<string> | undefined;

async function getPhotoOpenCounters() {
  const database = await getDatabase();
  const counters: Collection<PhotoOpenDaily> = database.collection('photo_open_daily');
  photoOpenIndexReady ??= counters.createIndex(
    { photoId: 1, day: 1 },
    { unique: true, name: 'photo_id_day_unique' },
  );
  try {
    await photoOpenIndexReady;
  } catch (error) {
    photoOpenIndexReady = undefined;
    throw error;
  }
  return counters;
}

export async function recordPhotoOpen(photoId: string, now = new Date()): Promise<void> {
  const page = await (await PhotosPageRepository.connect()).get();
  const isPublished = page?.publishedDocument?.blocks.some((block) =>
    block.type === 'media' && block.mediaAssetId === photoId,
  );
  if (!isPublished) throw new Error('PHOTO_NOT_PUBLISHED');

  const asset = await (await MediaRepository.connect()).findById(photoId);
  if (!asset || asset.status !== 'ready') throw new Error('PHOTO_NOT_AVAILABLE');

  const counters = await getPhotoOpenCounters();
  const day = now.toISOString().slice(0, 10);
  try {
    await counters.updateOne(
      { photoId, day },
      { $inc: { opens: 1 }, $setOnInsert: { photoId, day } },
      { upsert: true },
    );
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
      await counters.updateOne({ photoId, day }, { $inc: { opens: 1 } });
      return;
    }
    throw error;
  }
}

export async function loadMostOpenedPhotos(now = new Date(), limit = 12): Promise<MostOpenedPhoto[]> {
  const database = await getDatabase();
  const until = now.toISOString().slice(0, 10);
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 29))
    .toISOString()
    .slice(0, 10);
  const counters = database.collection<PhotoOpenDaily>('photo_open_daily');
  const totals = await counters.aggregate<{ _id: string; opens: number }>([
    { $match: { day: { $gte: since, $lte: until } } },
    { $group: { _id: '$photoId', opens: { $sum: '$opens' } } },
    { $sort: { opens: -1, _id: 1 } },
    { $limit: limit },
  ]).toArray();
  if (!totals.length) return [];

  const media = await (await MediaRepository.connect()).findByIds(totals.map((entry) => entry._id));
  const byId = new Map(media.map((asset) => [asset._id, asset]));
  return totals.flatMap((entry) => {
    const asset = byId.get(entry._id);
    if (!asset || asset.status !== 'ready') return [];
    return [{
      photoId: entry._id,
      name: asset.title ?? asset.caption ?? asset.originalFilename,
      opens: entry.opens,
    }];
  });
}
