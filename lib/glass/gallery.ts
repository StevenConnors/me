import 'server-only';

import type { GalleryMediaItem } from '@/components/MediaGrid';
import { getCloudinaryMediaProvider } from '@/lib/media/provider';
import { MediaRepository } from '@/lib/media/repository';
import { MediaCollectionRepository } from '@/lib/media/collections';

/**
 * Glass is an ordered view over assets in the application media library.
 * Cloudinary folders are no longer a publishing source for this page.
 */
export async function loadGlassGallery(): Promise<GalleryMediaItem[]> {
  const collectionRepository = await MediaCollectionRepository.connect();
  const glassCollection = (await collectionRepository.list()).find((collection) => collection.name === 'Glass');
  if (!glassCollection?.mediaAssetIds.length) return [];

  const mediaRepository = await MediaRepository.connect();
  const records = await mediaRepository.findByIds(glassCollection.mediaAssetIds);
  const recordsById = new Map(records.map((record) => [record._id, record]));
  const images = glassCollection.mediaAssetIds
    .map((id) => recordsById.get(id))
    .filter((record): record is NonNullable<typeof record> => Boolean(
      record && record.status === 'ready' && record.resourceType === 'image',
    ));
  if (!images.length) return [];

  const provider = getCloudinaryMediaProvider();
  return images.map((asset, index) => {
    const image = {
      providerPublicId: asset.providerPublicId,
      version: asset.version,
      sourceWidth: asset.width,
      sourceHeight: asset.height,
    };
    return {
      id: asset._id,
      kind: 'photo',
      src: provider.buildImageUrl({ ...image, width: 1920 }),
      thumbnailSrc: provider.buildImageUrl({ ...image, width: 768 }),
      width: asset.width,
      height: asset.height,
      alt: asset.altText?.trim() || asset.title?.trim() || `Glass photograph ${index + 1}`,
    };
  });
}
