import { afterEach, describe, expect, it, vi } from 'vitest';

import { uploadMedia } from '@/lib/client/upload-media';

describe('uploadMedia', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('normalizes variant Cloudinary fields before finalizing an uploaded image', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'uploadsessionkey123' });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          authorization: {
            uploadUrl: 'https://api.cloudinary.com/v1_1/example/image/upload',
            parameters: {
              api_key: 'public-key',
              timestamp: 1_789_741_943,
              signature: 'request-signature',
              folder: 'journey-editor',
              tags: 'upload-session-uploadsessionkey123',
              allowed_formats: 'jpg,jpeg,png,webp,heic,heif',
              overwrite: false,
              unique_filename: true,
              use_filename: false,
            },
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          asset_id: 'cloudinary-asset-id',
          public_id: 'journey-editor/photo',
          resource_type: 'image',
          type: 'upload',
          version: '1789741943',
          original_filename: '',
          filename: 'camera-roll-photo',
          format: 'png',
          width: 1600,
          height: 1200,
          bytes: 230_000,
          etag: null,
          tags: 'upload-session-uploadsessionkey123',
          signature: 'response-signature',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          media: {
            _id: 'media-1',
            originalFilename: 'camera-roll-photo',
            width: 1600,
            height: 1200,
            format: 'png',
            status: 'ready',
          },
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    await expect(uploadMedia(new File(['image'], 'camera-roll-photo.png', { type: 'image/png' }))).resolves.toMatchObject({
      _id: 'media-1',
      status: 'ready',
    });

    const [, finalizationRequest] = fetchMock.mock.calls[2];
    expect(JSON.parse(finalizationRequest.body)).toEqual({
      idempotencyKey: 'uploadsessionkey123',
      result: {
        providerAssetId: 'cloudinary-asset-id',
        providerPublicId: 'journey-editor/photo',
        resourceType: 'image',
        deliveryType: 'upload',
        version: 1_789_741_943,
        originalFilename: 'camera-roll-photo',
        format: 'png',
        width: 1600,
        height: 1200,
        bytes: 230_000,
        tags: ['upload-session-uploadsessionkey123'],
        signature: 'response-signature',
      },
    });
  });

  it('derives video resource type from the selected file before authorizing', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'videouploadsessionkey123' });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ authorization: { uploadUrl: 'https://api.cloudinary.com/v1_1/example/video/upload', parameters: {} } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ asset_id: 'video-id', public_id: 'clip', resource_type: 'video', type: 'upload', version: 1, original_filename: 'clip', format: 'mp4', width: 1600, height: 900, bytes: 100, tags: 'upload-session-videouploadsessionkey123', signature: 'signature' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ media: { _id: 'video-media', originalFilename: 'clip', width: 1600, height: 900, format: 'mp4', resourceType: 'video', status: 'ready' } }) });
    vi.stubGlobal('fetch', fetchMock);

    await expect(uploadMedia(new File(['video'], 'clip.mp4', { type: 'video/mp4' }))).resolves.toMatchObject({ resourceType: 'video' });
    const [, authorizationRequest] = fetchMock.mock.calls[0];
    expect(JSON.parse(authorizationRequest.body)).toMatchObject({ resourceType: 'video', mimeType: 'video/mp4' });
  });
});
