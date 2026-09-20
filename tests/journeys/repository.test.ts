import { ObjectId, type Collection, type UpdateFilter } from 'mongodb';
import { describe, expect, it, vi } from 'vitest';

import {
  JourneyConflictError,
  JourneyNotFoundError,
  JourneyRepository,
} from '@/lib/journeys/repository';
import {
  JourneyRevisionSchema,
  type Journey,
  type JourneyRevision,
} from '@/lib/journeys/schemas';
import { makeJourney } from './fixtures';

class MemoryJourneyCollection {
  constructor(public value: Journey | null) {}

  async findOne(filter: { _id?: ObjectId }) {
    if (!this.value || !filter._id?.equals(this.value._id)) return null;
    return this.value;
  }

  async findOneAndUpdate(
    filter: { _id: ObjectId; editVersion?: number },
    update: UpdateFilter<Journey>,
  ) {
    if (
      !this.value ||
      !filter._id.equals(this.value._id) ||
      (filter.editVersion !== undefined &&
        filter.editVersion !== this.value.editVersion)
    ) {
      return { value: null };
    }

    const next = { ...this.value } as Journey & Record<string, unknown>;
    Object.assign(next, update.$set);
    for (const key of Object.keys(update.$unset ?? {})) delete next[key];
    next.editVersion += Number(update.$inc?.editVersion ?? 0);
    this.value = next;
    return { value: next };
  }

  async deleteOne(filter: { _id: ObjectId }) {
    if (!this.value || !filter._id.equals(this.value._id)) {
      return { acknowledged: true, deletedCount: 0 };
    }
    this.value = null;
    return { acknowledged: true, deletedCount: 1 };
  }
}

function repositoryFor(journey: Journey | null) {
  const collection = new MemoryJourneyCollection(journey);
  return {
    collection,
    repository: new JourneyRepository(
      collection as unknown as Collection<Journey>,
    ),
  };
}

describe('JourneyRepository.updateDraft', () => {
  it('updates only the expected version and increments editVersion', async () => {
    const original = makeJourney();
    const { repository } = repositoryFor(original);
    const now = new Date('2026-09-18T01:00:00.000Z');

    const updated = await repository.updateDraft(
      original._id,
      0,
      { title: 'Across the snow' },
      { now },
    );

    expect(updated.title).toBe('Across the snow');
    expect(updated.editVersion).toBe(1);
    expect(updated.updatedAt).toEqual(now);
  });

  it('returns the current version in a stale-write conflict', async () => {
    const original = makeJourney({ editVersion: 4 });
    const { repository } = repositoryFor(original);

    await expect(
      repository.updateDraft(original._id, 3, { title: 'Stale title' }),
    ).rejects.toEqual(expect.objectContaining<Partial<JourneyConflictError>>({
      code: 'JOURNEY_EDIT_CONFLICT',
      expectedEditVersion: 3,
      currentEditVersion: 4,
    }));
  });

  it('distinguishes a missing journey from a conflict', async () => {
    const { repository } = repositoryFor(null);

    await expect(
      repository.updateDraft(new ObjectId(), 0, { title: 'Gone' }),
    ).rejects.toBeInstanceOf(JourneyNotFoundError);
  });

  it('unsets optional values when the patch explicitly uses null', async () => {
    const original = makeJourney({ summary: 'Remove me' });
    const { repository } = repositoryFor(original);

    const updated = await repository.updateDraft(original._id, 0, {
      summary: null,
    });

    expect(updated.summary).toBeUndefined();
  });
});

describe('JourneyRepository.publish', () => {
  it('atomically points a matching draft at its immutable public revision', async () => {
    const original = makeJourney({ editVersion: 2 });
    const { repository } = repositoryFor(original);
    const revisionId = new ObjectId();
    const now = new Date('2026-09-18T03:00:00.000Z');

    const published = await repository.publish(original._id, 2, revisionId, { now });

    expect(published.status).toBe('published');
    expect(published.publishedRevisionId).toEqual(revisionId);
    expect(published.publishedAt).toEqual(now);
    expect(published.firstPublishedAt).toEqual(now);
  });
});

