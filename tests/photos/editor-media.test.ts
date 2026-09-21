import { describe, expect, it } from 'vitest';

import { serializePhotosEditorMedia } from '@/lib/photos/editor-media';
import type { MediaAsset } from '@/lib/media/schemas';

const now = new Date('2026-09-21T00:00:00.000Z');

function media(id: string, overrides: Partial<MediaAsset> = {}): MediaAsset {
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
    showInPhotos: true,
    status: 'ready',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

const provider = {
  buildImageUrl: ({ providerPublicId }: { providerPublicId: string }) => `https://images.test/${providerPublicId}`,
  buildVideoPosterUrl: ({ providerPublicId }: { providerPublicId: string }) => `https://images.test/${providerPublicId}.jpg`,
};

describe('serializePhotosEditorMedia', () => {
  it('returns a keyed minimal DTO for images and videos', () => {
    const serialized = serializePhotosEditorMedia([
      media('photo', { captureDate: '2026-09-20', altText: 'Sunset' }),
      media('clip', { resourceType: 'video', originalFilename: 'clip.mp4', format: 'mp4' }),
    ], provider);

    expect(serialized).toEqual({
      photo: {
        id: 'photo',
        originalFilename: 'photo.jpg',
        width: 1200,
        height: 800,
        captureDate: '2026-09-20',
        altText: 'Sunset',
        source: 'https://images.test/photos/photo',
        resourceType: 'image',
      },
      clip: {
        id: 'clip',
        originalFilename: 'clip.mp4',
        width: 1200,
        height: 800,
        source: 'https://images.test/photos/clip.jpg',
        resourceType: 'video',
      },
    });
  });

  it('does not produce a renderable source for an unavailable asset', () => {
    expect(serializePhotosEditorMedia([media('failed', { status: 'failed' })], provider).failed)
      .not.toHaveProperty('source');
  });
});
