import { describe, expect, it } from 'vitest';

import { loadPublicPhotosPage } from '@/lib/photos/gallery';
import type { MediaAsset } from '@/lib/media/schemas';
import type { PhotosPage } from '@/lib/photos/schemas';

const now = new Date('2026-09-21T00:00:00.000Z');

function media(id: string): MediaAsset {
  return {
    _id: id, schemaVersion: 1, provider: 'cloudinary', providerAssetId: `provider-${id}`, providerPublicId: `photos/${id}`,
    resourceType: 'image', deliveryType: 'upload', originalFilename: `${id}.jpg`, format: 'jpg', width: 1200, height: 800,
    bytes: 100, tags: [], showInPhotos: true, status: 'ready', createdAt: now, updatedAt: now,
  };
}

const provider = {
  buildImageUrl: ({ providerPublicId }: { providerPublicId: string }) => `https://images.test/${providerPublicId}`,
  buildVideoPosterUrl: ({ providerPublicId }: { providerPublicId: string }) => `https://images.test/${providerPublicId}.jpg`,
  buildVideoUrl: ({ providerPublicId }: { providerPublicId: string }) => `https://videos.test/${providerPublicId}.mp4`,
};

describe('loadPublicPhotosPage', () => {
  it('pages in published block order and retains a section that starts on a later page', async () => {
    const page: PhotosPage = {
      _id: 'photos', schemaVersion: 1, draftVersion: 2,
      draftDocument: { schemaVersion: 1, blocks: [] },
      publishedDocument: {
        schemaVersion: 1,
        blocks: [
          { id: 'one-block', type: 'media', mediaAssetId: 'one', decorative: true },
          { id: 'two-block', type: 'media', mediaAssetId: 'two', decorative: true },
          { id: 'section', type: 'section', title: 'Later' },
          { id: 'three-block', type: 'media', mediaAssetId: 'three', decorative: true },
        ],
      },
      createdAt: now, updatedAt: now, publishedAt: now,
    };
    const requestedIds: string[][] = [];
    const assets = new Map(['one', 'two', 'three'].map((id) => [id, media(id)]));
    const repository = {
      findByIds: async (ids: Iterable<string>) => {
        const requested = Array.from(ids);
        requestedIds.push(requested);
        return [...requested].reverse().map((id) => assets.get(id)!);
      },
      listPhotos: async () => [],
    };

    const first = await loadPublicPhotosPage(page, repository, provider, { limit: 2 });
    const second = await loadPublicPhotosPage(page, repository, provider, { limit: 2, cursor: first.nextCursor! });

    expect(first.items.map((item) => item.id)).toEqual(['one', 'two']);
    expect(second.items).toMatchObject([{ id: 'three', sectionBreak: { title: 'Later' } }]);
    expect(second.nextCursor).toBeNull();
    expect(requestedIds).toEqual([['one', 'two', 'three'], ['three']]);
  });

  it('scans past unavailable references without resolving the entire document', async () => {
    const ids = ['missing-one', 'two', 'missing-three', 'four', 'five'];
    const page: PhotosPage = {
      _id: 'photos', schemaVersion: 1, draftVersion: 1,
      draftDocument: { schemaVersion: 1, blocks: [] },
      publishedDocument: {
        schemaVersion: 1,
        blocks: ids.map((id) => ({ id: `${id}-block`, type: 'media' as const, mediaAssetId: id, decorative: true })),
      },
      createdAt: now, updatedAt: now, publishedAt: now,
    };
    const assets = new Map(['two', 'four', 'five'].map((id) => [id, media(id)]));
    const requestedIds: string[][] = [];
    const repository = {
      findByIds: async (mediaIds: Iterable<string>) => {
        const requested = Array.from(mediaIds);
        requestedIds.push(requested);
        return requested.flatMap((id) => assets.get(id) ?? []);
      },
      listPhotos: async () => [],
    };

    const result = await loadPublicPhotosPage(page, repository, provider, { limit: 2 });

    expect(result.items.map((item) => item.id)).toEqual(['two', 'four']);
    expect(result.nextCursor).not.toBeNull();
    expect(result.unavailable.map((item) => item.mediaAssetId)).toEqual(['missing-one', 'missing-three']);
    expect(requestedIds).toEqual([['missing-one', 'two', 'missing-three'], ['four', 'five']]);
  });

  it('paginates the legacy fallback instead of dropping everything after the first page', async () => {
    const legacy = [media('one'), media('two'), media('three')];
    const repository = {
      findByIds: async () => [],
      listPhotos: async () => legacy,
    };

    const first = await loadPublicPhotosPage(null, repository, provider, { limit: 2 });
    const second = await loadPublicPhotosPage(null, repository, provider, { limit: 2, cursor: first.nextCursor! });

    expect(first.items.map((item) => item.id)).toEqual(['one', 'two']);
    expect(first.nextCursor).not.toBeNull();
    expect(second.items.map((item) => item.id)).toEqual(['three']);
    expect(second.nextCursor).toBeNull();
  });

  it('rejects a cursor after the published document changes', async () => {
    const page: PhotosPage = {
      _id: 'photos', schemaVersion: 1, draftVersion: 2,
      draftDocument: { schemaVersion: 1, blocks: [] },
      publishedDocument: { schemaVersion: 1, blocks: [{ id: 'one-block', type: 'media', mediaAssetId: 'one', decorative: true }] },
      createdAt: now, updatedAt: now, publishedAt: now,
    };
    await expect(loadPublicPhotosPage(page, { findByIds: async () => [media('one')], listPhotos: async () => [] }, provider, {
      cursor: 'not-a-cursor',
    })).rejects.toMatchObject({ code: 'INVALID_GALLERY_CURSOR' });
  });
});
