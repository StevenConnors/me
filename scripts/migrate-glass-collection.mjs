#!/usr/bin/env node

/**
 * Reconcile the six provider-only Glass originals to their registered,
 * checksum-matched journey-editor media records and add those records to the
 * application Glass collection. The default mode is read-only; --apply writes
 * only the reversible media_collections membership document.
 */
import { ObjectId, MongoClient } from 'mongodb';
import {
  cloudinaryCredentials,
  loadEnvironment,
  requiredEnvironment,
} from './lib/cloudinary-images.mjs';

const cloudinaryApiRoot = 'https://api.cloudinary.com/v1_1';
const collectionName = 'Glass';

async function listCloudinaryImages(credentials, expression, label) {
  const resources = [];
  const cursors = new Set();
  let cursor;
  do {
    const response = await fetch(`${cloudinaryApiRoot}/${encodeURIComponent(credentials.cloudName)}/resources/search`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${credentials.apiKey}:${credentials.apiSecret}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        expression,
        max_results: 500,
        sort_by: [{ created_at: 'desc' }],
        ...(cursor ? { next_cursor: cursor } : {}),
      }),
    });
    if (!response.ok) throw new Error(`Cloudinary ${label} search failed (${response.status})`);
    const payload = await response.json();
    if (!Array.isArray(payload.resources)) throw new Error(`Cloudinary returned an invalid ${label} resource list`);
    resources.push(...payload.resources);
    cursor = typeof payload.next_cursor === 'string' && payload.next_cursor ? payload.next_cursor : undefined;
    if (cursor && cursors.has(cursor)) throw new Error(`Cloudinary returned a repeated ${label} search cursor`);
    if (cursor) cursors.add(cursor);
  } while (cursor);

  return resources.map((resource) => {
    if (resource?.resource_type !== 'image' || resource?.type !== 'upload') {
      throw new Error(`Cloudinary returned a non-image ${label} upload`);
    }
    return {
      providerAssetId: String(resource.asset_id ?? ''),
      publicId: String(resource.public_id ?? ''),
      checksum: typeof resource.etag === 'string' ? resource.etag.trim() : '',
    };
  });
}

async function resolveCanonicalMedia(mediaAssets, providerGlassAssets, providerJourneyEditorAssets) {
  const glassChecksums = [...new Set(providerGlassAssets.map((asset) => asset.checksum).filter(Boolean))];
  if (glassChecksums.length !== providerGlassAssets.length) {
    throw new Error('Every Glass upload must have an etag before migration can continue');
  }

  const journeyEditorByChecksum = new Map();
  for (const asset of providerJourneyEditorAssets) {
    if (!asset.checksum || !asset.publicId.startsWith('journey-editor/')) continue;
    const list = journeyEditorByChecksum.get(asset.checksum) ?? [];
    list.push(asset);
    journeyEditorByChecksum.set(asset.checksum, list);
  }

  const canonicalProviderAssets = providerGlassAssets.map((glassAsset) => {
    const candidates = journeyEditorByChecksum.get(glassAsset.checksum) ?? [];
    if (candidates.length !== 1) {
      throw new Error(`Expected one journey-editor Cloudinary image for Glass etag ${glassAsset.checksum}; found ${candidates.length}`);
    }
    return { glassAsset, journeyEditorAsset: candidates[0] };
  });
  const providerAssetIds = canonicalProviderAssets.map(({ journeyEditorAsset }) => journeyEditorAsset.providerAssetId);
  if (new Set(providerAssetIds).size !== providerAssetIds.length) {
    throw new Error('Glass etags resolved to a repeated journey-editor Cloudinary asset ID');
  }

  const records = await mediaAssets.find({
    resourceType: 'image',
    status: 'ready',
    providerAssetId: { $in: providerAssetIds },
  }, { projection: { _id: 1, providerAssetId: 1, providerPublicId: 1 } }).toArray();
  const recordsByProviderAssetId = new Map();
  for (const record of records) {
    const key = String(record.providerAssetId ?? '');
    const list = recordsByProviderAssetId.get(key) ?? [];
    list.push(record);
    recordsByProviderAssetId.set(key, list);
  }

  return canonicalProviderAssets.map(({ glassAsset, journeyEditorAsset }) => {
    const candidates = recordsByProviderAssetId.get(journeyEditorAsset.providerAssetId) ?? [];
    if (candidates.length !== 1) {
      throw new Error(`Expected one ready media record for journey-editor provider asset ${journeyEditorAsset.providerAssetId}; found ${candidates.length}`);
    }
    return {
      glassPublicId: glassAsset.publicId,
      checksum: glassAsset.checksum,
      mediaAssetId: String(candidates[0]._id),
      journeyEditorPublicId: candidates[0].providerPublicId,
      providerAssetId: journeyEditorAsset.providerAssetId,
    };
  });
}

