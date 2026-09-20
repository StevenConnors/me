import { type Collection } from 'mongodb';
import { describe, expect, it, vi } from 'vitest';

import { startHeldPlacesMigration } from '@/lib/journeys/migration';
import type { JourneyRepository } from '@/lib/journeys/repository';
import type { JourneyDraftPatch, JourneyRevision } from '@/lib/journeys/schemas';
import { makeDocument, makeJourney } from './fixtures';

describe('startHeldPlacesMigration', () => {
  it('checkpoints a legacy draft and replaces only the mutable document', async () => {
    const journey = makeJourney({
      editVersion: 3,
      draftDocument: makeDocument([{
        type: 'paragraph',
        content: [{ type: 'text', text: 'Legacy prose' }],
      }]),
    });
    const inserted: JourneyRevision[] = [];
    const revisions = {
      findOne: vi.fn(async () => null),
      insertOne: vi.fn(async (revision: JourneyRevision) => {
        inserted.push(revision);
        return { acknowledged: true, insertedId: revision._id };
      }),
    } as unknown as Collection<JourneyRevision>;
    const updateDraft = vi.fn(async (
      _id: unknown,
      _version: number,
      patch: JourneyDraftPatch,
    ) => ({
      ...journey,
      editVersion: 4,
      draftDocument: patch.draftDocument!,
    }));
    const repository = {
      revisions,
      findById: vi.fn(async () => journey),
      updateDraft,
    } as unknown as JourneyRepository;

    const result = await startHeldPlacesMigration(repository, {
      journeyId: journey._id.toHexString(),
      expectedEditVersion: 3,
    });

    expect(result.migrated).toBe(true);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      reason: 'migration',
      document: journey.draftDocument,
    });
    expect(updateDraft).toHaveBeenCalledWith(
      journey._id,
      3,
      { draftDocument: expect.objectContaining({ schemaVersion: 2 }) },
    );
    expect(result.journey.publishedRevisionId).toEqual(journey.publishedRevisionId);
  });

  it('is a no-op after a journey is already on Held Places', async () => {
    const journey = makeJourney({ editVersion: 2 });
    const repository = {
      revisions: { insertOne: vi.fn() },
      findById: vi.fn(async () => journey),
      updateDraft: vi.fn(),
    } as unknown as JourneyRepository;

    const result = await startHeldPlacesMigration(repository, {
      journeyId: journey._id.toHexString(),
      expectedEditVersion: 2,
    });

    expect(result.migrated).toBe(false);
    expect(repository.updateDraft).not.toHaveBeenCalled();
  });
});
