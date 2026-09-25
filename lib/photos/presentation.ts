import 'server-only';

import type { MediaProvider } from '@/lib/media/providers/MediaProvider';
import type { MediaAsset } from '@/lib/media/schemas';
import type { PhotosPageDocument } from '@/lib/photos/schemas';

export type PublicPhotoSectionBreak = { title?: string; text?: string };

type PublicPhotoBase = {
  id: string;
  source: string;
  alt: string;
  width: number;
  height: number;
  caption?: string;
  captureDate?: string;
  sectionBreak?: PublicPhotoSectionBreak;
  sectionBlockId?: string;
};

/** Public JSON is deliberately discriminated so clients never assign a video
 * playback URL to a grid element. The aliases keep the shared authoring
 * canvas compatible while it uses the same presentation data. */
export type PublicPhoto =
  | (PublicPhotoBase & {
    kind: 'image';
    thumbnailUrl: string;
    displayUrl: string;
    displaySource: string;
  })
  | (PublicPhotoBase & {
    kind: 'video';
    posterUrl: string;
    playbackUrl: string;
  });

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
    decorative?: boolean;
    displayDate?: string;
    sectionBreak?: PublicPhotoSectionBreak;
    sectionBlockId?: string;
    provider: Pick<MediaProvider, 'buildImageUrl' | 'buildVideoPosterUrl' | 'buildVideoUrl'>;
  },
): PublicPhoto {
  const mediaUrls = asset.resourceType === 'video'
    ? (() => {
      const posterUrl = options.provider.buildVideoPosterUrl({
        providerPublicId: asset.providerPublicId,
        version: asset.version,
        width: 768,
      });
      return {
        kind: 'video' as const,
        source: posterUrl,
        posterUrl,
        playbackUrl: options.provider.buildVideoUrl({
          providerPublicId: asset.providerPublicId,
          version: asset.version,
          width: 1920,
          format: 'mp4',
        }),
      };
    })()
    : (() => {
      const thumbnailUrl = options.provider.buildImageUrl({
        providerPublicId: asset.providerPublicId,
        version: asset.version,
        width: 768,
        sourceWidth: asset.width,
        sourceHeight: asset.height,
      });
      const displayUrl = options.provider.buildImageUrl({
        providerPublicId: asset.providerPublicId,
        version: asset.version,
        width: 1920,
        sourceWidth: asset.width,
        sourceHeight: asset.height,
      });
      return {
        kind: 'image' as const,
        source: thumbnailUrl,
        thumbnailUrl,
        displaySource: displayUrl,
        displayUrl,
      };
    })();
  return {
    id: asset._id,
    ...mediaUrls,
    alt: options.decorative ? '' : options.altText ?? options.caption ?? asset.altText ?? asset.caption ?? asset.originalFilename,
    width: asset.width,
    height: asset.height,
    ...(options.caption ?? asset.caption ? { caption: options.caption ?? asset.caption } : {}),
    ...(options.displayDate ?? asset.captureDate ? { captureDate: options.displayDate ?? asset.captureDate } : {}),
    ...(options.sectionBreak ? { sectionBreak: options.sectionBreak } : {}),
    ...(options.sectionBlockId ? { sectionBlockId: options.sectionBlockId } : {}),
  };
}

/**
 * Resolves `$in` query results through a map, then walks the persisted block
 * sequence. MongoDB's result order must never decide public gallery order.
 */
export function resolvePublishedPhotos(
  document: PhotosPageDocument,
  mediaAssets: MediaAsset[],
  provider: Pick<MediaProvider, 'buildImageUrl' | 'buildVideoPosterUrl' | 'buildVideoUrl'>,
): { photos: PublicPhoto[]; unavailable: UnavailablePhotosBlock[] } {
  const assetsById = new Map(mediaAssets.map((asset) => [asset._id, asset]));
  const photos: PublicPhoto[] = [];
  const unavailable: UnavailablePhotosBlock[] = [];
  let pendingSection: (PublicPhotoSectionBreak & { id: string }) | undefined;

  for (const block of document.blocks) {
    if (block.type === 'section') {
      // Preserve an intentionally blank section as a real visual break.
      pendingSection = {
        id: block.id,
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
    if (asset.status !== 'ready') {
      unavailable.push({ blockId: block.id, mediaAssetId: block.mediaAssetId, reason: 'not-ready' });
      continue;
    }

    photos.push(publicPhotoFromAsset(asset, {
      provider,
      decorative: block.decorative,
      ...(block.caption ? { caption: block.caption } : {}),
      ...(block.altText ? { altText: block.altText } : {}),
      ...(block.displayDate ? { displayDate: block.displayDate } : {}),
      ...(pendingSection ? {
        sectionBreak: {
          ...(pendingSection.title ? { title: pendingSection.title } : {}),
          ...(pendingSection.text ? { text: pendingSection.text } : {}),
        },
        sectionBlockId: pendingSection.id,
      } : {}),
    }));
    pendingSection = undefined;
  }

  return { photos, unavailable };
}

export function resolveLegacyPhotos(
  mediaAssets: MediaAsset[],
  provider: Pick<MediaProvider, 'buildImageUrl' | 'buildVideoPosterUrl' | 'buildVideoUrl'>,
): PublicPhoto[] {
  return mediaAssets.map((asset) => publicPhotoFromAsset(asset, {
    provider,
    ...(asset.photoSectionBreak ? { sectionBreak: asset.photoSectionBreak, sectionBlockId: asset._id } : {}),
  }));
}
