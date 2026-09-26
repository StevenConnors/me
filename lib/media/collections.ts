import { ObjectId, type Collection, type Filter } from 'mongodb';
import { z } from 'zod';

import { getMediaLibraryCollections } from '@/lib/db/collections';
import type { MediaAsset } from '@/lib/media/schemas';

const nonEmpty = z.string().trim().min(1);
export const CollectionSuggestionRuleSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('subject'), query: nonEmpty.max(200) }).strict(),
  z.object({
    kind: z.literal('country'),
    countryCode: z.string().trim().regex(/^[A-Za-z]{2}$/).transform((value) => value.toUpperCase())
      .refine((value) => new Intl.DisplayNames(['en'], { type: 'region' }).of(value) !== value, 'Country code must be a recognized region'),
  }).strict(),
]);

export const MediaCollectionSchema = z.object({
  _id: z.string().regex(/^[a-f\d]{24}$/i),
  schemaVersion: z.literal(1),
  name: nonEmpty.max(120),
  description: z.string().trim().max(1_000).optional(),
  suggestionRule: CollectionSuggestionRuleSchema.optional(),
  dismissedMediaAssetIds: z.array(nonEmpty).max(10_000).optional(),
  mediaAssetIds: z.array(nonEmpty).max(10_000),
  createdAt: z.date(),
  updatedAt: z.date(),
}).strict();
export type MediaCollection = z.infer<typeof MediaCollectionSchema>;

