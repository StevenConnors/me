import { createJourneyRevision } from '@/lib/journeys/revisions';
import { assertJourneyPublishable, PublicationValidationError } from '@/lib/journeys/publishing';
import { JourneyConflictError, JourneyNotFoundError, JourneyRepository } from '@/lib/journeys/repository';
import { collectMediaPlacements } from '@/lib/journeys/schemas';
import { MediaRepository } from '@/lib/media/repository';

export { PublicationValidationError };

let publicationIndexReady: Promise<string> | undefined;

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

  const slugOwner = await journeyRepository.findPublicSlugOwner(journey.slug);
  const slugAvailable = !slugOwner || slugOwner.equals(journey._id);
  const mediaIds = new Set([
    ...(journey.cover ? [journey.cover.mediaAssetId] : []),
    ...(journey.social?.image ? [journey.social.image.mediaAssetId] : []),
    ...collectMediaPlacements(journey.draftDocument).map(
      (placement) => placement.mediaAssetId,
    ),
  ]);
  const mediaAssets = await mediaRepository.findByIds(mediaIds);
  const validated = assertJourneyPublishable(journey, {
    mediaAssets,
    summaryOmissionConfirmed: input.summaryOmissionConfirmed,
    slugAvailable,
  });

  // Standalone Mongo cannot transact: stage once, then advance the guarded pointer.
  publicationIndexReady ??= journeyRepository.revisions.createIndex(
    { journeyId: 1, publishedEditVersion: 1 },
    { unique: true, partialFilterExpression: { publishedEditVersion: { $type: 'number' } } },
  );
  try {
    await publicationIndexReady;
  } catch (error) {
    publicationIndexReady = undefined;
    console.error('Unable to ensure journey publication index', error);
  }
  const revision = await createJourneyRevision(
    journeyRepository.revisions,
    validated,
    'published',
    { publishedEditVersion: input.expectedEditVersion },
  );
  if (journey.status === 'published' && journey.publishedRevisionId?.equals(revision._id)) {
    return { journey, revision };
  }
  const publishedJourney = await journeyRepository.publish(
    journey._id,
    input.expectedEditVersion,
    revision,
    { now: revision.createdAt },
  );

  return { journey: publishedJourney, revision };
}
