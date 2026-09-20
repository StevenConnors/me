import { describe, expect, it } from 'vitest';

import { planExactDuplicateDeletion } from '../../scripts/delete-duplicate-cloudinary-images.mjs';
import { newMediaDocument } from '../../scripts/import-cloudinary-images-to-photos.mjs';

const asset = (providerAssetId: string, createdAt: string, checksum?: string) => ({
  providerAssetId,
  providerPublicId: `photos/${providerAssetId}`,
  deliveryType: 'upload',
  version: 1,
  originalFilename: `${providerAssetId}.jpg`,
  format: 'jpg',
  width: 1600,
  height: 1200,
  bytes: 123,
  checksum,
  tags: ['travel'],
  createdAt: new Date(createdAt),
});

describe('Cloudinary photo maintenance scripts', () => {
  it('only schedules unregistered byte-for-byte duplicates for deletion', () => {
    const groups = planExactDuplicateDeletion([
      asset('old-copy', '2024-01-01T00:00:00.000Z', 'same-file'),
      asset('library-copy', '2024-02-01T00:00:00.000Z', 'same-file'),
      asset('new-copy', '2024-03-01T00:00:00.000Z', 'same-file'),
      asset('no-checksum', '2024-03-01T00:00:00.000Z'),
    ], new Set(['library-copy']));

    expect(groups).toHaveLength(1);
    expect(groups[0].keeper.providerAssetId).toBe('library-copy');
    expect(groups[0].protected).toEqual([]);
    expect(groups[0].deletable.map(({ providerAssetId }) => providerAssetId)).toEqual([
      'old-copy',
      'new-copy',
    ]);
  });

  it('retains every registered duplicate', () => {
    const groups = planExactDuplicateDeletion([
      asset('first', '2024-01-01T00:00:00.000Z', 'same-file'),
      asset('second', '2024-02-01T00:00:00.000Z', 'same-file'),
    ], new Set(['first', 'second']));

    expect(groups[0].keeper.providerAssetId).toBe('first');
    expect(groups[0].protected.map(({ providerAssetId }) => providerAssetId)).toEqual(['second']);
    expect(groups[0].deletable).toEqual([]);
  });

  it('creates a ready Photos record using the Cloudinary creation date', () => {
    const document = newMediaDocument(asset('sunset', '2024-06-15T19:20:30.000Z', 'etag'), new Date('2026-01-01T00:00:00.000Z'));

    expect(document).toMatchObject({
      schemaVersion: 1,
      provider: 'cloudinary',
      providerAssetId: 'sunset',
      resourceType: 'image',
      captureDate: '2024-06-15',
      showInPhotos: true,
      status: 'ready',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
  });
});
