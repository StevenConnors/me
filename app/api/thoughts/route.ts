// @ts-ignore
import clientPromise from '../../../lib/mongodb';
import { NextRequest, NextResponse } from 'next/server';
import { Filter, MongoClient, ObjectId } from 'mongodb';
import { thoughtsPaginationSchema } from '@/lib/thoughts/schemas';

// Type assertion for clientPromise
// @ts-ignore
const getClient = () => clientPromise as Promise<MongoClient>;

interface ThoughtInput {
  text: string;
  createdAt: Date;
}

let thoughtsIndexReady: Promise<string> | undefined;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const pagination = thoughtsPaginationSchema.safeParse({
    limit: searchParams.get('limit') ?? undefined,
    cursor: searchParams.get('cursor') ?? undefined,
  });
  if (!pagination.success) {
    return NextResponse.json({ error: 'Invalid pagination: limit must be an integer from 1 to 100 and cursor must be valid' }, { status: 400 });
  }
  const { limit, cursor } = pagination.data;
  try {
    // Debug MongoDB connection
    console.log('MongoDB Environment check:', {
      hasMongoUri: !!process.env.MONGODB_URI,
      mongoUriLength: process.env.MONGODB_URI?.length,
      hasDbUserPw: !!process.env.MDB_USER_PW,
      nodeEnv: process.env.NODE_ENV,
      vercelEnv: process.env.VERCEL_ENV
    });
    
    if (!process.env.MONGODB_URI) {
      console.error('MONGODB_URI environment variable is not set');
      return NextResponse.json({ 
        error: 'Database configuration missing',
        data: [],
        nextCursor: null
      }, { status: 500 });
    }
    
    console.log('Attempting to connect to MongoDB...');
    const client = await getClient();
    console.log('MongoDB connected successfully');
    
    const db = client.db();
    const collection = db.collection('thoughts');
    console.log('Collection accessed, querying thoughts...');

    thoughtsIndexReady ??= collection.createIndex({ createdAt: -1, _id: -1 }, { name: 'thoughts_created_at_id' });
    try {
      await thoughtsIndexReady;
    } catch (error) {
      thoughtsIndexReady = undefined;
      throw error;
    }

    let query: Filter<ThoughtInput> = {};
    if (cursor) {
      const createdAt = new Date(cursor.createdAt);
      query = cursor.id ? {
        $or: [
          { createdAt: { $lt: createdAt } },
          { createdAt, _id: { $lt: new ObjectId(cursor.id) } },
        ],
      } : { createdAt: { $lt: createdAt } };
    }
    
    const thoughts = await collection
      .find(query)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .toArray();
      
    console.log(`Found ${thoughts.length} thoughts`);
    
    const lastThought = thoughts[thoughts.length - 1];
    const nextCursor = thoughts.length === limit && lastThought
      ? `${lastThought.createdAt.toISOString()}_${lastThought._id.toHexString()}` : null;
    
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
