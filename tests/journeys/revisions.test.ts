import { ObjectId, type Collection } from 'mongodb';
import { describe, expect, it } from 'vitest';

import { createJourneyRevision } from '@/lib/journeys/revisions';
import {
  JourneyRevisionSchema,
  snapshotJourneyMetadata,
  type JourneyRevision,
} from '@/lib/journeys/schemas';
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
  it('omits optional metadata that MongoDB would otherwise store as null', () => {
    const snapshot = snapshotJourneyMetadata(makeJourney({
      summary: undefined,
      cover: undefined,
      experiencedAt: undefined,
      social: undefined,
    }));

    expect(snapshot).not.toHaveProperty('summary');
    expect(snapshot).not.toHaveProperty('cover');
    expect(snapshot).not.toHaveProperty('experiencedAt');
    expect(snapshot).not.toHaveProperty('social');
  });

  it('reads historical revisions that stored cleared optional metadata as null', () => {
    const journey = makeJourney();
    const revision = JourneyRevisionSchema.parse({
      _id: new ObjectId(),
      journeyId: journey._id,
      sequence: 1,
      schemaVersion: 1,
      reason: 'published',
      document: journey.draftDocument,
      metadataSnapshot: {
        slug: journey.slug,
        title: journey.title,
        summary: null,
        cover: null,
        experiencedAt: null,
        locations: [],
        social: null,
      },
      createdAt: journey.createdAt,
    });

    expect(revision.metadataSnapshot).toMatchObject({
      slug: journey.slug,
      title: journey.title,
      locations: [],
    });
    expect(revision.metadataSnapshot.summary).toBeUndefined();
    expect(revision.metadataSnapshot.cover).toBeUndefined();
    expect(revision.metadataSnapshot.experiencedAt).toBeUndefined();
    expect(revision.metadataSnapshot.social).toBeUndefined();
  });

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
