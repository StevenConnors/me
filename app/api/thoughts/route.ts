// @ts-ignore
import clientPromise from '../../../lib/mongodb';
import { NextRequest, NextResponse } from 'next/server';
import { MongoClient } from 'mongodb';

// Type assertion for clientPromise
// @ts-ignore
const getClient = () => clientPromise as Promise<MongoClient>;

interface Thought {
  _id: string;
  text: string;
  createdAt: Date;
}

interface ThoughtInput {
  text: string;
  createdAt: Date;
}

export async function GET(request: NextRequest) {
  try {
    const client = await getClient();
    const db = client.db();
    const collection = db.collection('thoughts');

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const cursor = searchParams.get('cursor');
    
    const query: any = {};
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
  } catch (error) {
    console.error('Error in thoughts API:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const client = await getClient();
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
    
    const doc: ThoughtInput = {
      text,
      createdAt: new Date(),
    };
    
    const result = await collection.insertOne(doc);
    return NextResponse.json({ _id: result.insertedId.toString(), createdAt: doc.createdAt }, { status: 201 });
  } catch (error) {
    console.error('Error in thoughts POST API:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
