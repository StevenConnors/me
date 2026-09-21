import type { Collection } from 'mongodb';
import { describe, expect, it } from 'vitest';

import {
  PhotosPageConflictError,
  PhotosPageRepository,
} from '@/lib/photos/repository';
import {
  PhotosPageDocumentSchema,
  type PhotosPage,
  type PhotosPageDocument,
} from '@/lib/photos/schemas';
import type { MediaAsset } from '@/lib/media/schemas';

const now = new Date('2026-09-21T00:00:00.000Z');

const mediaBlock = (overrides: Partial<PhotosPageDocument['blocks'][number]> = {}) => ({
  id: 'block-photo-1',
  type: 'media' as const,
  mediaAssetId: 'media-photo-1',
  decorative: false,
  altText: 'A long ridge at sunrise',
  ...overrides,
});

const documentWithOnePhoto = (): PhotosPageDocument => PhotosPageDocumentSchema.parse({
  schemaVersion: 1,
  blocks: [mediaBlock()],
});

class MemoryPhotosPages {
  record: PhotosPage | null = null;

  async findOne(filter: Record<string, unknown>) {
    if (!this.record || !matches(this.record, filter)) return null;
    return this.record;
  }

  async findOneAndUpdate(
    filter: Record<string, unknown>,
    update: Record<string, unknown> | Array<Record<string, unknown>>,
    options: { upsert?: boolean } = {},
  ) {
    if (!this.record && options.upsert && '$setOnInsert' in update) {
      this.record = (update.$setOnInsert as PhotosPage);
      return { value: this.record };
    }
    if (!this.record || !matches(this.record, filter)) return { value: null };

    if (Array.isArray(update)) {
      const set = update[0].$set as Record<string, unknown>;
      for (const [key, value] of Object.entries(set)) {
        if (value === '$draftDocument') this.record[key as keyof PhotosPage] = this.record.draftDocument as never;
        else if (value === '$publishedDocument') this.record[key as keyof PhotosPage] = this.record.publishedDocument as never;
        else if (value && typeof value === 'object' && '$add' in value) {
          this.record.draftVersion += 1;
        } else {
          this.record[key as keyof PhotosPage] = value as never;
        }
      }
    } else {
      if (update.$set) Object.assign(this.record, update.$set);
      if (update.$inc) {
        this.record.draftVersion += (update.$inc as { draftVersion?: number }).draftVersion ?? 0;
      }
    }
    return { value: this.record };
  }
}

class MemoryMediaAssets {
  constructor(readonly records: MediaAsset[]) {}

  find(filter: { _id?: { $in?: string[] } }) {
    const ids = new Set(filter._id?.$in ?? []);
    return { toArray: async () => this.records.filter((asset) => ids.has(asset._id)) };
  }
}

function matches(page: PhotosPage, filter: Record<string, unknown>): boolean {
  if (filter._id !== undefined && page._id !== filter._id) return false;
  if (filter.draftVersion !== undefined && page.draftVersion !== filter.draftVersion) return false;
  if (filter.publishedDocument && typeof filter.publishedDocument === 'object' && '$exists' in filter.publishedDocument) {
    return Boolean(page.publishedDocument) === Boolean((filter.publishedDocument as { $exists: boolean }).$exists);
  }
  return true;
}

function readyImage(id = 'media-photo-1'): MediaAsset {
  return {
    _id: id,
    schemaVersion: 1,
    provider: 'cloudinary',
    providerAssetId: `provider-${id}`,
    providerPublicId: `photos/${id}`,
    resourceType: 'image',
    deliveryType: 'upload',
    originalFilename: `${id}.jpg`,
    format: 'jpg',
    width: 1200,
    height: 800,
    bytes: 100,
    tags: [],
    showInPhotos: false,
    status: 'ready',
    createdAt: now,
    updatedAt: now,
  };
}

describe('PhotosPageDocumentSchema', () => {
  it('rejects unknown fields, duplicate blocks, and duplicate media references', () => {
    expect(PhotosPageDocumentSchema.safeParse({
      schemaVersion: 1,
      blocks: [
        mediaBlock(),
        { ...mediaBlock(), id: 'block-photo-2' },
      ],
    }).success).toBe(false);
    expect(PhotosPageDocumentSchema.safeParse({
      schemaVersion: 1,
      blocks: [{ ...mediaBlock(), unexpected: true }],
    }).success).toBe(false);
  });

  it('rejects blank copy after trimming', () => {
    expect(PhotosPageDocumentSchema.safeParse({
      schemaVersion: 1,
      blocks: [{ ...mediaBlock(), altText: '   ' }],
    }).success).toBe(false);
  });
});

describe('PhotosPageRepository', () => {
  it('saves drafts optimistically and reports a stale version without mutation', async () => {
    const pages = new MemoryPhotosPages();
    const repository = new PhotosPageRepository(
      pages as unknown as Collection<PhotosPage>,
      new MemoryMediaAssets([readyImage()]) as unknown as Collection<MediaAsset>,
    );
    await repository.createIfMissing({ publishedDocument: { schemaVersion: 1, blocks: [] }, now });

    const saved = await repository.updateDraft(0, documentWithOnePhoto(), { now });
    expect(saved.draftVersion).toBe(1);
    await expect(repository.updateDraft(0, documentWithOnePhoto(), { now })).rejects.toBeInstanceOf(PhotosPageConflictError);
    expect((await repository.get())?.draftVersion).toBe(1);
  });

  it('publishes the exact persisted draft and later draft edits stay private', async () => {
    const pages = new MemoryPhotosPages();
    const repository = new PhotosPageRepository(
      pages as unknown as Collection<PhotosPage>,
      new MemoryMediaAssets([readyImage()]) as unknown as Collection<MediaAsset>,
    );
    await repository.createIfMissing({ publishedDocument: { schemaVersion: 1, blocks: [] }, now });
    await repository.updateDraft(0, documentWithOnePhoto(), { now });

    const published = await repository.publish(1, { now });
    expect(published.draftVersion).toBe(2);
    expect(published.publishedDocument).toEqual(documentWithOnePhoto());

    const changedDraft = PhotosPageDocumentSchema.parse({
      schemaVersion: 1,
      blocks: [{ ...mediaBlock(), caption: 'Unpublished change' }],
    });
    const saved = await repository.updateDraft(2, changedDraft, { now });
    expect(saved.publishedDocument).toEqual(documentWithOnePhoto());

    const discarded = await repository.discardDraft(3, { now });
    expect(discarded.draftDocument).toEqual(documentWithOnePhoto());
  });

  it('blocks publication until structural and media requirements are satisfied', async () => {
    const pages = new MemoryPhotosPages();
    const repository = new PhotosPageRepository(
      pages as unknown as Collection<PhotosPage>,
      new MemoryMediaAssets([readyImage()]) as unknown as Collection<MediaAsset>,
    );
    const invalid = PhotosPageDocumentSchema.parse({
      schemaVersion: 1,
      blocks: [
        { id: 'section-1', type: 'section', title: 'Unfinished' },
        { ...mediaBlock(), altText: undefined },
      ],
    });
    await repository.createIfMissing({ draftDocument: invalid, publishedDocument: { schemaVersion: 1, blocks: [] }, now });

    await expect(repository.publish(0, { now })).rejects.toMatchObject({
      code: 'PHOTOS_PUBLISH_INVALID',
    });
  });
});
