import { describe, expect, it, vi } from 'vitest';

import { planExactDuplicateDeletion } from '../../scripts/delete-duplicate-cloudinary-images.mjs';
import { applyImport, newMediaDocument } from '../../scripts/import-cloudinary-images-to-photos.mjs';

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

  it('creates a ready library record without silently publishing it to Photos', () => {
    const document = newMediaDocument(asset('sunset', '2024-06-15T19:20:30.000Z', 'etag'), new Date('2026-01-01T00:00:00.000Z'));

    expect(document).toMatchObject({
      schemaVersion: 1,
      provider: 'cloudinary',
      providerAssetId: 'sunset',
      resourceType: 'image',
      showInPhotos: false,
      status: 'ready',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    expect(document).not.toHaveProperty('captureDate');
  });

  it('uses insert-only updates so existing media metadata and eligibility stay unchanged', async () => {
    const bulkWrite = vi.fn(async (_operations: Array<{ updateOne: { update: Record<string, unknown> } }>) => ({ upsertedCount: 1 }));

    await applyImport({ bulkWrite }, [asset('sunset', '2024-06-15T19:20:30.000Z', 'etag')]);

    const operation = bulkWrite.mock.calls[0]![0][0].updateOne;
    expect(operation.update.$setOnInsert).toMatchObject({ providerAssetId: 'sunset', showInPhotos: false });
    expect(operation.update).not.toHaveProperty('$set');
  });
});
