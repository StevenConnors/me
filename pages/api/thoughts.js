import clientPromise from '../../lib/mongodb';

export default async function handler(req, res) {
  const client = await clientPromise;
  const db = client.db();
  const collection = db.collection('thoughts');

  if (req.method === 'GET') {
    // Parse query params
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const cursor = req.query.cursor;
    const query = {};
    if (cursor) {
      query.createdAt = { $lt: new Date(cursor) };
    }
    const thoughts = await collection
      .find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
    const nextCursor = thoughts.length === limit ? thoughts[thoughts.length - 1].createdAt.toISOString() : null;
    res.status(200).json({
      data: thoughts.map(({ _id, text, createdAt }) => ({ _id, text, createdAt })),
      nextCursor,
    });
  } else if (req.method === 'POST') {
    // API key check
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== process.env.THOUGHTS_API_KEY) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const { text } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid text' });
    }
    const doc = {
      text,
      createdAt: new Date(),
    };
    const result = await collection.insertOne(doc);
    res.status(201).json({ _id: result.insertedId, createdAt: doc.createdAt });
  } else {
    res.setHeader('Allow', ['GET', 'POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
} 