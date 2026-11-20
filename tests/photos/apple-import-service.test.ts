import { ObjectId, type UpdateResult } from 'mongodb';
import { describe, expect, it } from 'vitest';

import { MediaAssetSchema, type MediaAsset } from '@/lib/media/schemas';
import { ApplePhotosImportService } from '@/lib/photos/apple-import/service';
import type { ApplePhotosImportState } from '@/lib/photos/apple-import/schemas';
import { PhotosPageConflictError } from '@/lib/photos/repository';
import type { PhotosPage, PhotosPageDocument } from '@/lib/photos/schemas';

const now = new Date('2026-11-21T00:00:00.000Z');

const asset = (id: string): MediaAsset => MediaAssetSchema.parse({
  _id: id, schemaVersion: 1, provider: 'cloudinary', providerAssetId: `asset-${id}`, providerPublicId: `e2e/${id}`,
  resourceType: 'image', deliveryType: 'upload', version: 1, originalFilename: `${id}.jpg`, format: 'jpg',
  width: 400, height: 300, bytes: 100, tags: [], showInPhotos: false, status: 'ready', createdAt: now, updatedAt: now,
});

class MemoryImports {
  state: ApplePhotosImportState | null = null;
  async findOne() { return this.state; }
  async updateOne(_filter: unknown, update: { $set: Omit<ApplePhotosImportState, '_id' | 'createdAt'> }): Promise<UpdateResult> {
    this.state = { _id: 'apple-photos', createdAt: this.state?.createdAt ?? now, ...update.$set };
    return { acknowledged: true, matchedCount: 1, modifiedCount: 1, upsertedCount: 0, upsertedId: new ObjectId() };
  }
}

/** A Photos page whose author saves once between the import's read and write. */
class RacingPhotosPages {
  page: PhotosPage;
  racesLeft: number;
  constructor(blocks: PhotosPageDocument['blocks'], races: number) {
    this.page = { _id: 'photos', schemaVersion: 1, draftDocument: { schemaVersion: 1, blocks }, draftVersion: 1, createdAt: now, updatedAt: now };
    this.racesLeft = races;
  }
  async get() { return structuredClone(this.page); }
  async updateDraft(expectedVersion: number, document: PhotosPageDocument) {
    if (this.racesLeft > 0) {
      this.racesLeft -= 1;
      this.page = {
        ...this.page,
        draftVersion: this.page.draftVersion + 1,
        draftDocument: { ...this.page.draftDocument, blocks: this.page.draftDocument.blocks.map((block) => block.type === 'section' ? { ...block, title: 'Author title' } : block) },
      };
    }
    if (expectedVersion !== this.page.draftVersion) throw new PhotosPageConflictError(expectedVersion, this.page.draftVersion);
    this.page = { ...this.page, draftDocument: document, draftVersion: expectedVersion + 1 };
    return this.page;
  }
}

const request = { albums: [{ sourceAlbumId: 'album-1', title: 'Kumano', photos: [{ sourcePhotoId: 'p1', sourceVersion: 'v1', mediaAssetId: 'm1', cover: false }] }] };
const authorSection = { id: 'author-section', type: 'section' as const, title: 'Earlier' };

let nextId = 0;
const service = (pages: RacingPhotosPages, imports = new MemoryImports()) =>
  new ApplePhotosImportService(imports, pages, { findByIds: async (ids) => Array.from(ids).map(asset) }, () => `id-${(nextId += 1)}`);

describe('ApplePhotosImportService.sync', () => {
  it('re-plans on top of an author save that lands mid-sync instead of overwriting it', async () => {
    const pages = new RacingPhotosPages([authorSection, { id: 'author-photo', type: 'media', mediaAssetId: 'm0', decorative: false, altText: 'Hill' }], 1);
    const result = await service(pages).sync(request);

    expect(result.draftChanged).toBe(true);
    expect(pages.page.draftDocument.blocks.map((block) => block.type === 'section' ? block.title : block.mediaAssetId))
      .toEqual(['Author title', 'm0', 'Kumano', 'm1']);
  });

  it('gives up with a conflict after repeated author saves', async () => {
    const pages = new RacingPhotosPages([authorSection, { id: 'author-photo', type: 'media', mediaAssetId: 'm0', decorative: false, altText: 'Hill' }], 5);
    await expect(service(pages).sync(request)).rejects.toBeInstanceOf(PhotosPageConflictError);
  });

  it('repairs a draft that missed the write after the import state was saved', async () => {
    const imports = new MemoryImports();
    const pages = new RacingPhotosPages([authorSection, { id: 'author-photo', type: 'media', mediaAssetId: 'm0', decorative: false, altText: 'Hill' }], 0);
    const original = pages.page;
    await service(pages, imports).sync(request);
    pages.page = { ...original, draftVersion: pages.page.draftVersion };

    await service(pages, imports).sync(request);
    expect(pages.page.draftDocument.blocks.map((block) => block.type === 'section' ? block.title : block.mediaAssetId))
      .toEqual(['Earlier', 'm0', 'Kumano', 'm1']);
  });
});
