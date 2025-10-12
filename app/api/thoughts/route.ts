import clientPromise from '../../../lib/mongodb';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const client = await clientPromise;
  const db = client.db();
  const collection = db.collection('thoughts');

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
  const cursor = searchParams.get('cursor');
  
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
  
  return NextResponse.json({
    data: thoughts.map(({ _id, text, createdAt }) => ({ _id, text, createdAt })),
    nextCursor,
  });
}

export async function POST(request: NextRequest) {
  const client = await clientPromise;
  const db = client.db();
  const collection = db.collection('thoughts');

  // API key check
  const apiKey = request.headers.get('x-api-key');
  if (!apiKey || apiKey !== process.env.THOUGHTS_API_KEY) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  
  const body = await request.json();
  const { text } = body;
  
  if (!text || typeof text !== 'string') {
    return NextResponse.json({ error: 'Missing or invalid text' }, { status: 400 });
  }
  
  const doc = {
    text,
    createdAt: new Date(),
  };
  
  const result = await collection.insertOne(doc);
  return NextResponse.json({ _id: result.insertedId, createdAt: doc.createdAt }, { status: 201 });
}
