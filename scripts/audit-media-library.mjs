#!/usr/bin/env node

/** Read-only comparison of Cloudinary uploads and application media references. */
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { writeFile } from 'node:fs/promises';
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const apiRoot = 'https://api.cloudinary.com/v1_1';

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} must be set in .env.local or the environment`);
  return value;
}

function parseArgs(args) {
  if (args.length === 0) return { jsonPath: undefined };
  if (args.length !== 2 || args[0] !== '--json' || !args[1] || args[1].startsWith('--')) {
    throw new Error('Usage: npm run media:audit [-- --json <report.json>]');
  }
  return { jsonPath: resolve(process.cwd(), args[1]) };
}

async function listCloudinaryUploads({ cloudName, apiKey, apiSecret }) {
  const assets = [];
  const cursors = new Set();
  let cursor;
  do {
    const response = await fetch(`${apiRoot}/${encodeURIComponent(cloudName)}/resources/search`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        expression: '(resource_type:image OR resource_type:video) AND type:upload',
        max_results: 500,
        sort_by: [{ created_at: 'asc' }],
        ...(cursor ? { next_cursor: cursor } : {}),
      }),
    });
    if (!response.ok) throw new Error(`Cloudinary search failed (${response.status})`);
    const payload = await response.json();
    if (!Array.isArray(payload.resources)) throw new Error('Cloudinary returned an invalid resources list');
    for (const row of payload.resources) {
      if (!row.asset_id || !row.public_id || !['image', 'video'].includes(row.resource_type)) {
        throw new Error('Cloudinary returned an upload without required identity fields');
      }
      const createdAt = new Date(row.created_at);
      if (Number.isNaN(createdAt.valueOf())) throw new Error('Cloudinary returned an invalid upload timestamp');
      assets.push({
        providerAssetId: String(row.asset_id),
        providerPublicId: String(row.public_id),
        resourceType: row.resource_type,
        checksum: typeof row.etag === 'string' && row.etag.trim() ? row.etag.trim() : undefined,
        uploadDate: createdAt.toISOString().slice(0, 10),
      });
    }
    cursor = typeof payload.next_cursor === 'string' && payload.next_cursor ? payload.next_cursor : undefined;
    if (cursor && cursors.has(cursor)) throw new Error('Cloudinary search returned a repeated cursor');
    if (cursor) cursors.add(cursor);
  } while (cursor);
  return assets;
}

function idText(value) {
  if (value == null) return undefined;
  return typeof value === 'object' && typeof value.toHexString === 'function' ? value.toHexString() : String(value);
}

function collectMediaIds(value, output = new Set()) {
  if (!value || typeof value !== 'object') return output;
  if (Array.isArray(value)) {
    for (const item of value) collectMediaIds(item, output);
    return output;
  }
  if (typeof value.mediaAssetId === 'string') output.add(value.mediaAssetId);
  for (const child of Object.values(value)) collectMediaIds(child, output);
  return output;
}

function compareAssets(providerAssets, records) {
  const recordByProviderId = new Map(records.filter((x) => x.providerAssetId).map((x) => [String(x.providerAssetId), x]));
  const providerIds = new Set(providerAssets.map((x) => x.providerAssetId));
  const providerOnly = providerAssets.filter((x) => !recordByProviderId.has(x.providerAssetId));
  const dbOnly = records.filter((x) => !providerIds.has(String(x.providerAssetId ?? ''))).map((x) => ({
    id: idText(x._id), providerAssetId: x.providerAssetId ?? null, providerPublicId: x.providerPublicId ?? null,
    resourceType: x.resourceType ?? null,
  }));
  const dbById = new Map(records.map((x) => [idText(x._id), x]));
  const duplicateMap = new Map();
  for (const asset of providerAssets) {
    if (!asset.checksum) continue;
    const values = duplicateMap.get(asset.checksum) ?? [];
    values.push(asset);
    duplicateMap.set(asset.checksum, values);
  }
  const duplicateGroups = [...duplicateMap].filter(([, items]) => items.length > 1).map(([checksum, assets]) => ({
    checksum,
    assets: assets.map(({ providerAssetId, providerPublicId, resourceType, uploadDate }) => ({ providerAssetId, providerPublicId, resourceType, uploadDate })),
  }));
  const captureDateEqualsUploadDate = [];
  for (const asset of providerAssets) {
    const record = recordByProviderId.get(asset.providerAssetId);
    const captureDate = typeof record?.captureDate === 'string' ? record.captureDate : undefined;
    if (captureDate && captureDate === asset.uploadDate) captureDateEqualsUploadDate.push({
      providerAssetId: asset.providerAssetId, providerPublicId: asset.providerPublicId,
      captureDate, uploadDate: asset.uploadDate,
    });
  }
  return { providerOnly, dbOnly, duplicateGroups, captureDateEqualsUploadDate, dbById };
}

function missingRefs(ids, dbById, source) {
  return [...ids].filter((id) => !dbById.has(id)).map((mediaAssetId) => ({ source, mediaAssetId }));
}

async function buildReport(db, providerAssets) {
  const [records, photosPage, journeys, revisions] = await Promise.all([
    db.collection('media_assets').find({ provider: 'cloudinary' }, { projection: {
      _id: 1, providerAssetId: 1, providerPublicId: 1, resourceType: 1, checksum: 1,
      captureDate: 1, showInPhotos: 1,
    } }).toArray(),
    db.collection('photos_pages').findOne({ _id: 'photos' }),
    db.collection('journeys').find({ status: 'published' }, { projection: { _id: 1, slug: 1, publishedRevisionId: 1 } }).toArray(),
    db.collection('journey_revisions').find({}, { projection: { _id: 1, journeyId: 1, document: 1, metadataSnapshot: 1 } }).toArray(),
  ]);
  const compared = compareAssets(providerAssets, records);
  const publishedPhotoIds = collectMediaIds(photosPage?.publishedDocument ?? {});
  const legacyIds = new Set(records.filter((record) => record.resourceType === 'image' && record.showInPhotos === true).map((record) => idText(record._id)));
  const photoDivergence = photosPage?.publishedDocument
    ? {
      publishedPageOnly: [...publishedPhotoIds].filter((id) => !legacyIds.has(id)),
      legacyFlagOnly: [...legacyIds].filter((id) => !publishedPhotoIds.has(id)),
      source: 'published Photos document compared with media_assets.showInPhotos',
    }
    : { publishedPageOnly: [], legacyFlagOnly: [], source: 'No published Photos document; legacy flag remains the active fallback' };
  const revisionById = new Map(revisions.map((revision) => [idText(revision._id), revision]));
  const journeyRefs = new Set();
  const journeyRefOwners = new Map();
  for (const journey of journeys) {
    const revision = revisionById.get(idText(journey.publishedRevisionId));
    if (!revision) continue;
    const ids = collectMediaIds({ document: revision.document, metadataSnapshot: revision.metadataSnapshot });
    for (const id of ids) {
      journeyRefs.add(id);
      const owners = journeyRefOwners.get(id) ?? [];
      owners.push(journey.slug);
      journeyRefOwners.set(id, owners);
    }
  }
  const missingPublishedReferences = [
    ...missingRefs(publishedPhotoIds, compared.dbById, 'photos'),
    ...missingRefs(journeyRefs, compared.dbById, 'journey'),
  ].map((reference) => reference.source === 'journey'
    ? { ...reference, journeys: journeyRefOwners.get(reference.mediaAssetId) }
    : reference);
  const countsByType = (items) => Object.fromEntries(['image', 'video'].map((type) => [type, items.filter((item) => item.resourceType === type).length]));
  return {
    summary: {
      cloudinary: { total: providerAssets.length, ...countsByType(providerAssets) },
      database: { total: records.length, ...countsByType(records) },
      providerOnly: compared.providerOnly.length,
      databaseOnly: compared.dbOnly.length,
      exactDuplicateGroups: compared.duplicateGroups.length,
      missingPublishedReferences: missingPublishedReferences.length,
      captureDateEqualsUploadDate: compared.captureDateEqualsUploadDate.length,
    },
    providerOnlyAssets: compared.providerOnly,
    databaseOnlyAssets: compared.dbOnly,
    exactChecksumDuplicateGroups: compared.duplicateGroups,
    missingPublishedReferences,
    showInPhotosDivergence: photoDivergence,
    captureDateEqualsUploadDate: compared.captureDateEqualsUploadDate,
    notes: [
      'Exact duplicates are grouped by Cloudinary etag checksum; assets without a checksum are excluded.',
      'captureDate matching uploadDate is a diagnostic only. Cloudinary upload time is not verified EXIF capture time.',
      'Database-only refers to Cloudinary media records whose providerAssetId is absent from the complete provider inventory.',
    ],
  };
}

async function main() {
  const { jsonPath } = parseArgs(process.argv.slice(2));
  dotenv.config({ path: resolve(root, '.env.local'), quiet: true });
  const cloudName = requiredEnvironment('CLOUDINARY_CLOUD_NAME');
  const apiKey = requiredEnvironment('CLOUDINARY_API_KEY');
  const apiSecret = requiredEnvironment('CLOUDINARY_API_SECRET');
  const mongoUri = requiredEnvironment('MONGODB_URI');
  const client = new MongoClient(mongoUri, { readPreference: 'primary' });
  try {
    await client.connect();
    const providerAssets = await listCloudinaryUploads({ cloudName, apiKey, apiSecret });
    const report = await buildReport(client.db(), providerAssets);
    if (jsonPath) await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify(report.summary, null, 2));
    if (jsonPath) console.log(`Full report written to ${jsonPath}`);
  } finally {
    await client.close();
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error('Media audit failed. Check required credentials, connectivity, and the report path.');
    process.exitCode = 1;
  });
}
