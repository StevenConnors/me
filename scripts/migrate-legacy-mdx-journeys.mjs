#!/usr/bin/env node

/**
 * Imports the allowlisted legacy MDX stories as unpublished Held Places drafts.
 *
 * Usage:
 *   node scripts/migrate-legacy-mdx-journeys.mjs          # inspect only
 *   node scripts/migrate-legacy-mdx-journeys.mjs --apply  # create drafts
 *
 * The script never publishes, edits, or deletes a journey. It reuses existing
 * Cloudinary assets by registering them in media_assets, rather than uploading
 * another copy. It refuses to touch a story whose slug is already in journeys.
 */

import { readFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ObjectId, MongoClient } from 'mongodb';
import dotenv from 'dotenv';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cloudinaryApiRoot = 'https://api.cloudinary.com/v1_1';
const legacyStoryAliases = {
  // The original MDX spelling differs from the uploaded Cloudinary public ID.
  'stories/dfw-okc/inspection-car-ride': 'stories/dfw-okc/inspetion-car-ride',
};

const storyMetadata = {
  'dfw-okc': {
    experiencedAt: { start: '2024-08-01', end: '2024-08-05' },
    locations: [
      { id: 'dallas-fort-worth', label: 'Dallas–Fort Worth', countryCode: 'US' },
      { id: 'oklahoma-city', label: 'Oklahoma City', countryCode: 'US' },
    ],
  },
  newpoc: { locations: [] },
  poc: { locations: [] },
};

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} must be set in .env.local`);
  return value;
}

function asText(value) {
  return value
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/\r/g, '')
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function richTextDocument(value) {
  return {
    type: 'doc',
    content: asText(value).map((text) => ({
      type: 'paragraph',
      content: [{ type: 'text', text }],
    })),
  };
}

function parseStepAttributes(rawAttributes, slug) {
  const media = /\bmedia\s*=\s*["']([^"']+)["']/.exec(rawAttributes)?.[1];
  const kind = /\bkind\s*=\s*["']([^"']+)["']/.exec(rawAttributes)?.[1] ?? 'image';
  if (!media) throw new Error(`${slug}: a Step is missing its media attribute`);
  if (kind !== 'image' && kind !== 'video') {
    throw new Error(`${slug}: unsupported Step kind ${JSON.stringify(kind)}`);
  }
  return { media, kind };
}

/** Exported for a small, deterministic parser test. */
export function parseLegacyStory(source, slug) {
  const title = /<h1\b[^>]*>([\s\S]*?)<\/h1>/.exec(source)?.[1]
    .replace(/<[^>]+>/g, '')
    .trim();
  if (!title) throw new Error(`${slug}: no <h1> title found`);

  const steps = [];
  const stepPattern = /<Step\b([^>]*)>([\s\S]*?)<\/Step>/g;
  let match;
  while ((match = stepPattern.exec(source))) {
    const attributes = parseStepAttributes(match[1], slug);
    steps.push({ ...attributes, body: richTextDocument(match[2]) });
  }
  if (!steps.length) throw new Error(`${slug}: no Step elements found`);
  return { slug, title, steps };
}

async function readLegacyStories() {
  return Promise.all(Object.keys(storyMetadata).map(async (slug) => {
    const file = resolve(root, 'content', 'stories', `${slug}.mdx`);
    return parseLegacyStory(await readFile(file, 'utf8'), slug);
  }));
}

function requiredPublicIds(stories) {
  return new Set(stories.flatMap((story) => story.steps.map(({ media }) => (
    legacyStoryAliases[media] ?? media
  ))));
}

async function listCloudinaryStoryAssets({ cloudName, apiKey, apiSecret }) {
  const response = await fetch(`${cloudinaryApiRoot}/${encodeURIComponent(cloudName)}/resources/search`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      expression: 'public_id:stories/*',
      max_results: 100,
    }),
  });
  if (!response.ok) throw new Error(`Cloudinary search failed (${response.status})`);
  const payload = await response.json();
  return (payload.resources ?? []).map((resource) => ({
    providerAssetId: resource.asset_id,
    providerPublicId: resource.public_id,
    resourceType: resource.resource_type,
    deliveryType: resource.type ?? 'upload',
    version: resource.version,
    originalFilename: resource.original_filename ?? basename(resource.public_id),
    format: resource.format,
    width: resource.width,
    height: resource.height,
    bytes: resource.bytes,
    ...(resource.etag ? { checksum: resource.etag } : {}),
    tags: Array.isArray(resource.tags) ? resource.tags : [],
  }));
}

function validateAssets(stories, assets) {
  const byPublicId = new Map(assets.map((asset) => [asset.providerPublicId, asset]));
  const missing = Array.from(requiredPublicIds(stories)).filter((id) => !byPublicId.has(id));
  if (missing.length) throw new Error(`Cloudinary assets not found: ${missing.join(', ')}`);
  return byPublicId;
}

function buildJourney(story, mediaIdByPublicId, now) {
  const meta = storyMetadata[story.slug];
  const chapters = story.steps.map((step) => {
    const publicId = legacyStoryAliases[step.media] ?? step.media;
    const mediaAssetId = mediaIdByPublicId.get(publicId);
    if (!mediaAssetId) throw new Error(`${story.slug}: media was not registered: ${publicId}`);
    return {
      id: new ObjectId().toHexString(),
      body: step.body,
      media: [{ mediaAssetId }],
    };
  });
  const firstImageStep = story.steps.find((step) => step.kind === 'image');
  if (!firstImageStep) throw new Error(`${story.slug}: an image is required for its draft cover`);
  const coverMediaId = mediaIdByPublicId.get(
    legacyStoryAliases[firstImageStep.media] ?? firstImageStep.media,
  );

  return {
    _id: new ObjectId(),
    schemaVersion: 1,
    slug: story.slug,
    title: story.title,
    status: 'draft',
    draftDocument: {
      schemaVersion: 2,
      template: 'held-places-v1',
      chapters,
    },
    cover: {
      mediaAssetId: coverMediaId,
      role: 'cover',
      layout: { desktop: 'full', mobile: 'full' },
    },
    ...(meta.experiencedAt ? { experiencedAt: meta.experiencedAt } : {}),
    locations: meta.locations,
    editVersion: 0,
    createdAt: now,
    updatedAt: now,
  };
}

function importedMediaDocument(asset, now) {
  return {
    _id: new ObjectId().toHexString(),
    schemaVersion: 1,
    provider: 'cloudinary',
    providerAssetId: asset.providerAssetId,
    providerPublicId: asset.providerPublicId,
    resourceType: asset.resourceType,
    deliveryType: asset.deliveryType,
    ...(Number.isInteger(asset.version) ? { version: asset.version } : {}),
    originalFilename: asset.originalFilename,
    format: asset.format,
    width: asset.width,
    height: asset.height,
    bytes: asset.bytes,
    ...(asset.checksum ? { checksum: asset.checksum } : {}),
    tags: Array.from(new Set([...asset.tags, 'legacy-story'])),
    status: 'ready',
    createdAt: now,
    updatedAt: now,
  };
}

async function applyMigration({ client, stories, assetsByPublicId }) {
  const database = client.db();
  const journeys = database.collection('journeys');
  const mediaAssets = database.collection('media_assets');
  const now = new Date();
  const requiredAssets = Array.from(requiredPublicIds(stories), (publicId) => assetsByPublicId.get(publicId));

  await Promise.all([
    journeys.createIndex(
      { slug: 1 },
      {
        name: 'unique_active_journey_slug',
        unique: true,
        partialFilterExpression: {
          status: { $in: ['draft', 'preview', 'published'] },
        },
      },
    ),
    mediaAssets.createIndex(
      { provider: 1, providerAssetId: 1 },
      { name: 'unique_provider_asset', unique: true },
    ),
  ]);

  const session = client.startSession();
  try {
    await session.withTransaction(async () => {
      const existingJourneys = await journeys.find(
        { slug: { $in: stories.map(({ slug }) => slug) } },
        { session, projection: { slug: 1 } },
      ).toArray();
      if (existingJourneys.length) {
        throw new Error(`Journeys already exist for: ${existingJourneys.map(({ slug }) => slug).join(', ')}`);
      }

      const existingMedia = await mediaAssets.find(
        { provider: 'cloudinary', providerAssetId: { $in: requiredAssets.map(({ providerAssetId }) => providerAssetId) } },
        { session, projection: { _id: 1, providerAssetId: 1, providerPublicId: 1 } },
      ).toArray();
      const mediaIdByPublicId = new Map(existingMedia.map(({ _id, providerPublicId }) => [providerPublicId, _id]));
      const newAssets = requiredAssets.filter(({ providerPublicId }) => !mediaIdByPublicId.has(providerPublicId));
      const importedMedia = newAssets.map((asset) => importedMediaDocument(asset, now));
      for (const media of importedMedia) mediaIdByPublicId.set(media.providerPublicId, media._id);
      if (importedMedia.length) await mediaAssets.insertMany(importedMedia, { session });

      const documents = stories.map((story) => buildJourney(story, mediaIdByPublicId, now));
      await journeys.insertMany(documents, { session });
    });
  } finally {
    await session.endSession();
  }
}

async function main() {
  dotenv.config({ path: resolve(root, '.env.local'), quiet: true });
  const apply = process.argv.includes('--apply');
  const cloudName = requiredEnvironment('CLOUDINARY_CLOUD_NAME');
  const apiKey = requiredEnvironment('CLOUDINARY_API_KEY');
  const apiSecret = requiredEnvironment('CLOUDINARY_API_SECRET');
  const mongoUri = requiredEnvironment('MONGODB_URI');
  const stories = await readLegacyStories();
  const assetsByPublicId = validateAssets(
    stories,
    await listCloudinaryStoryAssets({ cloudName, apiKey, apiSecret }),
  );
  const assetCount = requiredPublicIds(stories).size;

  console.log(`Validated ${stories.length} legacy stories and ${assetCount} Cloudinary assets.`);
  for (const story of stories) {
    console.log(`- ${story.slug}: ${story.steps.length} chapters; ${story.title}`);
  }
  console.log('Alias: stories/dfw-okc/inspection-car-ride → stories/dfw-okc/inspetion-car-ride');
  if (!apply) {
    console.log('Dry run only. Re-run with --apply to create unpublished journey drafts.');
    return;
  }

  const client = new MongoClient(mongoUri);
  try {
    await client.connect();
    await applyMigration({ client, stories, assetsByPublicId });
  } finally {
    await client.close();
  }
  console.log('Created three unpublished Held Places journey drafts. No public route was changed.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
