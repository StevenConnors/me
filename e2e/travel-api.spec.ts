import { MongoClient, type Collection, type Document } from 'mongodb';
import { expect, test, type APIRequestContext } from '@playwright/test';

const mongoUri = process.env.E2E_MONGODB_URI ?? 'mongodb://127.0.0.1:27018/journey_editor_e2e';
const emptySelections = { countries: [], usStates: [], japanPrefectures: [] };
const mongoDatabaseName = new URL(mongoUri).pathname.replace(/^\//, '');

function assertDisposableMongoUri(value: string) {
  const parsed = new URL(value);
  if (!['127.0.0.1', 'localhost'].includes(parsed.hostname) || parsed.port !== '27018' || !parsed.pathname.slice(1).endsWith('_e2e')) {
    throw new Error('Travel API E2E requires a local Mongo database on port 27018 with an *_e2e database name.');
  }
}

async function withIsolatedTravelRecord(run: (request: APIRequestContext, collection: Collection<Document>) => Promise<void>, request: APIRequestContext) {
  assertDisposableMongoUri(mongoUri);
  const mongo = new MongoClient(mongoUri);
  await mongo.connect();
  const collection = mongo.db(mongoDatabaseName).collection<Document>('travel');
  const original = await collection.findOne({ _id: 'travel' });
  await collection.deleteOne({ _id: 'travel' });
  try {
    await run(request, collection);
  } finally {
    if (original) await collection.replaceOne({ _id: 'travel' }, original, { upsert: true });
    else await collection.deleteOne({ _id: 'travel' });
    await mongo.close();
  }
}

test('travel API creates canonical selections and rejects invalid or stale writes', async ({ request }, testInfo) => {
  test.setTimeout(60_000);
  await withIsolatedTravelRecord(async (client, collection) => {
    const artifact: Record<string, unknown> = { case: 'travel API validation', observed: {} };
    const initial = await client.get('/api/admin/travel');
    expect(initial.ok()).toBe(true);
    const initialBody = await initial.json() as { selections: typeof emptySelections; version: number; updatedAt: string | null };
    expect(initialBody).toEqual({ selections: emptySelections, version: 0, updatedAt: null });
    artifact.observed = { ...(artifact.observed as object), initialRead: initialBody };

    const selections = { countries: ['JP', 'JP'], usStates: ['US-CA'], japanPrefectures: ['JP-13'] };
    const saved = await client.put('/api/admin/travel', { data: { selections, expectedVersion: initialBody.version } });
    expect(saved.status()).toBe(200);
    const savedBody = await saved.json() as { selections: typeof emptySelections; version: number; updatedAt: string };
    expect(savedBody.selections).toEqual({ countries: ['JP'], usStates: ['US-CA'], japanPrefectures: ['JP-13'] });
    expect(savedBody.version).toBe(1);
    expect(savedBody.updatedAt).toBeTruthy();
    artifact.observed = { ...(artifact.observed as object), saved: { status: saved.status(), body: savedBody } };

    const reloaded = await client.get('/api/admin/travel');
    expect(reloaded.ok()).toBe(true);
    expect(await reloaded.json()).toEqual(savedBody);
    expect(await collection.findOne({ _id: 'travel' })).toMatchObject({ selections: savedBody.selections, version: 1 });

    const invalidStatuses: number[] = [];
    const invalidInputs = [
      { selections: { countries: [], usStates: [] }, expectedVersion: 1 },
      { selections: { ...emptySelections, countries: ['NOT-A-COUNTRY'] }, expectedVersion: 1 },
      { selections: emptySelections, expectedVersion: 1, extra: true },
    ];
    for (const data of invalidInputs) {
      const invalid = await client.put('/api/admin/travel', { data });
      invalidStatuses.push(invalid.status());
      expect(invalid.status()).toBe(400);
      expect(await (await client.get('/api/admin/travel')).json()).toEqual(savedBody);
    }
    const malformed = await client.put('/api/admin/travel', {
      data: '{',
      headers: { 'content-type': 'application/json' },
    });
    invalidStatuses.push(malformed.status());
    expect(malformed.status()).toBe(400);
    expect(await (await client.get('/api/admin/travel')).json()).toEqual(savedBody);

    const stale = await client.put('/api/admin/travel', {
      data: { selections: emptySelections, expectedVersion: 0 },
    });
    expect(stale.status()).toBe(409);
    expect((await stale.json() as { error: { details?: { currentVersion?: number } } }).error.details?.currentVersion).toBe(1);
    expect(await (await client.get('/api/admin/travel')).json()).toEqual(savedBody);
    artifact.observed = {
      ...(artifact.observed as object),
      invalidWriteStatuses: invalidStatuses,
      staleWrite: { status: stale.status(), currentVersion: 1 },
      persistenceUnchangedAfterRejectedWrites: true,
    };
    await testInfo.attach('travel-api-validation-e2e.json', { body: JSON.stringify(artifact, null, 2), contentType: 'application/json' });
  }, request);
});

test('concurrent first saves with the same version have one winner', async ({ request }, testInfo) => {
  test.setTimeout(60_000);
  await withIsolatedTravelRecord(async (client, collection) => {
    const candidates = [
      { countries: ['JP'], usStates: ['US-CA'], japanPrefectures: ['JP-13'] },
      { countries: ['FR'], usStates: ['US-NY'], japanPrefectures: ['JP-27'] },
    ];
    const responses = await Promise.all(candidates.map((selections) =>
      client.put('/api/admin/travel', { data: { selections, expectedVersion: 0 } }),
    ));
    expect(responses.map((response) => response.status()).sort()).toEqual([200, 409]);

    const winnerIndex = responses.findIndex((response) => response.status() === 200);
    const winner = await responses[winnerIndex].json() as { selections: typeof emptySelections; version: number; updatedAt: string };
    expect(winner.version).toBe(1);
    const persisted = await client.get('/api/admin/travel');
    expect(persisted.ok()).toBe(true);
    expect(await persisted.json()).toEqual(winner);
    expect(await collection.findOne({ _id: 'travel' })).toMatchObject({ selections: winner.selections, version: 1 });
    await testInfo.attach('travel-api-concurrency-e2e.json', {
      body: JSON.stringify({
        case: 'concurrent first saves',
        observed: { statuses: responses.map((response) => response.status()), winner, persistedVersion: 1 },
      }, null, 2),
      contentType: 'application/json',
    });
  }, request);
});