export const CreateMediaCollectionSchema = z.object({
  name: nonEmpty.max(120),
  description: z.string().trim().max(1_000).optional(),
  suggestionRule: CollectionSuggestionRuleSchema.optional(),
}).strict();
export const PatchMediaCollectionSchema = z.object({
  name: nonEmpty.max(120).optional(),
  description: z.string().trim().max(1_000).nullable().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'At least one field must change');
export const CollectionMediaIdsSchema = z.object({
  mediaAssetIds: z.array(nonEmpty).max(10_000),
}).strict().refine(({ mediaAssetIds }) => new Set(mediaAssetIds).size === mediaAssetIds.length, 'Media IDs must be unique');

export class MediaCollectionNotFoundError extends Error {
  readonly code = 'COLLECTION_NOT_FOUND';
  constructor(readonly collectionId: string) { super(`Collection ${collectionId} was not found`); }
}
export class DuplicateMediaCollectionError extends Error {
  readonly code = 'COLLECTION_NAME_EXISTS';
  constructor(readonly name: string) { super(`A collection named ${name} already exists`); }
}
export class CollectionMediaNotFoundError extends Error {
  readonly code = 'COLLECTION_MEDIA_NOT_FOUND';
  constructor(readonly mediaAssetIds: string[]) { super(`Media assets not found: ${mediaAssetIds.join(', ')}`); }
}

export function serializeMediaCollection(collection: MediaCollection) {
  return { ...collection, mediaCount: collection.mediaAssetIds.length };
}

export class MediaCollectionRepository {
  constructor(
    readonly collections: Collection<MediaCollection>,
    readonly mediaAssets: Collection<MediaAsset>,
  ) {}

  static async connect() {
    const { collections, mediaAssets } = await getMediaLibraryCollections();
    return new MediaCollectionRepository(collections, mediaAssets);
  }

  async list(): Promise<MediaCollection[]> {
    const docs = await this.collections.find({}).sort({ name: 1, _id: 1 }).toArray();
    return docs.map((doc) => MediaCollectionSchema.parse(doc));
  }

  async create(input: unknown): Promise<MediaCollection> {
    const parsed = CreateMediaCollectionSchema.parse(input);
    await this.assertNameAvailable(parsed.name);
    const now = new Date();
    const collection = MediaCollectionSchema.parse({
      _id: new ObjectId().toHexString(), schemaVersion: 1, ...parsed,
      suggestionRule: parsed.suggestionRule ?? { kind: 'subject', query: parsed.name },
      mediaAssetIds: [], createdAt: now, updatedAt: now,
    });
    await this.collections.insertOne(collection);
    return collection;
  }

  async findById(id: string): Promise<MediaCollection | null> {
    if (!ObjectId.isValid(id)) return null;
    const doc = await this.collections.findOne({ _id: id } as Filter<MediaCollection>);
    return doc ? MediaCollectionSchema.parse(doc) : null;
  }

  async isMediaReferenced(mediaAssetId: string): Promise<boolean> {
    return Boolean(await this.collections.findOne({ mediaAssetIds: mediaAssetId } as Filter<MediaCollection>, { projection: { _id: 1 } }));
  }

  async patch(id: string, input: unknown): Promise<MediaCollection> {
    const patch = PatchMediaCollectionSchema.parse(input);
    const collection = await this.findById(id);
    if (!collection) throw new MediaCollectionNotFoundError(id);
    if (patch.name !== undefined) await this.assertNameAvailable(patch.name, id);
    const { description: _oldDescription, ...withoutDescription } = collection;
    const updated = MediaCollectionSchema.parse({
      ...withoutDescription,
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined && patch.description !== null ? { description: patch.description } : {}),
      updatedAt: new Date(),
    });
    await this.collections.replaceOne({ _id: collection._id } as Filter<MediaCollection>, updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    if (!ObjectId.isValid(id)) throw new MediaCollectionNotFoundError(id);
    const result = await this.collections.deleteOne({ _id: id } as Filter<MediaCollection>);
    if (!result.deletedCount) throw new MediaCollectionNotFoundError(id);
  }

  private async assertMediaExist(ids: string[]) {
    if (!ids.length) return;
    const found = await this.mediaAssets.find({ _id: { $in: ids }, status: 'ready' }).project({ _id: 1 }).toArray();
    const foundIds = new Set(found.map((asset) => asset._id));
    const missing = ids.filter((id) => !foundIds.has(id));
    if (missing.length) throw new CollectionMediaNotFoundError(missing);
  }

  private async assertNameAvailable(name: string, exceptId?: string) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const existing = await this.collections.findOne(
      { name: { $regex: `^${escaped}$`, $options: 'i' } } as Filter<MediaCollection>,
      { projection: { _id: 1 } },
    );
    if (existing && existing._id !== exceptId) throw new DuplicateMediaCollectionError(name);
  }

  async addMedia(id: string, mediaAssetIds: string[]): Promise<MediaCollection> {
    const collection = await this.findById(id);
    if (!collection) throw new MediaCollectionNotFoundError(id);
    await this.assertMediaExist(mediaAssetIds);
    const combined = [...collection.mediaAssetIds, ...mediaAssetIds.filter((assetId) => !collection.mediaAssetIds.includes(assetId))];
    return this.saveMediaOrder(collection, combined);
  }

  async removeMedia(id: string, mediaAssetIds: string[]): Promise<MediaCollection> {
    const collection = await this.findById(id);
    if (!collection) throw new MediaCollectionNotFoundError(id);
    const removed = new Set(mediaAssetIds);
    return this.saveMediaOrder(collection, collection.mediaAssetIds.filter((assetId) => !removed.has(assetId)));
  }

  async reorderMedia(id: string, mediaAssetIds: string[]): Promise<MediaCollection> {
    const collection = await this.findById(id);
    if (!collection) throw new MediaCollectionNotFoundError(id);
    await this.assertMediaExist(mediaAssetIds);
    if (mediaAssetIds.length !== collection.mediaAssetIds.length || mediaAssetIds.some((assetId) => !collection.mediaAssetIds.includes(assetId))) {
      throw new Error('Reordering must include every current media asset exactly once');
    }
    return this.saveMediaOrder(collection, mediaAssetIds);
  }

  private async saveMediaOrder(collection: MediaCollection, mediaAssetIds: string[]) {
    const updated = MediaCollectionSchema.parse({ ...collection, mediaAssetIds, updatedAt: new Date() });
    await this.collections.replaceOne({ _id: collection._id } as Filter<MediaCollection>, updated);
    return updated;
  }
}
