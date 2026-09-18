import {
  type ClientSession,
  type Collection,
  type MongoServerError,
  ObjectId,
} from 'mongodb';

import {
  JourneyConflictError,
  JourneyNotFoundError,
  JourneyRepository,
  toJourneyObjectId,
} from '@/lib/journeys/repository';
import {
  JourneyRevisionSchema,
  snapshotJourneyMetadata,
  type Journey,
  type JourneyRevision,
  type JourneyRevisionReason,
} from '@/lib/journeys/schemas';

const MAX_SEQUENCE_RETRIES = 3;

function isDuplicateKeyError(error: unknown): error is MongoServerError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 11000
  );
}

export async function createJourneyRevision(
  revisions: Collection<JourneyRevision>,
  journey: Journey,
  reason: JourneyRevisionReason,
  options: { now?: Date; session?: ClientSession } = {},
): Promise<JourneyRevision> {
  for (let attempt = 0; attempt < MAX_SEQUENCE_RETRIES; attempt += 1) {
    const previous = await revisions.findOne(
      { journeyId: journey._id },
      { sort: { sequence: -1 }, projection: { sequence: 1 }, session: options.session },
    );
    const revision = JourneyRevisionSchema.parse({
      _id: new ObjectId(),
      journeyId: journey._id,
      sequence: (previous?.sequence ?? 0) + 1,
      schemaVersion: 1,
      reason,
      document: journey.draftDocument,
      metadataSnapshot: snapshotJourneyMetadata(journey),
      createdAt: options.now ?? new Date(),
    });

    try {
      await revisions.insertOne(revision, { session: options.session });
      return revision;
    } catch (error) {
      if (!isDuplicateKeyError(error) || attempt === MAX_SEQUENCE_RETRIES - 1) {
        throw error;
      }
    }
  }

  throw new Error('Unable to allocate a journey revision sequence');
}

export async function findJourneyRevision(
  revisions: Collection<JourneyRevision>,
  journeyId: string | ObjectId,
  revisionId: string | ObjectId,
  options: { session?: ClientSession } = {},
): Promise<JourneyRevision | null> {
  const revision = await revisions.findOne(
    {
      _id: toJourneyObjectId(revisionId),
      journeyId: toJourneyObjectId(journeyId),
    },
    { session: options.session },
  );
  return revision ? JourneyRevisionSchema.parse(revision) : null;
}

/**
 * Copies a revision into the mutable draft. Callers that require the
 * pre-restore checkpoint and draft update to be atomic should pass a session
 * that is already inside a MongoDB transaction.
 */
export async function restoreJourneyRevision(
  repository: JourneyRepository,
  revisionId: string | ObjectId,
  journeyId: string | ObjectId,
  expectedEditVersion: number,
  options: { now?: Date; session?: ClientSession } = {},
): Promise<Journey> {
  if (!repository.revisions) {
    throw new Error('A revisions collection is required to restore a revision');
  }

  const current = await repository.findById(journeyId, {
    session: options.session,
  });
  if (!current) throw new JourneyNotFoundError(String(journeyId));
  if (current.editVersion !== expectedEditVersion) {
    throw new JourneyConflictError(expectedEditVersion, current.editVersion);
  }

  const target = await findJourneyRevision(
    repository.revisions,
    journeyId,
    revisionId,
    { session: options.session },
  );
  if (!target) {
    throw new JourneyNotFoundError(`revision:${String(revisionId)}`);
  }

  await createJourneyRevision(repository.revisions, current, 'pre-restore', {
    now: options.now,
    session: options.session,
  });

  return repository.updateDraft(
    journeyId,
    expectedEditVersion,
    {
      draftDocument: target.document,
      slug: target.metadataSnapshot.slug,
      title: target.metadataSnapshot.title,
      summary: target.metadataSnapshot.summary ?? null,
      cover: target.metadataSnapshot.cover ?? null,
      experiencedAt: target.metadataSnapshot.experiencedAt ?? null,
      locations: target.metadataSnapshot.locations,
      social: target.metadataSnapshot.social ?? null,
    },
    { now: options.now, session: options.session },
  );
}
