import type { JourneyRepository } from '@/lib/journeys/repository';
import type { MediaProvider } from '@/lib/media/providers/MediaProvider';
import { MediaNotFoundError, type MediaRepository } from '@/lib/media/repository';
import type { MediaAsset } from '@/lib/media/schemas';
import type { PhotosPageRepository } from '@/lib/photos/repository';

export class MediaInUseError extends Error {
  readonly code = 'MEDIA_IN_USE';

  constructor(readonly mediaId: string) {
    super(`Media asset ${mediaId} is still referenced by published content`);
    this.name = 'MediaInUseError';
  }
}

type DeletableMediaRepository = Pick<MediaRepository, 'findById' | 'deleteById'>;
type MediaReferenceRepository = Pick<JourneyRepository, 'isMediaReferenced'>;
type PublishedPhotosReferenceRepository = Pick<PhotosPageRepository, 'isMediaReferencedByPublishedDocument'>;
type AssetDeletionProvider = Pick<MediaProvider, 'deleteAsset'>;

/**
 * Delete the remote original before its database record. If Cloudinary cannot
 * confirm removal, the record remains intact and the author can retry safely.
 */
export async function deleteMediaAsset(
  mediaId: string,
  dependencies: {
    mediaRepository: DeletableMediaRepository;
    journeyRepository: MediaReferenceRepository;
    photosPageRepository?: PublishedPhotosReferenceRepository;
    mediaProvider: AssetDeletionProvider;
  },
): Promise<MediaAsset> {
  const media = await dependencies.mediaRepository.findById(mediaId);
  if (!media) throw new MediaNotFoundError(mediaId);
  if (await dependencies.journeyRepository.isMediaReferenced(mediaId)) {
    throw new MediaInUseError(mediaId);
  }
  if (await dependencies.photosPageRepository?.isMediaReferencedByPublishedDocument(mediaId)) {
    throw new MediaInUseError(mediaId);
  }

  await dependencies.mediaProvider.deleteAsset({
    providerPublicId: media.providerPublicId,
    resourceType: media.resourceType,
    deliveryType: media.deliveryType,
  });
  await dependencies.mediaRepository.deleteById(mediaId);
  return media;
}
