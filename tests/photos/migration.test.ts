import { describe, expect, it } from 'vitest';

import {
  compareLegacyPhotosDocument,
  createPhotosDocumentFromLegacyMedia,
  photosDocumentDigest,
} from '@/lib/photos/migration';
import { appendMissingMedia } from '../../scripts/migrate-photos-page.mjs';
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

describe('Photos legacy migration', () => {
  it('keeps the supplied legacy query order and turns attached breaks into standalone blocks', () => {
    const legacy = [
      media('most-recent', { captureDate: '2026-09-20', caption: 'After rain' }),
      media('section-start', {
        captureDate: '2026-09-19',
        altText: 'A lake in morning fog',
        photoSectionBreak: { title: 'North shore', text: 'A slow morning.' },
      }),
      media('oldest', { captureDate: '2026-09-18', photoSectionBreak: {} }),
    ];
    let id = 0;
    const document = createPhotosDocumentFromLegacyMedia(legacy, () => `block-${++id}`);

    expect(document.blocks.map((block) => block.type === 'media' ? block.mediaAssetId : block.type)).toEqual([
      'most-recent', 'section', 'section-start', 'section', 'oldest',
    ]);
    expect(document.blocks[1]).toMatchObject({ title: 'North shore', text: 'A slow morning.' });
    expect(document.blocks[2]).toMatchObject({ altText: 'A lake in morning fog', decorative: false });
    expect(document.blocks[0]).toMatchObject({ caption: 'After rain', decorative: true });
    expect(compareLegacyPhotosDocument(legacy, document)).toEqual([]);
  });

  it('reports a deterministic semantic digest without generated block IDs', () => {
    const legacy = [media('one', { altText: 'First photo' })];
    const first = createPhotosDocumentFromLegacyMedia(legacy, () => 'first-id');
    const second = createPhotosDocumentFromLegacyMedia(legacy, () => 'second-id');

    expect(photosDocumentDigest(first)).toEqual(photosDocumentDigest(second));
    expect(compareLegacyPhotosDocument(legacy, {
      ...first,
      blocks: [],
    })).toHaveLength(1);
  });

  it('backfills only missing media after the existing author-owned composition', () => {
    const current = createPhotosDocumentFromLegacyMedia([media('already-placed')], () => 'existing-block');
    const result = appendMissingMedia(current, [
      media('already-placed'),
      media('new-photo', { photoSectionBreak: { title: 'Recovered' } }),
    ]);

    expect(result.addedMedia).toBe(1);
    expect(result.document.blocks[0]).toBe(current.blocks[0]);
    expect(result.document.blocks.slice(1)).toMatchObject([
      { type: 'section', title: 'Recovered' },
      { type: 'media', mediaAssetId: 'new-photo' },
    ]);
  });
});
