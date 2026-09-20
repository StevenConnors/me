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
    const repository = {
      findByIds: async () => [media('three'), media('one'), media('two')],
      listPhotos: async () => [],
    };

    const first = await loadPublicPhotosPage(page, repository, provider, { limit: 2 });
    const second = await loadPublicPhotosPage(page, repository, provider, { limit: 2, cursor: first.nextCursor! });

    expect(first.items.map((item) => item.id)).toEqual(['one', 'two']);
    expect(second.items).toMatchObject([{ id: 'three', sectionBreak: { title: 'Later' } }]);
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
