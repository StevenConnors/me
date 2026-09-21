import 'server-only';

import type { GalleryMediaItem } from '@/components/MediaGrid';
import { CloudinaryProvider, MediaProviderError } from '@/lib/media/providers/CloudinaryProvider';

type GlassResource = {
  asset_id: string;
  public_id: string;
  resource_type: string;
  type: string;
  width: number;
  height: number;
  version?: number;
  context?: { alt?: string; custom?: { alt?: string } };
};

/** Read the Media Library folder, independently of the Photos publication. */
export async function loadGlassGallery(): Promise<GalleryMediaItem[]> {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME ?? process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    throw new MediaProviderError('MEDIA_NOT_CONFIGURED', 'Cloudinary server credentials are not configured');
  }

  const provider = new CloudinaryProvider({ cloudName, apiKey, apiSecret });
  const items: GalleryMediaItem[] = [];
  const seenAssets = new Set<string>();
  const seenCursors = new Set<string>();
  let cursor: string | undefined;

  do {
    const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/resources/search`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        expression: 'resource_type:image AND type:upload AND asset_folder="glass"',
        sort_by: [{ created_at: 'desc' }],
        max_results: 100,
        with_field: ['context'],
        ...(cursor ? { next_cursor: cursor } : {}),
      }),
      next: { revalidate: 300, tags: ['glass-gallery'] },
    });
    if (!response.ok) {
      throw new MediaProviderError('GLASS_LIST_FAILED', 'Unable to load the Glass collection', response.status);
    }

    const data = await response.json() as { resources?: GlassResource[]; next_cursor?: string };
    if (!Array.isArray(data.resources)) {
      throw new MediaProviderError('GLASS_LIST_FAILED', 'Unable to load the Glass collection');
    }
    for (const asset of data.resources) {
      if (asset.resource_type !== 'image' || asset.type !== 'upload' || seenAssets.has(asset.asset_id)) continue;
      const image = {
        providerPublicId: asset.public_id,
        version: asset.version,
        sourceWidth: asset.width,
        sourceHeight: asset.height,
      };
      items.push({
        id: asset.asset_id,
        kind: 'photo',
        src: provider.buildImageUrl({ ...image, width: 1920 }),
        thumbnailSrc: provider.buildImageUrl({ ...image, width: 768 }),
        width: asset.width,
        height: asset.height,
        alt: asset.context?.custom?.alt?.trim() || asset.context?.alt?.trim() || `Glass photograph ${items.length + 1}`,
      });
      seenAssets.add(asset.asset_id);
    }

    cursor = typeof data.next_cursor === 'string' && data.next_cursor ? data.next_cursor : undefined;
    if (cursor && seenCursors.has(cursor)) {
      throw new MediaProviderError('GLASS_LIST_FAILED', 'Cloudinary returned a repeated gallery cursor');
    }
    if (cursor) seenCursors.add(cursor);
  } while (cursor);

  return items;
}
