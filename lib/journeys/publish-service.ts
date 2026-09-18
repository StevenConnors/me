import { createJourneyRevision } from '@/lib/journeys/revisions';
import { assertJourneyPublishable, PublicationValidationError } from '@/lib/journeys/publishing';
import { JourneyConflictError, JourneyNotFoundError, JourneyRepository } from '@/lib/journeys/repository';
import { MediaRepository } from '@/lib/media/repository';

export { PublicationValidationError };

export async function publishJourney(
  journeyRepository: JourneyRepository,
  mediaRepository: MediaRepository,
  input: {
    journeyId: string;
    expectedEditVersion: number;
    summaryOmissionConfirmed?: boolean;
  },
) {
  const journey = await journeyRepository.findById(input.journeyId);
  if (!journey) throw new JourneyNotFoundError(input.journeyId);
  if (journey.editVersion !== input.expectedEditVersion) {
    throw new JourneyConflictError(input.expectedEditVersion, journey.editVersion);
  }
  if (!journeyRepository.revisions) {
    throw new Error('A revisions collection is required to publish a journey');
  }

  const existingSlug = await journeyRepository.findBySlug(journey.slug);
  const slugAvailable = !existingSlug || existingSlug._id.equals(journey._id);
  const mediaIds = new Set([
    ...(journey.cover ? [journey.cover.mediaAssetId] : []),
    ...(journey.social?.image ? [journey.social.image.mediaAssetId] : []),
    ...journey.draftDocument.content.content.flatMap((node) => {
      if (node.type === 'photograph') return [node.attrs.placement.mediaAssetId];
      if (node.type === 'gallery') return node.attrs.items.map((placement) => placement.mediaAssetId);
      if (node.type === 'storyStep') return [node.attrs.media.mediaAssetId];
      return [];
    }),
  ]);
  const mediaAssets = await Promise.all(Array.from(mediaIds, (mediaId) => mediaRepository.findById(mediaId)));
  const validated = assertJourneyPublishable(journey, {
    mediaAssets: mediaAssets.filter((asset): asset is NonNullable<typeof asset> => Boolean(asset)),
    summaryOmissionConfirmed: input.summaryOmissionConfirmed,
    slugAvailable,
  });

  const revision = await createJourneyRevision(
    journeyRepository.revisions,
    validated,
    'published',
  );
  const publishedJourney = await journeyRepository.publish(
    journey._id,
    input.expectedEditVersion,
    revision._id,
  );

  return { journey: publishedJourney, revision };
}
