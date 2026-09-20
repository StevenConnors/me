import { describe, expect, it, vi } from 'vitest';

import { deleteMediaAsset, MediaInUseError } from '@/lib/media/delete-service';
import type { MediaAsset } from '@/lib/media/schemas';

const media: MediaAsset = {
  _id: '66e4cc6e7fd5e6ad3db7ba10',
  schemaVersion: 1,
  provider: 'cloudinary',
  providerAssetId: 'immutable-asset-id',
  providerPublicId: 'journey-editor/photo',
  resourceType: 'image',
  deliveryType: 'upload',
  version: 1,
  originalFilename: 'photo.jpg',
  format: 'jpg',
  width: 1600,
  height: 1200,
  bytes: 230_000,
  tags: [],
  showInPhotos: false,
  status: 'ready',
  createdAt: new Date('2026-09-18T00:00:00.000Z'),
  updatedAt: new Date('2026-09-18T00:00:00.000Z'),
};

describe('deleteMediaAsset', () => {
  it('deletes the Cloudinary original before removing an unused library record', async () => {
    const deleteById = vi.fn(async () => undefined);
    const deleteAsset = vi.fn(async () => undefined);

    await expect(
      deleteMediaAsset(media._id, {
        mediaRepository: { findById: async () => media, deleteById },
        journeyRepository: { isMediaReferenced: async () => false },
        mediaProvider: { deleteAsset },
      }),
    ).resolves.toEqual(media);

    expect(deleteAsset).toHaveBeenCalledWith({
      providerPublicId: media.providerPublicId,
      resourceType: 'image',
      deliveryType: 'upload',
    });
    expect(deleteById).toHaveBeenCalledWith(media._id);
    expect(deleteAsset.mock.invocationCallOrder[0]).toBeLessThan(deleteById.mock.invocationCallOrder[0]);
  });

  it('protects assets referenced by a draft or published journey', async () => {
    const deleteById = vi.fn(async () => undefined);
    const deleteAsset = vi.fn(async () => undefined);

    await expect(
      deleteMediaAsset(media._id, {
        mediaRepository: { findById: async () => media, deleteById },
        journeyRepository: { isMediaReferenced: async () => true },
        mediaProvider: { deleteAsset },
      }),
    ).rejects.toBeInstanceOf(MediaInUseError);

    expect(deleteAsset).not.toHaveBeenCalled();
    expect(deleteById).not.toHaveBeenCalled();
  });
});
