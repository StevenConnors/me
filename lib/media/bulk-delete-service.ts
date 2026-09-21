import type { JourneyRepository } from '@/lib/journeys/repository';
import type { MediaRepository } from '@/lib/media/repository';
import type { PhotosPageRepository } from '@/lib/photos/repository';

export type MediaDeletionClassification =
  | 'ready_to_delete'
  | 'publish_removal_first'
  | 'used_by_journey'
  | 'not_found';

export type MediaDeletionPlanItem = {
  id: string;
  filename: string;
  classification: MediaDeletionClassification;
};

type Dependencies = {
  mediaRepository: Pick<MediaRepository, 'findById'>;
  journeyRepository: Pick<JourneyRepository, 'isMediaReferenced'>;
  photosPageRepository: Pick<PhotosPageRepository, 'isMediaReferencedByPublishedDocument'>;
};

/** Read-only classification; the delete endpoint repeats these checks before every remote deletion. */
export async function planMediaDeletion(
  mediaIds: string[],
  dependencies: Dependencies,
): Promise<MediaDeletionPlanItem[]> {
  return Promise.all(mediaIds.map(async (id) => {
    const media = await dependencies.mediaRepository.findById(id);
    if (!media) return { id, filename: 'Unknown upload', classification: 'not_found' as const };
    if (await dependencies.journeyRepository.isMediaReferenced(id)) {
      return { id, filename: media.originalFilename, classification: 'used_by_journey' as const };
    }
    if (await dependencies.photosPageRepository.isMediaReferencedByPublishedDocument(id)) {
      return { id, filename: media.originalFilename, classification: 'publish_removal_first' as const };
    }
    return { id, filename: media.originalFilename, classification: 'ready_to_delete' as const };
  }));
}
