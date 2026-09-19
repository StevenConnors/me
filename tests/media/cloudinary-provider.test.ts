import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import {
  CloudinaryProvider,
  MediaProviderError,
  clampMediaWidth,
} from '../../lib/media/providers/CloudinaryProvider';

const providerOptions = {
  cloudName: 'travel-journal',
  apiKey: 'public-api-key',
  apiSecret: 'server-only-secret',
  uploadFolder: 'journal/uploads',
  now: () => new Date('2026-09-18T01:02:03.000Z'),
};

describe('CloudinaryProvider', () => {
  it('clamps requests upward to a bounded responsive width', () => {
    expect(clampMediaWidth(100)).toBe(320);
    expect(clampMediaWidth(320)).toBe(320);
    expect(clampMediaWidth(481)).toBe(768);
    expect(clampMediaWidth(5_000)).toBe(1920);
    expect(() => clampMediaWidth(0)).toThrow(MediaProviderError);
  });

  it('builds a controlled image URL without leaking arbitrary transforms', () => {
    const provider = new CloudinaryProvider(providerOptions);

    expect(
      provider.buildImageUrl({
        providerPublicId: 'journeys/a photo',
        version: 42,
        width: 700,
        sourceWidth: 4000,
        sourceHeight: 3000,
      }),
    ).toBe(
      'https://res.cloudinary.com/travel-journal/image/upload/f_auto,q_auto/c_limit,w_768/v42/journeys/a%20photo',
    );
  });

  it('converts normalized manual crops into source-pixel transformations', () => {
    const provider = new CloudinaryProvider(providerOptions);

    expect(
      provider.buildImageUrl({
        providerPublicId: 'journal/photo',
        width: 1024,
        sourceWidth: 4000,
        sourceHeight: 3000,
        crop: {
          mode: 'manual',
          rect: { x: 0.1, y: 0.2, width: 0.5, height: 0.6 },
        },
      }),
    ).toBe(
      'https://res.cloudinary.com/travel-journal/image/upload/f_auto,q_auto/c_crop,x_400,y_600,w_2000,h_1800/c_limit,w_1024/journal/photo',
    );
  });

  it('builds focal-fill and video deliveries from allowlisted options', () => {
    const provider = new CloudinaryProvider(providerOptions);

    expect(
      provider.buildImageUrl({
        providerPublicId: 'journal/portrait',
        width: 900,
        sourceWidth: 3000,
        sourceHeight: 4000,
        crop: {
          mode: 'focal-fill',
          aspectRatio: 0.8,
          focalPoint: { x: 0.6, y: 0.25 },
          zoom: 1.2,
        },
      }),
    ).toBe(
      'https://res.cloudinary.com/travel-journal/image/upload/f_auto,q_auto/c_fill,ar_0.8,g_xy_center,x_1800,y_1000,z_1.2/c_limit,w_1024/journal/portrait',
    );

    expect(
      provider.buildVideoUrl({
        providerPublicId: 'journal/clip',
        version: 7,
        width: 1000,
      }),
    ).toBe(
      'https://res.cloudinary.com/travel-journal/video/upload/f_mp4,q_auto/c_limit,w_1024/v7/journal/clip.mp4',
    );
  });

  it('creates short-lived signed image upload parameters without exposing the secret', async () => {
    const provider = new CloudinaryProvider(providerOptions);
    const authorization = await provider.createUploadAuthorization({
      filename: 'image.jpg',
      mimeType: 'image/jpeg',
      bytes: 1024,
      idempotencyKey: 'upload-key-123',
    });
    const timestamp = Math.floor(new Date('2026-09-18T01:02:03.000Z').getTime() / 1000);
    const expectedSignature = createHash('sha256')
      .update(
        `allowed_formats=jpg,jpeg,png,webp,heic,heif&folder=journal/uploads&overwrite=false&tags=upload-session-upload-key-123&timestamp=${timestamp}&unique_filename=true&use_filename=falseserver-only-secret`,
      )
      .digest('hex');

    expect(authorization).toEqual({
      provider: 'cloudinary',
      uploadUrl: 'https://api.cloudinary.com/v1_1/travel-journal/image/upload',
      expiresAt: new Date((timestamp + 300) * 1000).toISOString(),
      parameters: {
        api_key: 'public-api-key',
        allowed_formats: 'jpg,jpeg,png,webp,heic,heif',
        folder: 'journal/uploads',
        overwrite: false,
        tags: 'upload-session-upload-key-123',
        timestamp,
        unique_filename: true,
        use_filename: false,
        signature: expectedSignature,
      },
    });
    expect(JSON.stringify(authorization)).not.toContain('server-only-secret');
  });

  it('rejects unsupported or oversized uploads before signing', async () => {
    const provider = new CloudinaryProvider({ ...providerOptions, maxUploadBytes: 1_000 });

    await expect(
      provider.createUploadAuthorization({
        filename: 'script.svg',
        // Deliberately exercises the runtime boundary.
        mimeType: 'image/svg+xml' as 'image/jpeg',
        bytes: 100,
        idempotencyKey: 'upload-key-123',
      }),
    ).rejects.toThrow();

    await expect(
      provider.createUploadAuthorization({
        filename: 'large.jpg',
        mimeType: 'image/jpeg',
        bytes: 1_001,
        idempotencyKey: 'upload-key-123',
      }),
    ).rejects.toMatchObject({ code: 'UPLOAD_TOO_LARGE' });
  });

  it('verifies Cloudinary upload responses using a constant-time signature comparison', () => {
    const provider = new CloudinaryProvider(providerOptions);
    const signature = createHash('sha1')
      .update('public_id=journal/photo&version=42server-only-secret')
      .digest('hex');
    const result = {
      providerAssetId: 'immutable-id',
      providerPublicId: 'journal/photo',
      resourceType: 'image' as const,
      deliveryType: 'upload',
      version: 42,
      originalFilename: 'photo',
      format: 'jpg',
      width: 4000,
      height: 3000,
      bytes: 1000,
      tags: ['upload-session-upload-key-123'],
      signature,
    };

    expect(provider.verifyUploadResult(result)).toBe(true);
    expect(provider.verifyUploadResult({ ...result, signature: 'not-valid' })).toBe(false);
  });

  it('inspects provider assets through an injectable fetch boundary', async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        asset_id: 'immutable-id',
        public_id: 'journal/photo',
        resource_type: 'image',
        type: 'upload',
        version: 42,
        original_filename: 'photo',
        format: 'jpg',
        width: 4000,
        height: 3000,
        bytes: 1000,
        etag: 'checksum',
        tags: ['journal'],
      }),
    }));
    const provider = new CloudinaryProvider({ ...providerOptions, fetch: fetcher });

    await expect(provider.inspectAsset('immutable-id')).resolves.toMatchObject({
      providerAssetId: 'immutable-id',
      providerPublicId: 'journal/photo',
      checksum: 'checksum',
    });
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.cloudinary.com/v1_1/travel-journal/resources/immutable-id',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: expect.any(String) }) }),
    );
  });

  it('deletes an original through Cloudinary’s signed destroy endpoint', async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ result: 'ok' }),
    }));
    const provider = new CloudinaryProvider({ ...providerOptions, fetch: fetcher });

    await expect(
      provider.deleteAsset({
        providerPublicId: 'journal/photo',
        resourceType: 'image',
        deliveryType: 'upload',
      }),
    ).resolves.toBeUndefined();

    const expectedSignature = createHash('sha256')
      .update('invalidate=true&public_id=journal/photo&timestamp=1789693323&type=uploadserver-only-secret')
      .digest('hex');
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.cloudinary.com/v1_1/travel-journal/image/destroy',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: expect.stringContaining(`signature=${expectedSignature}`),
      }),
    );
  });

  it('returns sanitized provider errors without response bodies or credentials', async () => {
    const provider = new CloudinaryProvider({
      ...providerOptions,
      fetch: async () => ({ ok: false, status: 502, json: async () => ({ secret: 'remote body' }) }),
    });

    await expect(provider.inspectAsset('immutable-id')).rejects.toMatchObject({
      code: 'ASSET_INSPECTION_FAILED',
      message: 'Cloudinary asset inspection failed',
      status: 502,
    });
  });
});
