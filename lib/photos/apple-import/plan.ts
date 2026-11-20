import type { PhotosMediaBlock, PhotosPageBlock, PhotosPageDocument } from '@/lib/photos/schemas';

import type {
  ApplePhotosImportedAlbum,
  ApplePhotosImportedPhoto,
  ApplePhotosSyncRequest,
} from './schemas';

export type ApplePhotosSyncSummary = {
  albumsAdded: number;
  photosAdded: number;
  photosUpdated: number;
  photosRemoved: number;
  sectionsRemoved: number;
  duplicatePhotoIds: string[];
};

export type ApplePhotosSyncPlan = {
  document: PhotosPageDocument;
  albums: ApplePhotosImportedAlbum[];
  photos: ApplePhotosImportedPhoto[];
  summary: ApplePhotosSyncSummary;
};

/** Index after the last block of the section run that starts at `sectionIndex`. */
function runEnd(blocks: PhotosPageBlock[], sectionIndex: number): number {
  const next = blocks.findIndex((block, index) => index > sectionIndex && block.type === 'section');
  return next === -1 ? blocks.length : next;
}

function runMedia(blocks: PhotosPageBlock[], sectionId: string): PhotosMediaBlock[] {
  const sectionIndex = blocks.findIndex((block) => block.id === sectionId);
  if (sectionIndex === -1) return [];
  return blocks
    .slice(sectionIndex + 1, runEnd(blocks, sectionIndex))
    .filter((block): block is PhotosMediaBlock => block.type === 'media');
}

/**
 * Merge the Photos.app folder into the draft without undoing author edits:
 * blocks the author moved, retitled or annotated keep their place and copy.
 * Only blocks this import created are swapped or removed.
 */
export function planApplePhotosSync(input: {
  document: PhotosPageDocument;
  albums: ApplePhotosImportedAlbum[];
  photos: ApplePhotosImportedPhoto[];
  request: ApplePhotosSyncRequest;
  createId: () => string;
}): ApplePhotosSyncPlan {
  const blocks: PhotosPageBlock[] = [...input.document.blocks];
  const sectionIdByAlbum = new Map(input.albums.map((album) => [album.sourceAlbumId, album.sectionBlockId]));
  const previousPhotos = new Map(input.photos.map((photo) => [photo.sourcePhotoId, photo]));
  const nextPhotos = new Map(previousPhotos);
  const nextAlbums: ApplePhotosImportedAlbum[] = [];
  const syncedPhotoIds = new Set<string>();
  const requestedPhotoIds = new Set(input.request.albums.flatMap((album) => album.photos.map((photo) => photo.sourcePhotoId)));
  const departingBlockIds = new Set(input.photos
    .filter((photo) => !requestedPhotoIds.has(photo.sourcePhotoId) && photo.blockId)
    .map((photo) => photo.blockId));
  const summary: ApplePhotosSyncSummary = {
    albumsAdded: 0, photosAdded: 0, photosUpdated: 0, photosRemoved: 0, sectionsRemoved: 0, duplicatePhotoIds: [],
  };

  for (const album of input.request.albums) {
    const sectionBlockId = sectionIdByAlbum.get(album.sourceAlbumId) ?? input.createId();
    nextAlbums.push({ sourceAlbumId: album.sourceAlbumId, sectionBlockId });
    if (!blocks.some((block) => block.id === sectionBlockId)) {
      blocks.push({ id: sectionBlockId, type: 'section', title: album.title });
      summary.albumsAdded += 1;
    }

    for (const photo of album.photos) {
      if (syncedPhotoIds.has(photo.sourcePhotoId)) {
        summary.duplicatePhotoIds.push(photo.sourcePhotoId);
        continue;
      }
      syncedPhotoIds.add(photo.sourcePhotoId);
      const previousBlockId = previousPhotos.get(photo.sourcePhotoId)?.blockId;
      const existingIndex = previousBlockId ? blocks.findIndex((block) => block.id === previousBlockId) : -1;
      const existing = blocks[existingIndex];

      const coverTaken = runMedia(blocks, sectionBlockId)
        .some((block) => block.albumRole === 'cover' && !departingBlockIds.has(block.id));
      const placedElsewhere = blocks.some((block, index) => index !== existingIndex
        && block.type === 'media' && block.mediaAssetId === photo.mediaAssetId);

      if (existing?.type === 'media') {
        // A media asset may appear once; keep the old upload if the author already placed the new one.
        let updated: PhotosMediaBlock = existing;
        if (existing.mediaAssetId !== photo.mediaAssetId && !placedElsewhere) {
          updated = { ...updated, mediaAssetId: photo.mediaAssetId };
          summary.photosUpdated += 1;
        }
        const inOwnSection = runMedia(blocks, sectionBlockId).some((block) => block.id === existing.id);
        const coverTagAdded = photo.cover && !previousPhotos.get(photo.sourcePhotoId)?.cover;
        if (coverTagAdded && !coverTaken && !existing.albumRole && inOwnSection) updated = { ...updated, albumRole: 'cover' };
        blocks[existingIndex] = updated;
        nextPhotos.set(photo.sourcePhotoId, { ...photo, blockId: existing.id });
        continue;
      }
      // The author already placed this upload; leave their block alone and do not add a copy.
      if (placedElsewhere) {
        nextPhotos.set(photo.sourcePhotoId, { ...photo });
        continue;
      }

      const block: PhotosMediaBlock = {
        id: input.createId(),
        type: 'media',
        mediaAssetId: photo.mediaAssetId,
        decorative: false,
        ...(photo.caption ? { caption: photo.caption } : {}),
        ...(photo.altText ? { altText: photo.altText } : {}),
        ...(photo.cover && !coverTaken ? { albumRole: 'cover' as const } : {}),
      };
      blocks.splice(runEnd(blocks, blocks.findIndex((candidate) => candidate.id === sectionBlockId)), 0, block);
      nextPhotos.set(photo.sourcePhotoId, { ...photo, blockId: block.id });
      summary.photosAdded += 1;
    }
  }

  for (const previous of Array.from(previousPhotos.values())) {
    if (syncedPhotoIds.has(previous.sourcePhotoId) || !previous.blockId) continue;
    const index = blocks.findIndex((block) => block.id === previous.blockId);
    if (index !== -1) {
      blocks.splice(index, 1);
      summary.photosRemoved += 1;
    }
  }

  // Departed albums and photos keep their block IDs so a sync whose draft write
  // was lost (author save, crash) can still remove them on the next run.
  const requestedAlbumIds = new Set(nextAlbums.map((album) => album.sourceAlbumId));
  nextAlbums.push(...input.albums.filter((album) => !requestedAlbumIds.has(album.sourceAlbumId)));
  const importedSectionIds = Array.from(new Set(nextAlbums.map((album) => album.sectionBlockId)));
  for (const sectionId of importedSectionIds) {
    const index = blocks.findIndex((block) => block.id === sectionId);
    if (index !== -1 && runMedia(blocks, sectionId).length === 0) {
      blocks.splice(index, 1);
      summary.sectionsRemoved += 1;
    }
  }

  return {
    document: { ...input.document, blocks },
    albums: nextAlbums,
    photos: Array.from(nextPhotos.values()).map((photo) => ({
      sourcePhotoId: photo.sourcePhotoId,
      sourceVersion: photo.sourceVersion,
      mediaAssetId: photo.mediaAssetId,
      ...(photo.blockId ? { blockId: photo.blockId } : {}),
      ...(photo.cover ? { cover: true } : {}),
    })),
    summary,
  };
}
