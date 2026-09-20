#!/usr/bin/env node

/**
 * Finds and, only with --apply, deletes byte-for-byte duplicate Cloudinary
 * image uploads. Registered application assets are always retained because
 * they may be used by a journey or the public Photos page.
 *
 * Usage:
 *   npm run media:dedupe                 # report only
 *   npm run media:dedupe -- --apply      # delete safe duplicate originals
 */

import { MongoClient } from 'mongodb';
import { pathToFileURL } from 'node:url';

import {
  cloudinaryCredentials,
  destroyImage,
  listAllImageUploads,
  loadEnvironment,
  requiredEnvironment,
} from './lib/cloudinary-images.mjs';

function compareAssets(left, right) {
  return left.createdAt.valueOf() - right.createdAt.valueOf()
    || left.providerPublicId.localeCompare(right.providerPublicId);
}

/** Pure planning function, exported to keep the destructive decision auditable. */
export function planExactDuplicateDeletion(assets, registeredAssetIds) {
  const groups = new Map();
  for (const asset of assets) {
    if (!asset.checksum) continue;
    const group = groups.get(asset.checksum) ?? [];
    group.push(asset);
    groups.set(asset.checksum, group);
  }

  const duplicateGroups = [];
  for (const [checksum, group] of groups) {
    if (group.length < 2) continue;
    const ordered = [...group].sort(compareAssets);
    const registered = ordered.filter((asset) => registeredAssetIds.has(asset.providerAssetId));
    // Prefer the oldest application record; if none exists, retain the oldest upload.
    const keeper = registered[0] ?? ordered[0];
    duplicateGroups.push({
      checksum,
      keeper,
      protected: registered.filter((asset) => asset.providerAssetId !== keeper.providerAssetId),
      deletable: ordered.filter((asset) => (
        asset.providerAssetId !== keeper.providerAssetId
        && !registeredAssetIds.has(asset.providerAssetId)
      )),
    });
  }
  return duplicateGroups;
}

async function registeredCloudinaryAssetIds(database) {
  const records = await database.collection('media_assets')
    .find({ provider: 'cloudinary' }, { projection: { providerAssetId: 1 } })
    .toArray();
  return new Set(records.map(({ providerAssetId }) => providerAssetId).filter(Boolean));
}

function printPlan(groups) {
  const protectedCount = groups.reduce((total, group) => total + group.protected.length, 0);
  const deletable = groups.flatMap((group) => group.deletable);
  console.log(`Found ${groups.length} exact-duplicate group(s): ${deletable.length} unregistered original(s) can be deleted; ${protectedCount} registered original(s) will be retained.`);
  for (const group of groups) {
    console.log(`\nKeep: ${group.keeper.providerPublicId}`);
    for (const asset of group.deletable) console.log(`  Delete: ${asset.providerPublicId}`);
    for (const asset of group.protected) console.log(`  Retain (registered): ${asset.providerPublicId}`);
  }
  return deletable;
}

async function main() {
  loadEnvironment();
  const apply = process.argv.includes('--apply');
  const [credentials, mongoUri] = [cloudinaryCredentials(), requiredEnvironment('MONGODB_URI')];
  const client = new MongoClient(mongoUri);
  try {
    await client.connect();
    const [assets, registeredIds] = await Promise.all([
      listAllImageUploads(credentials),
      registeredCloudinaryAssetIds(client.db()),
    ]);
    console.log(`Inspected ${assets.length} uploaded Cloudinary image(s).`);
    const deletable = printPlan(planExactDuplicateDeletion(assets, registeredIds));
    if (!apply) {
      console.log('\nDry run only. Re-run with --apply to permanently delete the listed unregistered originals.');
      return;
    }

    let deleted = 0;
    for (const asset of deletable) {
      await destroyImage(credentials, asset);
      deleted += 1;
      console.log(`Deleted: ${asset.providerPublicId}`);
    }
    console.log(`Deleted ${deleted} duplicate Cloudinary original(s).`);
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
