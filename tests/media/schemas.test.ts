import { describe, expect, it } from 'vitest';

import {
  CropSchema,
  MediaAssetSchema,
  MediaPlacementSchema,
  UploadSessionSchema,
} from '../../lib/media/schemas';
import { ProviderUploadResultSchema } from '../../lib/media/providers/MediaProvider';
import { UploadIntentSchema } from '../../lib/media/providers/MediaProvider';

const placement = {
  mediaAssetId: '66e4cc6e7fd5e6ad3db7ba10',
  role: 'story' as const,
  layout: { desktop: 'wide' as const, mobile: 'full' as const },
};

describe('media schemas', () => {
  it('accepts app-owned media placements with responsive crops', () => {
    expect(
      MediaPlacementSchema.parse({
        ...placement,
        crop: {
          desktop: {
            mode: 'manual',
            rect: { x: 0.1, y: 0.2, width: 0.5, height: 0.6 },
          },
          mobile: {
            mode: 'focal-fill',
            aspectRatio: 0.8,
            focalPoint: { x: 0.7, y: 0.3 },
            zoom: 1.2,
          },
        },
      }),
    ).toMatchObject(placement);
  });

  it('never accepts provider URLs or provider fields in a placement', () => {
    expect(
      MediaPlacementSchema.safeParse({
        ...placement,
        mediaAssetId: 'https://res.cloudinary.com/demo/image/upload/photo',
      }).success,
    ).toBe(false);

    expect(
      MediaPlacementSchema.safeParse({
        ...placement,
        providerPublicId: 'journal/photo',
      }).success,
    ).toBe(false);
  });

  it('rejects crop coordinates and rectangles outside the normalized source', () => {
    expect(
      CropSchema.safeParse({
        mode: 'manual',
        rect: { x: 0.75, y: 0, width: 0.5, height: 1 },
      }).success,
    ).toBe(false);

    expect(
      CropSchema.safeParse({
        mode: 'focal-fill',
        focalPoint: { x: -0.01, y: 0.5 },
      }).success,
    ).toBe(false);

    expect(CropSchema.safeParse({ mode: 'manual' }).success).toBe(false);
  });

  it('validates persisted media metadata without delivery URLs', () => {
    const now = new Date('2026-09-18T00:00:00.000Z');
    const result = MediaAssetSchema.parse({
      _id: '66e4cc6e7fd5e6ad3db7ba10',
      schemaVersion: 1,
      provider: 'cloudinary',
      providerAssetId: 'immutable-provider-id',
      providerPublicId: 'journeys/example/photo',
      resourceType: 'image',
      deliveryType: 'upload',
      version: 42,
      originalFilename: 'photo.jpg',
      format: 'jpg',
      width: 4000,
      height: 3000,
      bytes: 2_500_000,
      checksum: null,
      tags: ['journal'],
      captureDate: '2026-09-17',
      status: 'ready',
      createdAt: now,
      updatedAt: now,
    });

    expect(result.providerAssetId).toBe('immutable-provider-id');
    expect(result.checksum).toBeUndefined();
    expect('url' in result).toBe(false);
  });

  it('supports an explicit Photos-tab membership and a blank section break', () => {
    const now = new Date('2026-09-18T00:00:00.000Z');
    const result = MediaAssetSchema.parse({
      _id: '66e4cc6e7fd5e6ad3db7ba10',
      schemaVersion: 1,
      provider: 'cloudinary',
      providerAssetId: 'immutable-provider-id',
      providerPublicId: 'photos/example/photo',
      resourceType: 'image',
      deliveryType: 'upload',
      originalFilename: 'photo.jpg',
      format: 'jpg',
      width: 4000,
      height: 3000,
      bytes: 2_500_000,
      tags: [],
      showInPhotos: true,
      photoSectionBreak: {},
      status: 'ready',
      createdAt: now,
      updatedAt: now,
    });

    expect(result.showInPhotos).toBe(true);
    expect(result.photoSectionBreak).toEqual({});
  });

  it('normalizes a null provider checksum at the upload boundary', () => {
    const result = ProviderUploadResultSchema.parse({
      providerAssetId: 'immutable-provider-id',
      providerPublicId: 'journey-editor/photo',
      resourceType: 'image',
      deliveryType: 'upload',
      version: 1_789_741_943,
      originalFilename: 'photo.png',
      format: 'png',
      width: 1600,
      height: 1200,
      bytes: 230_000,
      checksum: null,
      tags: ['upload-session-client-key-123'],
      signature: 'provider-response-signature',
    });

    expect(result.checksum).toBeUndefined();
  });

  it('requires coherent upload-session lifecycle fields', () => {
    const createdAt = new Date('2026-09-18T00:00:00.000Z');
    const expiresAt = new Date('2026-09-18T00:05:00.000Z');

    expect(
      UploadSessionSchema.safeParse({
        _id: 'upload-session-record',
        schemaVersion: 1,
        idempotencyKey: 'client-key-123',
        status: 'finalized',
        expectedResourceType: 'image',
        createdAt,
        expiresAt,
      }).success,
    ).toBe(false);

    expect(
      UploadSessionSchema.safeParse({
        _id: 'upload-session-record',
        schemaVersion: 1,
        idempotencyKey: 'client-key-123',
        status: 'finalized',
        expectedResourceType: 'image',
        providerAssetId: 'provider-asset',
        mediaAssetId: 'media-record',
        createdAt,
        expiresAt,
      }).success,
    ).toBe(true);
  });

  it('accepts supported videos only when MIME type and resource type agree', () => {
    expect(UploadIntentSchema.safeParse({
      filename: 'clip.mp4', mimeType: 'video/mp4', bytes: 100, idempotencyKey: 'video-upload-key-123', resourceType: 'video',
    }).success).toBe(true);
    expect(UploadIntentSchema.safeParse({
      filename: 'clip.mp4', mimeType: 'video/mp4', bytes: 100, idempotencyKey: 'video-upload-key-123', resourceType: 'image',
    }).success).toBe(false);
  });
});
