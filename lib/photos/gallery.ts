import 'server-only';

import type { MediaProvider } from '@/lib/media/providers/MediaProvider';
import type { MediaRepository } from '@/lib/media/repository';
import { decodeGalleryCursor, encodeGalleryCursor, StaleGalleryCursorError } from '@/lib/photos/cursor';
import { resolveLegacyPhotos, resolvePublishedPhotos, type PublicPhoto, type PublicPhotoSectionBreak, type UnavailablePhotosBlock } from '@/lib/photos/presentation';
import type { PhotosMediaBlock, PhotosPage, PhotosPageBlock } from '@/lib/photos/schemas';

export type PublicPhotosPage = {
  items: PublicPhoto[];
  nextCursor: string | null;
  unavailable: UnavailablePhotosBlock[];
  sections: PublicPhotosSection[];
};

export type PublicPhotosSection = PublicPhotoSectionBreak & { id: string; count: number; cover?: PublicPhoto };

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
  const last = items[items.length - 1];
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
  options: { limit?: number; cursor?: string; withCovers?: boolean } = {},
): Promise<PublicPhotosPage> {
  const limit = Math.min(Math.max(options.limit ?? 24, 1), 48);
  const cursor = options.cursor ? decodeGalleryCursor(options.cursor) : undefined;
  if (!page?.publishedDocument) {
    if (cursor && cursor.publishedAt !== legacyPublishedAt) throw new StaleGalleryCursorError();
    const legacy = resolveLegacyPhotos(await mediaRepository.listPhotos({ limit: 500 }), provider);
    const sections = countSections(legacy.map((photo) => photo.sectionBreak && photo.sectionBlockId
      ? { id: photo.sectionBlockId, ...photo.sectionBreak, photo: true } : { photo: true }));
    return {
      ...pageResolvedPhotos(legacy, legacyPublishedAt, limit, cursor?.mediaAssetId),
      unavailable: [],
      sections: options.withCovers
        ? sections.map((section) => {
          const cover = legacy.find((photo) => photo.sectionBlockId === section.id);
          return cover ? { ...section, cover } : section;
        })
        : sections,
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
  const last = items[items.length - 1];
  const sections = countSections(publishedBlocks.map((block) => block.type === 'section'
    ? { id: block.id, title: block.title, text: block.text, photo: false } : { photo: true }));
  return {
    items,
    nextCursor: last && resolved.photos.length > limit
      ? encodeGalleryCursor({ version: 1, publishedAt, mediaAssetId: last.id })
      : null,
    unavailable: resolved.unavailable,
    sections: options.withCovers ? await attachCovers(sections, publishedBlocks, mediaRepository, provider) : sections,
  };
}

/** Every published photo in order, for views that show the whole collection at once. */
export async function loadAllPublicPhotos(
  page: PhotosPage | null,
  mediaRepository: Pick<MediaRepository, 'findByIds' | 'listPhotos'>,
  provider: Pick<MediaProvider, 'buildImageUrl' | 'buildVideoPosterUrl' | 'buildVideoUrl'>,
): Promise<PublicPhoto[]> {
  if (!page?.publishedDocument) return resolveLegacyPhotos(await mediaRepository.listPhotos({ limit: 500 }), provider);
  const document = page.publishedDocument;
  const assets = await mediaRepository.findByIds(document.blocks.flatMap((block) => block.type === 'media' ? [block.mediaAssetId] : []));
  return resolvePublishedPhotos(document, assets, provider).photos;
}

/** Each album's cover is the photo marked `cover`, else its first photo. */
async function attachCovers(
  sections: PublicPhotosSection[],
  blocks: PhotosPageBlock[],
  mediaRepository: Pick<MediaRepository, 'findByIds'>,
  provider: Pick<MediaProvider, 'buildImageUrl' | 'buildVideoPosterUrl' | 'buildVideoUrl'>,
): Promise<PublicPhotosSection[]> {
  const coverBlocks = new Map<string, PhotosMediaBlock>();
  let sectionId: string | undefined;
  for (const block of blocks) {
    if (block.type === 'section') {
      sectionId = block.id;
      continue;
    }
    if (sectionId && (!coverBlocks.has(sectionId) || block.albumRole === 'cover' && coverBlocks.get(sectionId)?.albumRole !== 'cover')) {
      coverBlocks.set(sectionId, block);
    }
  }
  if (!coverBlocks.size) return sections;
  const blocksToResolve = Array.from(coverBlocks.values());
  const covers = resolvePublishedPhotos(
    { schemaVersion: 1, blocks: blocksToResolve },
    await mediaRepository.findByIds(blocksToResolve.map((block) => block.mediaAssetId)),
    provider,
  ).photos;
  const coversById = new Map(covers.map((photo) => [photo.id, photo]));
  return sections.map((section) => {
    const block = coverBlocks.get(section.id);
    const cover = block ? coversById.get(block.mediaAssetId) : undefined;
    return cover ? { ...section, cover } : section;
  });
}

/** Section links with the number of photographs that follow each section start. */
function countSections(
  entries: Array<(PublicPhotoSectionBreak & { id: string; photo: boolean }) | { id?: undefined; photo: boolean }>,
) {
  const sections: Array<PublicPhotoSectionBreak & { id: string; count: number }> = [];
  for (const entry of entries) {
    if (entry.id !== undefined) {
      const { photo, ...section } = entry;
      sections.push({ ...section, count: 0 });
      if (!photo) continue;
    }
    if (entry.photo && sections.length) sections[sections.length - 1].count += 1;
  }
  return sections;
}

/** Homepage picks follow the published Photos order, independently of pagination. */
export async function loadHomepagePhotos(
  page: PhotosPage | null,
  mediaRepository: Pick<MediaRepository, 'findByIds' | 'listPhotos'>,
  provider: Pick<MediaProvider, 'buildImageUrl' | 'buildVideoPosterUrl' | 'buildVideoUrl'>,
): Promise<PublicPhoto[]> {
  const featuredBlocks = page?.publishedDocument?.blocks.filter((block): block is PhotosMediaBlock => block.type === 'media' && Boolean(block.featuredOnHome)) ?? [];
  if (!featuredBlocks.length) {
    return (await loadPublicPhotosPage(page, mediaRepository, provider, { limit: 8 })).items;
  }
  const blocks = featuredBlocks.slice(0, 8);
  const assets = await mediaRepository.findByIds(blocks.map((block) => block.mediaAssetId));
  return resolvePublishedPhotos({ schemaVersion: 1, blocks }, assets, provider).photos;
}
