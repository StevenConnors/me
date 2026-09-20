import 'server-only';

import type { MediaProvider } from '@/lib/media/providers/MediaProvider';
import type { MediaRepository } from '@/lib/media/repository';
import { decodeGalleryCursor, encodeGalleryCursor, StaleGalleryCursorError } from '@/lib/photos/cursor';
import { resolveLegacyPhotos, resolvePublishedPhotos, type PublicPhoto, type UnavailablePhotosBlock } from '@/lib/photos/presentation';
import type { PhotosPage } from '@/lib/photos/schemas';

export type PublicPhotosPage = {
  items: PublicPhoto[];
  nextCursor: string | null;
  unavailable: UnavailablePhotosBlock[];
};

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
  if (!page?.publishedDocument) {
    const legacy = resolveLegacyPhotos(await mediaRepository.listPhotos({ limit: 200 }), provider);
    return { items: legacy.slice(0, limit), nextCursor: null, unavailable: [] };
  }

  const publishedAt = (page.publishedAt ?? page.updatedAt).toISOString();
  const cursor = options.cursor ? decodeGalleryCursor(options.cursor) : undefined;
  if (cursor && cursor.publishedAt !== publishedAt) throw new StaleGalleryCursorError();
  const mediaIds = page.publishedDocument.blocks.flatMap((block) => block.type === 'media' ? [block.mediaAssetId] : []);
  const resolved = resolvePublishedPhotos(
    page.publishedDocument,
    await mediaRepository.findByIds(mediaIds),
    provider,
  );
  const startIndex = cursor ? resolved.photos.findIndex((item) => item.id === cursor.mediaAssetId) + 1 : 0;
  if (cursor && startIndex === 0) throw new StaleGalleryCursorError();
  const items = resolved.photos.slice(startIndex, startIndex + limit);
  const last = items.at(-1);
  const nextCursor = last && startIndex + items.length < resolved.photos.length
    ? encodeGalleryCursor({ version: 1, publishedAt, mediaAssetId: last.id })
    : null;
  return { items, nextCursor, unavailable: resolved.unavailable };
}