async function main() {
  loadEnvironment();
  const apply = process.argv.slice(2).length === 1 && process.argv[2] === '--apply';
  if (process.argv.slice(2).some((arg) => arg !== '--apply') || process.argv.slice(2).length > 1) {
    throw new Error('Usage: node scripts/migrate-glass-collection.mjs [--apply]');
  }

  const credentials = cloudinaryCredentials();
  const client = new MongoClient(requiredEnvironment('MONGODB_URI'));
  try {
    await client.connect();
    const database = client.db();
    const [glassUploads, journeyEditorUploads, mediaAssets] = await Promise.all([
      listCloudinaryImages(credentials, 'resource_type:image AND type:upload AND asset_folder="glass"', 'Glass'),
      listCloudinaryImages(credentials, 'resource_type:image AND type:upload', 'image'),
      database.collection('media_assets'),
    ]);
    if (glassUploads.length !== 6) {
      throw new Error(`Expected exactly six Cloudinary Glass uploads, found ${glassUploads.length}`);
    }
    const resolved = await resolveCanonicalMedia(mediaAssets, glassUploads, journeyEditorUploads);
    const ids = resolved.map(({ mediaAssetId }) => mediaAssetId);
    if (new Set(ids).size !== 6) throw new Error('Glass checksums did not resolve to six unique application media IDs');

    const collections = database.collection('media_collections');
    const glassCollections = await collections.find({ name: collectionName }).toArray();
    if (glassCollections.length > 1) throw new Error('More than one exact-name Glass media collection exists');
    const current = glassCollections[0];
    if (current && (
      typeof current._id !== 'string' || !/^[a-f\d]{24}$/i.test(current._id)
      || current.schemaVersion !== 1 || current.name !== collectionName
      || !Array.isArray(current.mediaAssetIds) || !current.mediaAssetIds.every((id) => typeof id === 'string')
      || !(current.createdAt instanceof Date) || !(current.updatedAt instanceof Date)
    )) {
      throw new Error('The existing Glass collection has an unsupported shape; inspect it before migrating');
    }
    const previousIds = Array.isArray(current?.mediaAssetIds) ? current.mediaAssetIds.map(String) : [];
    const nextIds = [...previousIds, ...ids.filter((id) => !previousIds.includes(id))];

    console.log(JSON.stringify({
      mode: apply ? 'apply' : 'dry-run',
      glassUploadCount: glassUploads.length,
      resolvedJourneyEditorMedia: resolved,
      collection: current ? { id: String(current._id), existingCount: previousIds.length, resultingCount: nextIds.length } : {
        id: '(will be created on apply)', existingCount: 0, resultingCount: nextIds.length,
      },
      cloudinaryMutation: false,
      note: apply ? undefined : 'Dry run only. Re-run with --apply to write Glass collection membership.',
    }, null, 2));

    if (!apply) return;

    const now = new Date();
    if (current) {
      await collections.updateOne({ _id: current._id }, { $set: { mediaAssetIds: nextIds, updatedAt: now } });
    } else {
      await collections.insertOne({
        _id: new ObjectId().toHexString(),
        schemaVersion: 1,
        name: collectionName,
        description: 'Public Glass gallery',
        mediaAssetIds: nextIds,
        createdAt: now,
        updatedAt: now,
      });
    }
    console.log(`Added ${ids.filter((id) => !previousIds.includes(id)).length} media reference(s) to Glass.`);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
