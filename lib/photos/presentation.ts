import 'server-only';

import type { MediaProvider } from '@/lib/media/providers/MediaProvider';
import type { MediaAsset } from '@/lib/media/schemas';
import type { PhotosPageDocument } from '@/lib/photos/schemas';

export type PublicPhotoSectionBreak = { title?: string; text?: string };

export type PublicPhoto = {
  id: string;
  source: string;
  alt: string;
  width: number;
  height: number;
  caption?: string;
  captureDate?: string;
  sectionBreak?: PublicPhotoSectionBreak;
};

export type UnavailablePhotosBlock = {
  blockId: string;
  mediaAssetId: string;
  reason: string;
};

function publicPhotoFromAsset(
  asset: MediaAsset,
  options: {
    caption?: string;
    altText?: string;
    displayDate?: string;
    sectionBreak?: PublicPhotoSectionBreak;
    provider: Pick<MediaProvider, 'buildImageUrl'>;
  },
): PublicPhoto {
  return {
    id: asset._id,
    source: options.provider.buildImageUrl({
      providerPublicId: asset.providerPublicId,
      version: asset.version,
      width: 1440,
      sourceWidth: asset.width,
      sourceHeight: asset.height,
    }),
    alt: options.altText ?? options.caption ?? asset.altText ?? asset.caption ?? asset.originalFilename,
    width: asset.width,
    height: asset.height,
    ...(options.caption ?? asset.caption ? { caption: options.caption ?? asset.caption } : {}),
    ...(options.displayDate ?? asset.captureDate ? { captureDate: options.displayDate ?? asset.captureDate } : {}),
    ...(options.sectionBreak ? { sectionBreak: options.sectionBreak } : {}),
  };
}

/**
 * Resolves `$in` query results through a map, then walks the persisted block
 * sequence. MongoDB's result order must never decide public gallery order.
 */
export function resolvePublishedPhotos(
  document: PhotosPageDocument,
  mediaAssets: MediaAsset[],
  provider: Pick<MediaProvider, 'buildImageUrl'>,
): { photos: PublicPhoto[]; unavailable: UnavailablePhotosBlock[] } {
  const assetsById = new Map(mediaAssets.map((asset) => [asset._id, asset]));
  const photos: PublicPhoto[] = [];
  const unavailable: UnavailablePhotosBlock[] = [];
  let pendingSection: PublicPhotoSectionBreak | undefined;

  for (const block of document.blocks) {
    if (block.type === 'section') {
      // Preserve an intentionally blank section as a real visual break.
      pendingSection = {
        ...(block.title ? { title: block.title } : {}),
        ...(block.text ? { text: block.text } : {}),
      };
      continue;
    }

    const asset = assetsById.get(block.mediaAssetId);
    if (!asset) {
      unavailable.push({ blockId: block.id, mediaAssetId: block.mediaAssetId, reason: 'missing' });
      continue;
    }
    if (asset.status !== 'ready' || asset.resourceType !== 'image') {
      unavailable.push({ blockId: block.id, mediaAssetId: block.mediaAssetId, reason: 'not-ready-image' });
      continue;
    }

    photos.push(publicPhotoFromAsset(asset, {
      provider,
      ...(block.caption ? { caption: block.caption } : {}),
      ...(block.altText ? { altText: block.altText } : {}),
      ...(block.displayDate ? { displayDate: block.displayDate } : {}),
      ...(pendingSection ? { sectionBreak: pendingSection } : {}),
    }));
    pendingSection = undefined;
  }

  return { photos, unavailable };
}

export function resolveLegacyPhotos(
  mediaAssets: MediaAsset[],
  provider: Pick<MediaProvider, 'buildImageUrl'>,
): PublicPhoto[] {
  return mediaAssets.map((asset) => publicPhotoFromAsset(asset, {
    provider,
    ...(asset.photoSectionBreak ? { sectionBreak: asset.photoSectionBreak } : {}),
  }));
}
