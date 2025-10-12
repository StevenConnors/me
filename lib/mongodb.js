import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
const options = {
  serverSelectionTimeoutMS: 10000, // 10 seconds
  connectTimeoutMS: 10000, // 10 seconds
};

let client;
let clientPromise;

console.log('MongoDB connection setup:', {
  hasUri: !!process.env.MONGODB_URI,
  uriLength: process.env.MONGODB_URI?.length,
  nodeEnv: process.env.NODE_ENV,
  vercelEnv: process.env.VERCEL_ENV
});

if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI environment variable is not set');
  throw new Error('Please add your Mongo URI to .env.local');
}


if (process.env.NODE_ENV === 'development') {
  if (!global._mongoClientPromise) {
    client = new MongoClient(uri, options);
    global._mongoClientPromise = client.connect();
  }
  clientPromise = global._mongoClientPromise;
} else {
  client = new MongoClient(uri, options);
  clientPromise = client.connect();
}

export default clientPromise; 