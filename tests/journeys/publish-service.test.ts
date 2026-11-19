// @vitest-environment node
import { MongoClient, ObjectId } from 'mongodb';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { publishJourney } from '@/lib/journeys/publish-service';
import { JourneyRepository } from '@/lib/journeys/repository';
import type { Journey, JourneyRevision } from '@/lib/journeys/schemas';
import { MediaRepository } from '@/lib/media/repository';
import type { MediaAsset, UploadSession } from '@/lib/media/schemas';
import { makeHeldPlacesDocument, makeJourney, READY_MEDIA_ID } from './fixtures';

describe('ordered journal publication on disposable Mongo', () => {
  const client = new MongoClient('mongodb://127.0.0.1:27018');
  const db = client.db(`publish_test_${new ObjectId()}`);
  const repository = new JourneyRepository(db.collection<Journey>('journeys'), db.collection<JourneyRevision>('revisions'));
  const media = new MediaRepository(db.collection<MediaAsset>('media'), db.collection<UploadSession>('uploads'));
  const input = { journeyId: makeJourney()._id.toHexString(), expectedEditVersion: 0 };
  const publish = () => publishJourney(repository, media, input);

  beforeAll(async () => { await client.connect(); });
  afterAll(async () => { await db.dropDatabase(); await client.close(); });
  beforeEach(async () => {
    vi.restoreAllMocks();
    await repository.journeys.deleteMany({});
    await repository.revisions?.deleteMany({});
    await repository.journeys.insertOne(makeJourney({ draftDocument: makeHeldPlacesDocument() }));
    vi.spyOn(media, 'findById').mockResolvedValue({ _id: READY_MEDIA_ID, status: 'ready', altText: 'Fixture coast' } as MediaAsset);
  });

  it('replays a version without another revision or publication timestamp', async () => {
    const first = await publish();
    const second = await publish();
    const count = await repository.revisions?.countDocuments({});
    console.log(`publish service demo: revisionCount=${count}`);
    expect(count).toBe(1);
    expect(second.revision._id).toEqual(first.revision._id);
    expect(second.journey.publishedAt).toEqual(first.journey.publishedAt);
    expect(second.journey.publishedRevisionId).toEqual(first.revision._id);
  });

  it('retains the previous live pointer on write failure and completes the staged revision on retry', async () => {
    const first = await publish();
    await repository.journeys.updateOne({ _id: first.journey._id }, { $set: { editVersion: 1 } });
    input.expectedEditVersion = 1;
    vi.spyOn(repository, 'publish').mockRejectedValueOnce(new Error('injected pointer failure'));
    try {
      await expect(publish()).rejects.toThrow('injected pointer failure');
      expect((await repository.findById(input.journeyId))?.publishedRevisionId).toEqual(first.revision._id);
      const retried = await publish();
      expect(retried.journey.publishedRevisionId).toEqual(retried.revision._id);
      expect(await repository.revisions?.countDocuments({})).toBe(2);
    } finally { input.expectedEditVersion = 0; }
  });

  it('deduplicates simultaneous publications', async () => {
    const results = await Promise.all([publish(), publish(), publish()]);
    expect(await repository.revisions?.countDocuments({})).toBe(1);
    expect(results.every((result) => result.revision._id.equals(results[0].revision._id))).toBe(true);
  });

  it('leaves an unpublished draft private until a failed first publication is retried', async () => {
    vi.spyOn(repository, 'publish').mockRejectedValueOnce(new Error('injected pointer failure'));
    await expect(publish()).rejects.toThrow('injected pointer failure');
    expect((await repository.findById(input.journeyId))?.publishedRevisionId).toBeUndefined();
    const retried = await publish();
    expect(await repository.revisions?.countDocuments({})).toBe(1);
    expect(retried.journey.publishedRevisionId).toEqual(retried.revision._id);
  });

  it('does not advance the live pointer when the draft changes between writes', async () => {
    const original = repository.publish.bind(repository);
    vi.spyOn(repository, 'publish').mockImplementationOnce(async (...args) => {
      await repository.journeys.updateOne({ _id: new ObjectId(input.journeyId) }, { $inc: { editVersion: 1 } });
      return original(...args);
    });
    await expect(publish()).rejects.toMatchObject({ code: 'JOURNEY_EDIT_CONFLICT' });
    expect((await repository.findById(input.journeyId))?.publishedRevisionId).toBeUndefined();
    expect(await repository.revisions?.countDocuments({})).toBe(1);
  });

  it('does not stage invalid, missing or stale drafts', async () => {
    await repository.journeys.updateOne({ _id: new ObjectId(input.journeyId) }, { $set: { title: '' } });
    await expect(publish()).rejects.toThrow();
    input.expectedEditVersion = 4;
    await expect(publish()).rejects.toMatchObject({ code: 'JOURNEY_EDIT_CONFLICT' });
    input.expectedEditVersion = 0;
    await repository.journeys.deleteMany({});
    await expect(publish()).rejects.toMatchObject({ code: 'JOURNEY_NOT_FOUND' });
    expect(await repository.revisions?.countDocuments({})).toBe(0);
  });
});
