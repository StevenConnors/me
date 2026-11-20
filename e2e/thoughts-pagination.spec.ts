import { MongoClient, ObjectId } from 'mongodb';
import { expect, test } from '@playwright/test';

test('thoughts pagination preserves timestamp ties and rejects invalid input', async ({ request }, testInfo) => {
  const mongo = await MongoClient.connect(process.env.E2E_MONGODB_URI ?? 'mongodb://127.0.0.1:27018/journey_editor_e2e');
  const collection = mongo.db().collection('thoughts');
  const ids = Array.from({ length: 51 }, () => new ObjectId());
  try {
    await collection.insertMany(ids.map((_id) => ({ _id, text: 'Pagination fixture', createdAt: new Date('2099-01-01T00:00:00.000Z') })));
    const first = await request.get('/api/thoughts');
    expect(first.status()).toBe(200);
    const page = await first.json();
    const second = await request.get('/api/thoughts', { params: { cursor: page.nextCursor } });
    const tail = await second.json();
    const reached = [...page.data, ...tail.data].map((thought: { _id: string }) => thought._id).filter((id: string) => ids.some((fixture) => fixture.toHexString() === id));
    expect(reached).toEqual(ids.map((id) => id.toHexString()).sort().reverse());
    expect(new Set(reached).size).toBe(51);
    for (const query of ['limit=0', 'limit=abc', 'limit=-1', 'cursor=bogus']) {
      const response = await request.get(`/api/thoughts?${query}`);
      expect(response.status()).toBe(400);
      expect(await response.json()).toHaveProperty('error');
    }
    await testInfo.attach('e2e-fixture-thoughts-pagination.json', { body: JSON.stringify({ reached: reached.length, unique: new Set(reached).size }), contentType: 'application/json' });
  } finally {
    await collection.deleteMany({ _id: { $in: ids } });
    await mongo.close();
  }
});
