// @vitest-environment node
import { MongoClient, MongoServerError, ObjectId } from 'mongodb';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createJourneyRevision } from '@/lib/journeys/revisions';
import { JourneyRepository } from '@/lib/journeys/repository';
import type { Journey, JourneyRevision } from '@/lib/journeys/schemas';
import { MediaRepository } from '@/lib/media/repository';
import type { MediaAsset, UploadSession } from '@/lib/media/schemas';
import { makeHeldPlacesDocument, makeJourney, makePlacement, READY_MEDIA_ID } from './fixtures';

describe('ordered journal publication on disposable Mongo', () => {
  const client = new MongoClient('mongodb://127.0.0.1:27018');
  const db = client.db(`publish_test_${new ObjectId()}`);
  const repository = new JourneyRepository(db.collection<Journey>('journeys'), db.collection<JourneyRevision>('revisions'));
  const media = new MediaRepository(db.collection<MediaAsset>('media'), db.collection<UploadSession>('uploads'));
  const input = { journeyId: makeJourney()._id.toHexString(), expectedEditVersion: 0 };
  let publish: () => ReturnType<typeof import('@/lib/journeys/publish-service').publishJourney>;

  beforeAll(async () => { await client.connect(); await db.createCollection('revisions'); });
  afterAll(async () => { await db.dropDatabase(); await client.close(); });
  beforeEach(async () => {
    vi.restoreAllMocks();
    await repository.journeys.deleteMany({});
    await media.mediaAssets.deleteMany({});
    await repository.revisions?.deleteMany({});
    await repository.revisions?.dropIndexes();
    await repository.revisions?.createIndex({ journeyId: 1, sequence: 1 }, { unique: true });
    await repository.journeys.insertOne(makeJourney({ draftDocument: makeHeldPlacesDocument() }));
    await media.mediaAssets.insertOne(makeAsset(READY_MEDIA_ID));
    vi.resetModules();
    const { publishJourney } = await import('@/lib/journeys/publish-service');
    publish = () => publishJourney(repository, media, input);
  });

  function makeAsset(id: string, status: MediaAsset['status'] = 'ready'): MediaAsset {
    return { _id: id, schemaVersion: 1, provider: 'cloudinary', providerAssetId: id,
      providerPublicId: id, resourceType: 'image', deliveryType: 'upload',
      originalFilename: 'fixture.jpg', format: 'jpg', width: 1, height: 1, bytes: 1,
      tags: [], showInPhotos: false, status, altText: 'Fixture coast',
      createdAt: new Date(), updatedAt: new Date(),
      ...(status === 'archived' ? { archivedAt: new Date() } : {}) };
  }

  it('reads unique cover, social and chapter assets in one batch per publish', async () => {
    const document = makeHeldPlacesDocument();
    document.chapters[0].media = ['second', READY_MEDIA_ID, 'second'].map((mediaAssetId) => ({ mediaAssetId }));
    await media.mediaAssets.insertOne(makeAsset('second'));
    await repository.journeys.updateOne({ _id: new ObjectId(input.journeyId) }, { $set: {
      draftDocument: document, social: { image: makePlacement({ mediaAssetId: 'second' }) },
    } });
    const batch = vi.spyOn(media, 'findByIds');
    const single = vi.spyOn(media, 'findById');
    const first = await publish();
    expect(first.journey.status).toBe('published');
    expect(batch).toHaveBeenCalledTimes(1);
    expect(Array.from(batch.mock.calls[0][0])).toEqual([READY_MEDIA_ID, 'second']);
    expect(single).not.toHaveBeenCalled();
    await publish();
    expect(batch).toHaveBeenCalledTimes(2);
  });

  it('preserves missing and non-ready issues in placement order, including duplicates', async () => {
    const ids = ['missing', 'pending', 'failed', 'archived', 'missing', 'pending'];
    const document = makeHeldPlacesDocument();
    document.chapters[0].media = ids.map((mediaAssetId) => ({ mediaAssetId }));
    await media.mediaAssets.insertMany([
      makeAsset('archived', 'archived'), makeAsset('failed', 'failed'), makeAsset('pending', 'pending'),
    ]);
    await repository.journeys.updateOne({ _id: new ObjectId(input.journeyId) }, { $set: { draftDocument: document } });
    await expect(publish()).rejects.toMatchObject({
      code: 'JOURNEY_NOT_PUBLISHABLE', message: 'Journey cannot be published (6 issues)',
      issues: ids.map((id, index) => ({
        code: id === 'missing' ? 'media_missing' : 'media_not_ready',
        path: `mediaPlacements.${index + 1}.mediaAssetId`,
        message: id === 'missing' ? 'Media asset missing does not exist' : `Media asset ${id} is ${id}`,
      })),
    });
    expect(await repository.revisions?.countDocuments({})).toBe(0);
  });

  it('retains cover validation when there are no media references', async () => {
    const document = makeHeldPlacesDocument();
    document.chapters[0].media = [];
    await repository.journeys.updateOne({ _id: new ObjectId(input.journeyId) }, {
      $unset: { cover: '' }, $set: { draftDocument: document },
    });
    await expect(publish()).rejects.toMatchObject({ issues: [
      { code: 'cover_required', path: 'cover', message: 'Choose a cover image before publishing' },
    ] });
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

  it('shares index initialization and retries it after rejection', async () => {
    const revisions = repository.revisions;
    if (!revisions) throw new Error('Missing fixture revisions');
    const createIndex = vi.spyOn(revisions, 'createIndex').mockRejectedValueOnce(new MongoServerError({
      message: 'injected index failure', code: 13, codeName: 'Unauthorized',
    }));
    const logError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const first = await publish();
    await Promise.all([publish(), publish()]);
    const replay = await publish();
    expect(replay.revision._id).toEqual(first.revision._id);
    expect(logError).toHaveBeenCalledWith('Unable to ensure journey publication index', expect.objectContaining({ code: 13 }));
    expect(createIndex).toHaveBeenCalledTimes(2);
    expect(await revisions.countDocuments({})).toBe(1);
  });

  it('builds the partial index over legacy duplicate snapshots with missing and null keys', async () => {
    const revisions = repository.revisions;
    if (!revisions) throw new Error('Missing fixture revisions');
    const draft = makeJourney({ draftDocument: makeHeldPlacesDocument() });
    const legacy = [];
    for (let index = 0; index < 4; index += 1) {
      legacy.push(await createJourneyRevision(revisions, draft, 'published'));
    }
    await db.collection<{ _id: ObjectId; publishedEditVersion?: number | null }>('revisions').updateMany({ _id: { $in: legacy.slice(2).map((revision) => revision._id) } }, {
      $set: { publishedEditVersion: null },
    });
    await repository.journeys.updateOne({ _id: draft._id }, { $set: {
      status: 'published', publishedRevisionId: legacy[3]._id, publishedAt: legacy[3].createdAt,
    } });
    const createIndex = vi.spyOn(revisions, 'createIndex');
    const first = await publish();
    const replay = await publish();
    expect(await createIndex.mock.results[0].value).toBe('journeyId_1_publishedEditVersion_1');
    expect(first.revision.publishedEditVersion).toBe(0);
    expect(replay.revision._id).toEqual(first.revision._id);
    expect(replay.journey.publishedRevisionId).toEqual(first.revision._id);
    expect(await revisions.countDocuments({ publishedEditVersion: 0 })).toBe(1);
    expect(await revisions.countDocuments({})).toBe(5);
    expect(await revisions.countDocuments({ publishedEditVersion: { $exists: false } })).toBe(2);
    expect(await revisions.countDocuments({ publishedEditVersion: { $type: 'null' } })).toBe(2);
    expect((await revisions.indexes()).map((index) => index.name)).toEqual(expect.arrayContaining([
      '_id_', 'journeyId_1_sequence_1', 'journeyId_1_publishedEditVersion_1',
    ]));
    expect((await revisions.indexes()).find((index) => index.name === 'journeyId_1_publishedEditVersion_1')).toMatchObject({
      unique: true, partialFilterExpression: { publishedEditVersion: { $type: 'number' } },
    });
  });

  it.each([
    { conflict: 'IndexOptionsConflict', options: { name: 'legacy_publication_key', unique: true, partialFilterExpression: { publishedEditVersion: { $type: 'number' } } } },
    { conflict: 'IndexKeySpecsConflict', options: { unique: true, partialFilterExpression: { publishedEditVersion: { $exists: true } } } },
  ])('publishes and retries setup on $conflict', async ({ conflict, options }) => {
    const revisions = repository.revisions;
    if (!revisions) throw new Error('Missing fixture revisions');
    await revisions.createIndex({ journeyId: 1, publishedEditVersion: 1 }, options);
    const createIndex = vi.spyOn(revisions, 'createIndex');
    const logError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const first = await publish();
    const replay = await publish();
    expect(createIndex).toHaveBeenCalledTimes(2);
    await expect(createIndex.mock.results[0].value).rejects.toMatchObject({ codeName: conflict });
    expect(logError).toHaveBeenCalledTimes(2);
    expect(replay.revision._id).toEqual(first.revision._id);
    expect(replay.journey.publishedRevisionId).toEqual(first.revision._id);
    expect(await revisions.countDocuments({})).toBe(1);
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
