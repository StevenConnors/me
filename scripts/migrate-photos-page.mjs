#!/usr/bin/env node

/**
 * Seed the singleton Photos page document from the exact legacy public query.
 *
 * Usage:
 *   npm run photos:migrate             # dry run, prints a stable digest
 *   npm run photos:migrate -- --apply  # inserts only when the singleton is absent
 */

import { createHash } from 'node:crypto';
import { ObjectId, MongoClient } from 'mongodb';
import dotenv from 'dotenv';

const LEGACY_LIMIT = 200;

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} must be set in .env.local`);
  return value;
}

function optionalCopy(value) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed || undefined;
}

export function createDocument(photos) {
  const blocks = [];
  for (const photo of photos) {
    if (photo.photoSectionBreak) {
      const title = optionalCopy(photo.photoSectionBreak.title);
      const text = optionalCopy(photo.photoSectionBreak.text);
      blocks.push({
        id: new ObjectId().toHexString(),
        type: 'section',
        ...(title ? { title } : {}),
        ...(text ? { text } : {}),
      });
    }
    const caption = optionalCopy(photo.caption);
    const altText = optionalCopy(photo.altText);
    blocks.push({
      id: new ObjectId().toHexString(),
      type: 'media',
      mediaAssetId: photo._id,
      ...(caption ? { caption } : {}),
      ...(altText ? { altText } : {}),
      decorative: !altText,
      ...(photo.captureDate ? { displayDate: photo.captureDate } : {}),
    });
  }
  return { schemaVersion: 1, blocks };
}

export function documentDigest(document) {
  return createHash('sha256').update(JSON.stringify(document.blocks.map(({ id, ...block }) => block))).digest('hex');
}

async function main() {
  dotenv.config({ path: '.env.local', quiet: true });
  const apply = process.argv.includes('--apply');
  const client = new MongoClient(requiredEnvironment('MONGODB_URI'));
  try {
    await client.connect();
    const database = client.db();
    const photosPages = database.collection('photos_pages');
    const media = database.collection('media_assets');
    const filter = { status: 'ready', showInPhotos: true, resourceType: 'image' };
    const [existing, legacyPhotos, eligibleCount] = await Promise.all([
      photosPages.findOne({ _id: 'photos' }, { projection: { _id: 1 } }),
      media.find(filter).sort({ captureDate: -1, createdAt: -1 }).limit(LEGACY_LIMIT).toArray(),
      media.countDocuments(filter),
    ]);

    if (existing) {
      console.log('Photos page already exists; migration is a no-op.');
      return;
    }
    const document = createDocument(legacyPhotos);
    console.log(`Legacy public media: ${legacyPhotos.length}; additional eligible assets not seeded: ${Math.max(0, eligibleCount - legacyPhotos.length)}.`);
    console.log(`Semantic document digest: ${documentDigest(document)}`);
    if (!apply) {
      console.log('Dry run only. Re-run with --apply to create the Photos page document.');
      return;
    }

    const now = new Date();
    try {
      await photosPages.insertOne({
        _id: 'photos',
        schemaVersion: 1,
        draftDocument: document,
        publishedDocument: document,
        draftVersion: 0,
        createdAt: now,
        updatedAt: now,
        publishedAt: now,
      });
      console.log(`Created the Photos page with ${legacyPhotos.length} published media blocks.`);
    } catch (error) {
      if (error && typeof error === 'object' && error.code === 11000) {
        console.log('Photos page was created concurrently; migration is a no-op.');
        return;
      }
      throw error;
    }
  } finally {
    await client.close();
  }
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
