// @vitest-environment node
import { Collection, MongoClient, ObjectId } from 'mongodb';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const connection = vi.hoisted(() => ({ client: null as MongoClient | null }));
vi.mock('../lib/mongodb', () => ({ get default() { return Promise.resolve(connection.client); } }));

const uri = process.env.E2E_MONGODB_URI;
describe.skipIf(!uri)('thoughts API with disposable MongoDB', () => {
  let client: MongoClient;
  beforeAll(async () => {
    if (!uri || !uri.startsWith('mongodb://127.0.0.1:27018/')) throw new Error('Use disposable Mongo on port 27018');
    client = await MongoClient.connect(uri);
    connection.client = client;
    vi.stubEnv('MONGODB_URI', uri);
  });
  beforeEach(async () => { await client.db().collection('thoughts').deleteMany({}); });
  afterAll(async () => { await client.db().dropDatabase(); await client.close(); vi.unstubAllEnvs(); });

  async function get(query = '') {
    const { GET } = await import('../app/api/thoughts/route');
    return GET(new NextRequest(`http://localhost/api/thoughts${query}`));
  }

  it('serves thoughts when index creation fails and retries on the next request', async () => {
    await client.db().collection('thoughts').insertOne({ text: 'Still available', createdAt: new Date() });
    const error = new Error('not authorized to create index');
    const createIndex = vi.spyOn(Collection.prototype, 'createIndex').mockRejectedValueOnce(error);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const response = await get();
      expect(response.status).toBe(200);
      const page = await response.json();
      expect(page.data.map((thought: { text: string }) => thought.text)).toEqual(['Still available']);
      expect(warn).toHaveBeenCalledWith('Unable to create thoughts pagination index; continuing without it', error);
      expect((await get()).status).toBe(200);
      expect(createIndex).toHaveBeenCalledTimes(2);
    } finally {
      createIndex.mockRestore();
      warn.mockRestore();
    }
  });

  it('reaches all 51 timestamp ties exactly once in descending ID order', async () => {
    const ids = Array.from({ length: 51 }, () => new ObjectId());
    await client.db().collection('thoughts').insertMany(ids.map((_id) => ({ _id, text: 'Fixture', createdAt: new Date('2026-01-01T00:00:00.000Z') })));
    const reached: string[] = [];
    let cursor: string | null = null;
    do {
      const response = await get(cursor ? `?cursor=${encodeURIComponent(cursor)}` : '');
      expect(response.status).toBe(200);
      const page = await response.json();
      reached.push(...page.data.map((thought: { _id: string }) => thought._id));
      cursor = page.nextCursor;
    } while (cursor && reached.length <= 51);
    expect(reached).toEqual(ids.map((id) => id.toHexString()).sort().reverse());
    expect(new Set(reached).size).toBe(51);
  });

  it.each(['0', 'abc', '-1', '1.5', '', '10junk', '101'])('rejects invalid limit %j', async (limit) => {
    const response = await get(`?limit=${limit}`);
    expect(response.status).toBe(400);
    expect(await response.json()).toHaveProperty('error');
  });

  it.each(['bogus', '', '2026-01-01T00:00:00.000Z_bad', '2026-02-30T00:00:00.000Z_012345678901234567890123'])('rejects malformed cursor %j', async (cursor) => {
    const response = await get(`?cursor=${cursor}`);
    expect(response.status).toBe(400);
    expect(await response.json()).toHaveProperty('error');
  });

  it('returns an empty terminal page', async () => {
    expect(await (await get()).json()).toEqual({ data: [], nextCursor: null });
  });

  it('accepts legacy ISO cursors and returns older thoughts', async () => {
    await client.db().collection('thoughts').insertMany([
      { text: 'Newer', createdAt: new Date('2026-01-02T00:00:00.000Z') },
      { text: 'Older', createdAt: new Date('2026-01-01T00:00:00.000Z') },
    ]);
    const page = await (await get('?cursor=2026-01-02T00:00:00.000Z')).json();
    expect(page.data.map((thought: { text: string }) => thought.text)).toEqual(['Older']);
    expect(page.nextCursor).toBeNull();
  });
});
