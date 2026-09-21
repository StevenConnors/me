import 'server-only';

import type { MediaProvider } from '@/lib/media/providers/MediaProvider';
import type { MediaRepository } from '@/lib/media/repository';
import { decodeGalleryCursor, encodeGalleryCursor, StaleGalleryCursorError } from '@/lib/photos/cursor';
import { resolveLegacyPhotos, resolvePublishedPhotos, type PublicPhoto, type UnavailablePhotosBlock } from '@/lib/photos/presentation';
import type { PhotosPage, PhotosPageBlock } from '@/lib/photos/schemas';

export type PublicPhotosPage = {
  items: PublicPhoto[];
  nextCursor: string | null;
  unavailable: UnavailablePhotosBlock[];
};

const legacyPublishedAt = new Date(0).toISOString();

function pageResolvedPhotos(
  photos: PublicPhoto[],
  publishedAt: string,
  limit: number,
  cursorMediaAssetId?: string,
): Pick<PublicPhotosPage, 'items' | 'nextCursor'> {
  const startIndex = cursorMediaAssetId
    ? photos.findIndex((item) => item.id === cursorMediaAssetId) + 1
    : 0;
  if (cursorMediaAssetId && startIndex === 0) throw new StaleGalleryCursorError();
  const items = photos.slice(startIndex, startIndex + limit);
  const last = items.at(-1);
  return {
    items,
    nextCursor: last && startIndex + items.length < photos.length
      ? encodeGalleryCursor({ version: 1, publishedAt, mediaAssetId: last.id })
      : null,
  };
}

/**
 * Page the immutable published sequence itself. New uploads never perturb a
 * reader's cursor because they cannot enter this list until a later publish.
 */
export async function loadPublicPhotosPage(
  page: PhotosPage | null,
  mediaRepository: Pick<MediaRepository, 'findByIds' | 'listPhotos'>,
  provider: Pick<MediaProvider, 'buildImageUrl' | 'buildVideoPosterUrl' | 'buildVideoUrl'>,
  options: { limit?: number; cursor?: string } = {},
): Promise<PublicPhotosPage> {
  const limit = Math.min(Math.max(options.limit ?? 24, 1), 48);
  const cursor = options.cursor ? decodeGalleryCursor(options.cursor) : undefined;
  if (!page?.publishedDocument) {
    if (cursor && cursor.publishedAt !== legacyPublishedAt) throw new StaleGalleryCursorError();
    const legacy = resolveLegacyPhotos(await mediaRepository.listPhotos({ limit: 500 }), provider);
    return {
      ...pageResolvedPhotos(legacy, legacyPublishedAt, limit, cursor?.mediaAssetId),
      unavailable: [],
    };
  }

  const publishedAt = (page.publishedAt ?? page.updatedAt).toISOString();
  if (cursor && cursor.publishedAt !== publishedAt) throw new StaleGalleryCursorError();
  const publishedBlocks = page.publishedDocument.blocks;
  const cursorBlockIndex = cursor
    ? publishedBlocks.findIndex((block) => block.type === 'media' && block.mediaAssetId === cursor.mediaAssetId)
    : -1;
  if (cursor && cursorBlockIndex < 0) throw new StaleGalleryCursorError();

  let scanIndex = cursorBlockIndex + 1;
  const candidateBlocks: PhotosPageBlock[] = [];
  const candidateAssets = [];
  let resolved = { photos: [] as PublicPhoto[], unavailable: [] as UnavailablePhotosBlock[] };

  // Normally this resolves exactly limit + 1 records. If a published reference
  // has become unavailable, scan another small batch so it cannot shorten a page
  // or hide later media.
  while (scanIndex < publishedBlocks.length && resolved.photos.length < limit + 1) {
    const nextMediaIds: string[] = [];
    while (scanIndex < publishedBlocks.length && nextMediaIds.length < limit + 1) {
      const block = publishedBlocks[scanIndex];
      candidateBlocks.push(block);
      scanIndex += 1;
      if (block.type === 'media') nextMediaIds.push(block.mediaAssetId);
    }
    candidateAssets.push(...await mediaRepository.findByIds(nextMediaIds));
    resolved = resolvePublishedPhotos(
      { schemaVersion: 1, blocks: candidateBlocks },
      candidateAssets,
      provider,
    );
  }

  const items = resolved.photos.slice(0, limit);
  const last = items.at(-1);
  return {
    items,
    nextCursor: last && resolved.photos.length > limit
      ? encodeGalleryCursor({ version: 1, publishedAt, mediaAssetId: last.id })
      : null,
    unavailable: resolved.unavailable,
  };
}
