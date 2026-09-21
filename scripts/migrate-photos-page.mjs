#!/usr/bin/env node

/**
 * Seed the singleton Photos page document from the exact legacy public query.
 *
 * Usage:
 *   npm run photos:migrate             # dry run, prints a stable digest
 *   npm run photos:migrate -- --apply  # inserts only when the singleton is absent
 *   npm run photos:migrate -- --backfill-draft          # report missing legacy media
 *   npm run photos:migrate -- --backfill-draft --apply  # append it to an existing draft only
 */

import { createHash } from 'node:crypto';
import { ObjectId, MongoClient } from 'mongodb';
import dotenv from 'dotenv';

export const PHOTOS_MEDIA_LIMIT = 500;
const PHOTOS_SECTION_LIMIT = 100;
const PHOTOS_BLOCK_LIMIT = PHOTOS_MEDIA_LIMIT + PHOTOS_SECTION_LIMIT;

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

function assertDocumentCapacity(document) {
  const mediaCount = document.blocks.filter((block) => block.type === 'media').length;
  const sectionCount = document.blocks.length - mediaCount;
  if (mediaCount > PHOTOS_MEDIA_LIMIT || sectionCount > PHOTOS_SECTION_LIMIT || document.blocks.length > PHOTOS_BLOCK_LIMIT) {
    throw new Error(`Photos draft would exceed its ${PHOTOS_MEDIA_LIMIT}-media or ${PHOTOS_SECTION_LIMIT}-section limit.`);
  }
}

/** Append only unplaced legacy media, preserving every existing author-owned block. */
export function appendMissingMedia(document, photos) {
  const placedMediaIds = new Set(document.blocks.flatMap((block) => block.type === 'media' ? [block.mediaAssetId] : []));
  const missing = photos.filter((photo) => !placedMediaIds.has(photo._id));
  const nextDocument = {
    schemaVersion: 1,
    blocks: [...document.blocks, ...createDocument(missing).blocks],
  };
  assertDocumentCapacity(nextDocument);
  return { document: nextDocument, addedMedia: missing.length };
}

async function main() {
  dotenv.config({ path: '.env.local', quiet: true });
  const apply = process.argv.includes('--apply');
  const backfillDraft = process.argv.includes('--backfill-draft');
  const client = new MongoClient(requiredEnvironment('MONGODB_URI'));
  try {
    await client.connect();
    const database = client.db();
    const photosPages = database.collection('photos_pages');
    const media = database.collection('media_assets');
    const filter = { status: 'ready', showInPhotos: true, resourceType: 'image' };
    const [existing, legacyPhotos, eligibleCount] = await Promise.all([
      photosPages.findOne({ _id: 'photos' }),
      media.find(filter).sort({ captureDate: -1, createdAt: -1 }).limit(PHOTOS_MEDIA_LIMIT).toArray(),
      media.countDocuments(filter),
    ]);

    if (existing) {
      if (!backfillDraft) {
        console.log('Photos page already exists; migration is a no-op. Use --backfill-draft to report or append missing eligible media.');
        return;
      }
      const backfill = appendMissingMedia(existing.draftDocument, legacyPhotos);
      console.log(`Eligible legacy media: ${legacyPhotos.length}; missing from the current draft: ${backfill.addedMedia}; additional eligible assets beyond the ${PHOTOS_MEDIA_LIMIT}-media document limit: ${Math.max(0, eligibleCount - legacyPhotos.length)}.`);
      console.log(`Backfilled draft semantic digest: ${documentDigest(backfill.document)}`);
      if (!backfill.addedMedia) {
        console.log('The current Photos draft already contains every eligible legacy media record.');
        return;
      }
      if (!apply) {
        console.log('Dry run only. Re-run with --backfill-draft --apply to append missing media to the draft without changing the published page.');
        return;
      }
      const now = new Date();
      const result = await photosPages.updateOne(
        { _id: 'photos', draftVersion: existing.draftVersion },
        { $set: { draftDocument: backfill.document, updatedAt: now }, $inc: { draftVersion: 1 } },
      );
      if (!result.modifiedCount) throw new Error('The Photos draft changed during backfill. Re-run the dry run before applying again.');
      console.log(`Appended ${backfill.addedMedia} media block(s) to the draft. Review and publish them from /admin/photos when ready.`);
      return;
    }
    const document = createDocument(legacyPhotos);
    assertDocumentCapacity(document);
    console.log(`Legacy public media: ${legacyPhotos.length}; additional eligible assets beyond the ${PHOTOS_MEDIA_LIMIT}-media document limit: ${Math.max(0, eligibleCount - legacyPhotos.length)}.`);
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
