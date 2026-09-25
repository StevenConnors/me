#!/usr/bin/env node

/**
 * Registers every Cloudinary image upload with the application's media library.
 * Import never changes public Photos eligibility or an existing record.
 *
 * Usage:
 *   npm run media:import-photos                 # report only
 *   npm run media:import-photos -- --apply      # register missing images
 */

import { ObjectId, MongoClient } from 'mongodb';
import { pathToFileURL } from 'node:url';

import {
  cloudinaryCredentials,
  listAllImageUploads,
  loadEnvironment,
  requiredEnvironment,
} from './lib/cloudinary-images.mjs';

export function newMediaDocument(asset, now) {
  return {
    _id: new ObjectId().toHexString(),
    schemaVersion: 1,
    provider: 'cloudinary',
    providerAssetId: asset.providerAssetId,
    providerPublicId: asset.providerPublicId,
    resourceType: 'image',
    deliveryType: asset.deliveryType,
    ...(asset.version === undefined ? {} : { version: asset.version }),
    originalFilename: asset.originalFilename,
    format: asset.format,
    width: asset.width,
    height: asset.height,
    bytes: asset.bytes,
    ...(asset.checksum ? { checksum: asset.checksum } : {}),
    tags: asset.tags,
    showInPhotos: false,
    status: 'ready',
    createdAt: now,
    updatedAt: now,
  };
}

async function countExisting(collection, assets) {
  const ids = assets.map(({ providerAssetId }) => providerAssetId);
  if (!ids.length) return 0;
  return collection.countDocuments({ provider: 'cloudinary', providerAssetId: { $in: ids } });
}

export async function applyImport(collection, assets) {
  let inserted = 0;
  for (let index = 0; index < assets.length; index += 500) {
    const now = new Date();
    const batch = assets.slice(index, index + 500);
    const result = await collection.bulkWrite(batch.map((asset) => {
      return {
        updateOne: {
          filter: { provider: 'cloudinary', providerAssetId: asset.providerAssetId },
          update: { $setOnInsert: newMediaDocument(asset, now) },
          upsert: true,
        },
      };
    }), { ordered: false });
    inserted += result.upsertedCount;
  }
  return { inserted };
}

async function main() {
  loadEnvironment();
  const apply = process.argv.includes('--apply');
  const [credentials, mongoUri] = [cloudinaryCredentials(), requiredEnvironment('MONGODB_URI')];
  const client = new MongoClient(mongoUri);
  try {
    await client.connect();
    const collection = client.db().collection('media_assets');
    const assets = await listAllImageUploads(credentials);
    const existing = await countExisting(collection, assets);
    console.log(`Found ${assets.length} uploaded Cloudinary image(s): ${assets.length - existing} will be registered and ${existing} existing record(s) will be left unchanged.`);
    if (!apply) {
      console.log('Dry run only. Re-run with --apply to register these images in the media library.');
      return;
    }
    await collection.createIndex(
      { provider: 1, providerAssetId: 1 },
      { name: 'unique_provider_asset', unique: true },
    );
    const { inserted } = await applyImport(collection, assets);
    console.log(`Registered ${inserted} image(s). Add them to the Photos draft from /admin/photos, then publish when ready.`);
  } finally {
    await client.close();
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
