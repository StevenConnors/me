import { ObjectId, type Collection } from 'mongodb';
import { describe, expect, it } from 'vitest';

import { createJourneyRevision } from '@/lib/journeys/revisions';
import type { JourneyRevision } from '@/lib/journeys/schemas';
import { makeJourney } from './fixtures';

class MemoryRevisionCollection {
  values: JourneyRevision[] = [];

  async findOne(filter: { journeyId: unknown }) {
    return (
      this.values
        .filter((revision) => revision.journeyId.equals(filter.journeyId as ObjectId))
        .sort((left, right) => right.sequence - left.sequence)[0] ?? null
    );
  }

  async insertOne(revision: JourneyRevision) {
    this.values.push(revision);
    return { acknowledged: true, insertedId: revision._id };
  }
}

describe('createJourneyRevision', () => {
  it('allocates a per-journey sequence and snapshots editable metadata', async () => {
    const memory = new MemoryRevisionCollection();
    const revisions = memory as unknown as Collection<JourneyRevision>;
    const journey = makeJourney();

    const first = await createJourneyRevision(revisions, journey, 'checkpoint');
    const second = await createJourneyRevision(revisions, journey, 'pre-publish');

    expect(first.sequence).toBe(1);
    expect(second.sequence).toBe(2);
    expect(second.metadataSnapshot).toMatchObject({
      title: journey.title,
      slug: journey.slug,
      cover: journey.cover,
    });
    expect(second.document).toEqual(journey.draftDocument);
    expect(second).not.toHaveProperty('editVersion');
  });
});
