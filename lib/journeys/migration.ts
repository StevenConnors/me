import { createJourneyRevision } from '@/lib/journeys/revisions';
import {
  createEmptyHeldPlacesDocument,
  isHeldPlacesDocument,
} from '@/lib/journeys/schemas';
import {
  JourneyConflictError,
  JourneyNotFoundError,
  JourneyRepository,
} from '@/lib/journeys/repository';

/**
 * Starts the author-assisted migration without changing the public revision.
 * Repeating the action after a successful migration is a safe no-op.
 */
export async function startHeldPlacesMigration(
  repository: JourneyRepository,
  input: { journeyId: string; expectedEditVersion: number },
) {
  const journey = await repository.findById(input.journeyId);
  if (!journey) throw new JourneyNotFoundError(input.journeyId);
  if (journey.editVersion !== input.expectedEditVersion) {
    throw new JourneyConflictError(
      input.expectedEditVersion,
      journey.editVersion,
    );
  }
  if (isHeldPlacesDocument(journey.draftDocument)) {
    return { journey, migrated: false as const };
  }
  if (!repository.revisions) {
    throw new Error('A revisions collection is required to migrate a journey');
  }

  await createJourneyRevision(repository.revisions, journey, 'migration');
  const migrated = await repository.updateDraft(
    journey._id,
    input.expectedEditVersion,
    { draftDocument: createEmptyHeldPlacesDocument() },
  );
  return { journey: migrated, migrated: true as const };
}