describe('JourneyRepository.deleteById', () => {
  it('removes the journey and its immutable revision history', async () => {
    const original = makeJourney();
    const { collection, repository } = repositoryFor(original);
    const deleteMany = vi.fn(async () => ({ acknowledged: true, deletedCount: 2 }));
    const revisionRepository = new JourneyRepository(
      collection as unknown as Collection<Journey>,
      { deleteMany } as unknown as Collection<JourneyRevision>,
    );

    await revisionRepository.deleteById(original._id);

    expect(collection.value).toBeNull();
    expect(deleteMany).toHaveBeenCalledWith(
      { journeyId: original._id },
      { session: undefined },
    );
    await expect(repository.findById(original._id)).resolves.toBeNull();
  });
});

describe('JourneyRepository.isMediaReferenced', () => {
  it('checks draft and immutable revision placements before an asset can be deleted', async () => {
    const draftFindOne = vi.fn(async () => null);
    const revisionFindOne = vi.fn(async () => ({ _id: new ObjectId() }));
    const repository = new JourneyRepository(
      { findOne: draftFindOne } as unknown as Collection<Journey>,
      { findOne: revisionFindOne } as unknown as Collection<JourneyRevision>,
    );

    await expect(repository.isMediaReferenced('media-record')).resolves.toBe(true);

    expect(draftFindOne).toHaveBeenCalledWith(
      expect.objectContaining({
        $or: expect.arrayContaining([
          { 'cover.mediaAssetId': 'media-record' },
          { 'draftDocument.content.content.attrs.items.mediaAssetId': 'media-record' },
        ]),
      }),
      { projection: { _id: 1 } },
    );
    expect(revisionFindOne).toHaveBeenCalledWith(
      expect.objectContaining({
        $or: expect.arrayContaining([
          { 'metadataSnapshot.cover.mediaAssetId': 'media-record' },
          { 'document.content.content.attrs.media.mediaAssetId': 'media-record' },
        ]),
      }),
      { projection: { _id: 1 } },
    );
  });
});

describe('JourneyRepository.listPublishedSummaries', () => {
  it('uses selected immutable revision metadata instead of the mutable draft', async () => {
    const revisionId = new ObjectId();
    const journey = makeJourney({
      title: 'Unpublished draft title',
      summary: 'Unpublished draft summary',
      status: 'published',
      publishedRevisionId: revisionId,
      publishedAt: new Date('2026-09-19T12:00:00.000Z'),
    });
    const revision = JourneyRevisionSchema.parse({
      _id: revisionId,
      journeyId: journey._id,
      sequence: 2,
      schemaVersion: 1,
      reason: 'published',
      document: journey.draftDocument,
      metadataSnapshot: {
        slug: 'published-slug',
        title: 'Published title',
        summary: 'Published summary',
        cover: journey.cover,
        locations: [{ id: 'tohoku', label: 'Tohoku' }],
      },
      createdAt: new Date('2026-09-19T12:00:00.000Z'),
    });
    const cursor = <T,>(values: T[]) => ({
      sort: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      toArray: vi.fn(async () => values),
    });
    const journeyCursor = cursor([journey]);
    const revisionCursor = cursor([revision]);
    const repository = new JourneyRepository(
      { find: vi.fn(() => journeyCursor) } as unknown as Collection<Journey>,
      { find: vi.fn(() => revisionCursor) } as unknown as Collection<JourneyRevision>,
    );

    const summaries = await repository.listPublishedSummaries();

    expect(summaries).toEqual([expect.objectContaining({
      slug: 'published-slug',
      title: 'Published title',
      summary: 'Published summary',
      locations: [{ id: 'tohoku', label: 'Tohoku' }],
    })]);
    expect(summaries[0].title).not.toBe(journey.title);
    expect(journeyCursor.sort).toHaveBeenCalledWith({ publishedAt: -1 });
  });
});
