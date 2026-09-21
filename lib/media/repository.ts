import { ObjectId, type Collection, type Filter, type UpdateFilter } from 'mongodb';
import { z } from 'zod';

import { getMediaCollections } from '@/lib/db/collections';
import { UploadIntentSchema, type ProviderAsset, type UploadIntent } from '@/lib/media/providers/MediaProvider';
import {
  MediaAssetSchema,
  PhotoSectionBreakSchema,
  UploadSessionSchema,
  type MediaAsset,
  type UploadSession,
} from '@/lib/media/schemas';
import { decodeAdminMediaCursor, encodeAdminMediaCursor } from '@/lib/media/admin-cursor';

const MediaMetadataPatchSchema = z
  .object({
    title: z.string().trim().max(500).nullable().optional(),
    caption: z.string().trim().max(2_000).nullable().optional(),
    altText: z.string().trim().max(1_000).nullable().optional(),
    tags: z.array(z.string().trim().min(1)).max(100).optional(),
    captureDate: z.string().date().nullable().optional(),
    showInPhotos: z.boolean().optional(),
    photoSectionBreak: PhotoSectionBreakSchema.nullable().optional(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, 'At least one field must change');

export type MediaMetadataPatch = z.infer<typeof MediaMetadataPatchSchema>;

export class MediaNotFoundError extends Error {
  readonly code = 'MEDIA_NOT_FOUND';
  constructor(readonly mediaId: string) {
    super(`Media asset ${mediaId} was not found`);
  }
}

export class UploadSessionNotFoundError extends Error {
  readonly code = 'UPLOAD_SESSION_NOT_FOUND';
  constructor(readonly idempotencyKey: string) {
    super(`Upload session ${idempotencyKey} was not found`);
  }
}

export class UploadResourceTypeMismatchError extends Error {
  readonly code = 'UPLOAD_RESOURCE_TYPE_MISMATCH';
  constructor(readonly expectedResourceType: 'image' | 'video', readonly actualResourceType: 'image' | 'video') {
    super(`Upload session expected ${expectedResourceType}, received ${actualResourceType}`);
    this.name = 'UploadResourceTypeMismatchError';
  }
}

function unwrapResult<T>(result: unknown): T | null {
  if (result === null) return null;
  if (typeof result === 'object' && result && 'value' in result) {
    return ((result as { value?: T | null }).value ?? null) as T | null;
  }
  return result as T;
}

function newApplicationMediaId() {
  return new ObjectId().toHexString();
}

export class MediaRepository {
  constructor(
    readonly mediaAssets: Collection<MediaAsset>,
    readonly uploadSessions: Collection<UploadSession>,
  ) {}

  static async connect() {
    const { mediaAssets, uploadSessions } = await getMediaCollections();
    return new MediaRepository(mediaAssets, uploadSessions);
  }

  async list(options: { query?: string; limit?: number } = {}): Promise<MediaAsset[]> {
    const query = options.query?.trim();
    const filter = query ? { $text: { $search: query } } : {};
    const limit = Math.min(Math.max(options.limit ?? 60, 1), 100);
    const assets = await this.mediaAssets
      .find(filter)
      .sort(query ? { score: { $meta: 'textScore' }, createdAt: -1 } : { createdAt: -1 })
      .limit(limit)
      .toArray();
    return assets.map((asset) => MediaAssetSchema.parse(asset));
  }

  /** Cursor-paginated, image-filterable media library listing for the Photos picker. */
  async listPage(options: {
    query?: string;
    limit?: number;
    cursor?: string;
    resourceType?: 'image' | 'video';
  } = {}): Promise<{ items: MediaAsset[]; nextCursor: string | null }> {
    const limit = Math.min(Math.max(options.limit ?? 24, 1), 100);
    const filters: Filter<MediaAsset>[] = [];
    const query = options.query?.trim();
    if (query) filters.push({ $text: { $search: query } } as Filter<MediaAsset>);
    if (options.resourceType) filters.push({ resourceType: options.resourceType });
    if (options.cursor) {
      const cursor = decodeAdminMediaCursor(options.cursor);
      const createdAt = new Date(cursor.createdAt);
      filters.push({
        $or: [
          { createdAt: { $lt: createdAt } },
          { createdAt, _id: { $lt: cursor.id } },
        ],
      } as Filter<MediaAsset>);
    }
    const filter = filters.length === 0 ? {} : filters.length === 1 ? filters[0] : { $and: filters } as Filter<MediaAsset>;
    const records = await this.mediaAssets
      .find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .toArray();
    const hasNextPage = records.length > limit;
    const page = records.slice(0, limit).map((asset) => MediaAssetSchema.parse(asset));
    const last = page[page.length - 1];
    return {
      items: page,
      nextCursor: hasNextPage && last ? encodeAdminMediaCursor({
        version: 1,
        createdAt: last.createdAt.toISOString(),
        id: last._id,
      }) : null,
    };
  }

  /**
   * The public gallery is deliberately separate from the general media
   * library. Capture date is an ISO date, so a descending sort puts the most
   * recent photographs first; uploads without one follow at the end.
   */
  async listPhotos(options: { limit?: number } = {}): Promise<MediaAsset[]> {
    const limit = Math.min(Math.max(options.limit ?? 500, 1), 500);
    const assets = await this.mediaAssets
      .find({ status: 'ready', showInPhotos: true, resourceType: 'image' })
      .sort({ captureDate: -1, createdAt: -1 })
      .limit(limit)
      .toArray();
    return assets.map((asset) => MediaAssetSchema.parse(asset));
  }

  async findById(mediaId: string): Promise<MediaAsset | null> {
    const asset = await this.mediaAssets.findOne({ _id: mediaId });
    return asset ? MediaAssetSchema.parse(asset) : null;
  }

  async findByIds(mediaIds: Iterable<string>): Promise<MediaAsset[]> {
    const ids = Array.from(new Set(mediaIds));
    if (!ids.length) return [];
    const assets = await this.mediaAssets.find({ _id: { $in: ids } }).toArray();
    return assets.map((asset) => MediaAssetSchema.parse(asset));
  }

  async findByProviderAssetId(providerAssetId: string): Promise<MediaAsset | null> {
    const asset = await this.mediaAssets.findOne({
      provider: 'cloudinary',
      providerAssetId,
    });
    return asset ? MediaAssetSchema.parse(asset) : null;
  }

  async deleteById(mediaId: string): Promise<void> {
    const result = await this.mediaAssets.deleteOne({ _id: mediaId });
    if (!result.deletedCount) throw new MediaNotFoundError(mediaId);
  }

  async createOrReuseUploadSession(
    intent: UploadIntent,
    options: { now?: Date; ttlMs?: number } = {},
  ): Promise<UploadSession> {
    const parsedIntent = UploadIntentSchema.parse(intent);
    const existing = await this.uploadSessions.findOne({ idempotencyKey: parsedIntent.idempotencyKey });
    if (existing) return UploadSessionSchema.parse(existing);

    const now = options.now ?? new Date();
    const session = UploadSessionSchema.parse({
      _id: newApplicationMediaId(),
      schemaVersion: 1,
      idempotencyKey: parsedIntent.idempotencyKey,
      ...(parsedIntent.intendedJourneyId ? { intendedJourneyId: parsedIntent.intendedJourneyId } : {}),
      status: 'created',
      expectedResourceType: parsedIntent.resourceType,
      createdAt: now,
      expiresAt: new Date(now.valueOf() + (options.ttlMs ?? 10 * 60 * 1_000)),
    });

    try {
      await this.uploadSessions.insertOne(session);
      return session;
    } catch (error) {
      if (typeof error === 'object' && error && 'code' in error && (error as { code?: unknown }).code === 11000) {
        const concurrent = await this.uploadSessions.findOne({ idempotencyKey: session.idempotencyKey });
        if (concurrent) return UploadSessionSchema.parse(concurrent);
      }
      throw error;
    }
  }

  async finalizeUpload(
    idempotencyKey: string,
    providerAsset: ProviderAsset,
    options: { now?: Date } = {},
  ): Promise<MediaAsset> {
    const session = await this.uploadSessions.findOne({ idempotencyKey });
    if (!session) throw new UploadSessionNotFoundError(idempotencyKey);
    const parsedSession = UploadSessionSchema.parse(session);
    if (parsedSession.status === 'finalized' && parsedSession.mediaAssetId) {
      const existing = await this.findById(parsedSession.mediaAssetId);
      if (existing) return existing;
    }
    if (parsedSession.expectedResourceType !== providerAsset.resourceType) {
      throw new UploadResourceTypeMismatchError(parsedSession.expectedResourceType, providerAsset.resourceType);
    }

    const now = options.now ?? new Date();
    const candidate = MediaAssetSchema.parse({
      _id: newApplicationMediaId(),
      schemaVersion: 1,
      provider: 'cloudinary',
      providerAssetId: providerAsset.providerAssetId,
      providerPublicId: providerAsset.providerPublicId,
      resourceType: providerAsset.resourceType,
      deliveryType: providerAsset.deliveryType,
      version: providerAsset.version,
      originalFilename: providerAsset.originalFilename,
      format: providerAsset.format,
      width: providerAsset.width,
      height: providerAsset.height,
      bytes: providerAsset.bytes,
      ...(providerAsset.checksum ? { checksum: providerAsset.checksum } : {}),
      tags: providerAsset.tags,
      status: 'ready',
      createdAt: now,
      updatedAt: now,
    });

    const raw = await this.mediaAssets.findOneAndUpdate(
      { provider: 'cloudinary', providerAssetId: candidate.providerAssetId },
      { $setOnInsert: candidate },
      { upsert: true, returnDocument: 'after' },
    );
    const asset = MediaAssetSchema.parse(unwrapResult<MediaAsset>(raw));

    await this.uploadSessions.updateOne(
      { _id: parsedSession._id },
      {
        $set: {
          status: 'finalized',
          providerAssetId: asset.providerAssetId,
          mediaAssetId: asset._id,
        },
      },
    );
    return asset;
  }

  async updateMetadata(
    mediaId: string,
    input: MediaMetadataPatch,
    options: { now?: Date } = {},
  ): Promise<MediaAsset> {
    const patch = MediaMetadataPatchSchema.parse(input);
    const set: Record<string, unknown> = { updatedAt: options.now ?? new Date() };
    const unset: Record<string, ''> = {};
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) unset[key] = '';
      else set[key] = value;
    }
    const raw = await this.mediaAssets.findOneAndUpdate(
      { _id: mediaId },
      {
        $set: set,
        ...(Object.keys(unset).length ? { $unset: unset } : {}),
      } as UpdateFilter<MediaAsset>,
      { returnDocument: 'after' },
    );
    const asset = unwrapResult<MediaAsset>(raw);
    if (!asset) throw new MediaNotFoundError(mediaId);
    return MediaAssetSchema.parse(asset);
  }
}
