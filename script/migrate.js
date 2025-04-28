const { MongoClient } = require('mongodb');

require('dotenv').config({ path: '.env.local' });

const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error('Please set MONGODB_URI in your environment.');
}

async function migrate() {
  const client = new MongoClient(uri, {});
  await client.connect();
  const db = client.db();
  const collectionName = 'thoughts';

  // Create collection if it doesn't exist
  const collections = await db.listCollections({ name: collectionName }).toArray();
  if (collections.length === 0) {
    await db.createCollection(collectionName);
    console.log(`Created collection: ${collectionName}`);
  } else {
    console.log(`Collection '${collectionName}' already exists.`);
  }

  // Ensure index on createdAt
  await db.collection(collectionName).createIndex({ createdAt: -1 });
  console.log(`Ensured index on { createdAt: -1 } for '${collectionName}'.`);

  await client.close();
  console.log('Migration complete.');
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
}); 