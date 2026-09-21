import 'server-only';

import type { MediaProvider } from '@/lib/media/providers/MediaProvider';
import type { MediaAsset } from '@/lib/media/schemas';

export type PhotosEditorMedia = {
  id: string;
  originalFilename: string;
  width: number;
  height: number;
  captureDate?: string;
  caption?: string;
  altText?: string;
  source?: string;
  resourceType: 'image' | 'video';
};

/** Build the minimal, serializable media map used by initial render and conflict recovery. */
export function serializePhotosEditorMedia(
  assets: MediaAsset[],
  provider: Pick<MediaProvider, 'buildImageUrl' | 'buildVideoPosterUrl'>,
): Record<string, PhotosEditorMedia> {
  return Object.fromEntries(assets.map((asset) => {
    const source = asset.status !== 'ready'
      ? undefined
      : asset.resourceType === 'video'
        ? provider.buildVideoPosterUrl({
          providerPublicId: asset.providerPublicId,
          version: asset.version,
          width: 768,
        })
        : provider.buildImageUrl({
          providerPublicId: asset.providerPublicId,
          version: asset.version,
          width: 768,
          sourceWidth: asset.width,
          sourceHeight: asset.height,
        });
    const serialized: PhotosEditorMedia = {
      id: asset._id,
      originalFilename: asset.originalFilename,
      width: asset.width,
      height: asset.height,
      ...(asset.captureDate ? { captureDate: asset.captureDate } : {}),
      ...(asset.caption ? { caption: asset.caption } : {}),
      ...(asset.altText ? { altText: asset.altText } : {}),
      ...(source ? { source } : {}),
      resourceType: asset.resourceType,
    };
    return [asset._id, serialized];
  }));
}
