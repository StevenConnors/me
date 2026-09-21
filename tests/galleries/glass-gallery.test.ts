import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadGlassGallery } from '@/lib/glass/gallery';

const image = {
  asset_id: 'first',
  public_id: 'unrelated-public-id/photo one',
  resource_type: 'image',
  type: 'upload',
  version: 42,
  width: 900,
  height: 1600,
  context: { custom: { alt: 'A glass vase' } },
};

describe('Cloudinary Glass collection', () => {
  beforeEach(() => {
    vi.stubEnv('CLOUDINARY_CLOUD_NAME', 'glass-demo');
    vi.stubEnv('CLOUDINARY_API_KEY', 'api-key');
    vi.stubEnv('CLOUDINARY_API_SECRET', 'server-secret');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('reads only uploaded images in the asset folder, follows cursors, and preserves provider order', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ resources: [image], next_cursor: 'page-two' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ resources: [image, { ...image, asset_id: 'second', public_id: 'glass/second', context: undefined }] }) });
    vi.stubGlobal('fetch', fetcher);

    const items = await loadGlassGallery();

    expect(items.map((item) => item.id)).toEqual(['first', 'second']);
    expect(items[0]).toMatchObject({
      alt: 'A glass vase', width: 900, height: 1600,
      thumbnailSrc: 'https://res.cloudinary.com/glass-demo/image/upload/f_auto,q_auto/c_limit,w_768/v42/unrelated-public-id/photo%20one',
      src: 'https://res.cloudinary.com/glass-demo/image/upload/f_auto,q_auto/c_limit,w_1920/v42/unrelated-public-id/photo%20one',
    });
    expect(items[1].alt).toBe('Glass photograph 2');
    expect(JSON.stringify(items)).not.toContain('server-secret');
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({
      expression: 'resource_type:image AND type:upload AND asset_folder="glass"',
      sort_by: [{ created_at: 'desc' }],
    });
    expect(JSON.parse(fetcher.mock.calls[1][1].body).next_cursor).toBe('page-two');
    expect(fetcher.mock.calls[0][1].next).toEqual({ revalidate: 300, tags: ['glass-gallery'] });
  });

  it('does not treat provider failures as an empty collection or expose the provider response', async () => {
    const json = vi.fn(async () => ({ error: 'sensitive provider detail' }));
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401, json })));

    await expect(loadGlassGallery()).rejects.toMatchObject({ code: 'GLASS_LIST_FAILED', status: 401 });
    expect(json).not.toHaveBeenCalled();
  });

  it('stops instead of looping when a provider repeats a cursor', async () => {
    const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ resources: [image], next_cursor: 'same-page' }) }));
    vi.stubGlobal('fetch', fetcher);

    await expect(loadGlassGallery()).rejects.toMatchObject({ code: 'GLASS_LIST_FAILED' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
