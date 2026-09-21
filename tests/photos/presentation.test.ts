import { describe, expect, it } from 'vitest';

import { resolveLegacyPhotos, resolvePublishedPhotos } from '@/lib/photos/presentation';
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
  buildVideoUrl: ({ providerPublicId }: { providerPublicId: string }) => `https://videos.test/${providerPublicId}.mp4`,
};

describe('Photos public presentation', () => {
  it('walks the persisted document instead of relying on MongoDB $in order', () => {
    const document = {
      schemaVersion: 1 as const,
      blocks: [
        { id: 'media-first', type: 'media' as const, mediaAssetId: 'first', altText: 'First', decorative: false },
        { id: 'section', type: 'section' as const, title: 'Second group' },
        { id: 'media-second', type: 'media' as const, mediaAssetId: 'second', altText: 'Second', decorative: false },
      ],
    };

    const result = resolvePublishedPhotos(document, [media('second'), media('first')], provider);

    expect(result.photos.map((photo) => photo.id)).toEqual(['first', 'second']);
    expect(result.photos[1]).toMatchObject({ sectionBreak: { title: 'Second group' } });
    expect(result.unavailable).toEqual([]);
  });

  it('retains a real blank break and skips missing assets without a broken URL', () => {
    const document = {
      schemaVersion: 1 as const,
      blocks: [
        { id: 'section', type: 'section' as const },
        { id: 'missing', type: 'media' as const, mediaAssetId: 'gone', altText: 'Gone', decorative: false },
        { id: 'present', type: 'media' as const, mediaAssetId: 'present', altText: 'Present', decorative: false },
      ],
    };
    const result = resolvePublishedPhotos(document, [media('present')], provider);

    expect(result.unavailable).toEqual([{ blockId: 'missing', mediaAssetId: 'gone', reason: 'missing' }]);
    expect(result.photos[0].sectionBreak).toEqual({});
    expect(result.photos[0].source).toContain('present');
  });

  it('maps a ready video to a generated poster without turning its playback URL into a grid source', () => {
    const document = {
      schemaVersion: 1 as const,
      blocks: [
        { id: 'video-block', type: 'media' as const, mediaAssetId: 'clip', altText: 'Waves moving across the shore', decorative: false },
      ],
    };

    const result = resolvePublishedPhotos(document, [media('clip', {
      resourceType: 'video', originalFilename: 'clip.mp4', format: 'mp4', width: 1920, height: 1080,
    })], provider);

    expect(result.photos).toEqual([expect.objectContaining({
      id: 'clip',
      kind: 'video',
      posterUrl: 'https://images.test/photos/clip.jpg',
      source: 'https://images.test/photos/clip.jpg',
      playbackUrl: 'https://videos.test/photos/clip.mp4',
    })]);
    expect(result.unavailable).toEqual([]);
  });

  it('keeps decorative media alt text empty even when the asset has descriptive metadata', () => {
    const document = {
      schemaVersion: 1 as const,
      blocks: [
        { id: 'decorative-block', type: 'media' as const, mediaAssetId: 'decorative', decorative: true },
      ],
    };

    const result = resolvePublishedPhotos(document, [media('decorative', {
      altText: 'A description that should not be announced',
      caption: 'A visible caption',
    })], provider);

    expect(result.photos[0]).toMatchObject({
      alt: '',
      caption: 'A visible caption',
    });
  });

  it('keeps the legacy attached-break reader as the rollout fallback', () => {
    const photos = resolveLegacyPhotos([media('legacy', { photoSectionBreak: { text: 'Notes' } })], provider);
    expect(photos[0]).toMatchObject({ id: 'legacy', sectionBreak: { text: 'Notes' } });
  });
});
