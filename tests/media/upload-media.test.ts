import { afterEach, describe, expect, it, vi } from 'vitest';

import { uploadMedia } from '@/lib/client/upload-media';

describe('uploadMedia', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function prepareUpload() {
    vi.useFakeTimers();
    vi.stubGlobal('crypto', { randomUUID: () => 'retry-session-key' });
    const media = { _id: 'media-1', status: 'ready' };
    const success = () => Response.json({ media });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ authorization: { uploadUrl: 'https://provider.test/upload', parameters: {} } }))
      .mockResolvedValueOnce(Response.json({ asset_id: 'asset-1', public_id: 'photo', resource_type: 'image', signature: 'signature' }));
    vi.stubGlobal('fetch', fetchMock);
    return { fetchMock, media, success };
  }

  it.each(['503', '502', 'network', 'non-json', 'empty'])(
    'retries only finalization after a temporary %s failure', async (failure) => {
      const { fetchMock, media, success } = prepareUpload();
      if (failure === 'network') fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      else fetchMock.mockResolvedValueOnce(
        failure === 'non-json' ? new Response('<html>Unavailable</html>')
          : failure === 'empty' ? new Response(null, { status: 503 })
            : Response.json({ error: { message: 'Temporarily unavailable' } }, { status: Number(failure) }),
      );
      fetchMock.mockImplementation(success);
      const phases: string[] = [];
      const result = expect(uploadMedia(new File(['photo'], 'photo.png', { type: 'image/png' }), {
        onPhase: (phase) => phases.push(phase),
      })).resolves.toEqual(media);
      await Promise.all([result, vi.runAllTimersAsync()]);
      expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
        '/api/admin/media/upload-authorizations', 'https://provider.test/upload',
        '/api/admin/media/finalize', '/api/admin/media/finalize',
      ]);
      expect(fetchMock.mock.calls[3][1]).toEqual(fetchMock.mock.calls[2][1]);
      expect(phases).toEqual(['authorizing', 'uploading', 'finalizing']);
    },
  );

  it.each([400, 401, 403, 404, 409, 422])('does not retry a %s rejection, even without JSON', async (status) => {
    const { fetchMock } = prepareUpload();
    fetchMock.mockResolvedValueOnce(new Response('Rejected', { status }));
    await expect(uploadMedia(new File(['photo'], 'photo.png', { type: 'image/png' })))
      .rejects.toThrow('The upload needs finalizing again');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops after three attempts and explains that the file already uploaded', async () => {
    const { fetchMock } = prepareUpload();
    fetchMock.mockImplementation(() => Response.json({ error: { message: 'Service unavailable' } }, { status: 503 }));
    const result = expect(uploadMedia(new File(['photo'], 'photo.png', { type: 'image/png' })))
      .rejects.toThrow('The file uploaded but could not be finalized after 3 attempts. Service unavailable');
    await Promise.all([result, vi.runAllTimersAsync()]);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(vi.getTimerCount()).toBe(0);
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
