import { ObjectId, type Collection, type UpdateFilter } from 'mongodb';
import { describe, expect, it } from 'vitest';

import {
  JourneyConflictError,
  JourneyNotFoundError,
  JourneyRepository,
} from '@/lib/journeys/repository';
import type { Journey } from '@/lib/journeys/schemas';
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
