#!/usr/bin/env node

/**
 * Syncs a Photos.app folder on this Mac into the site's Photos page draft.
 * Each album becomes a section; favorites in it become its photos. New and
 * edited photos are exported as JPEGs capped at 4096px and uploaded to the
 * media library. The draft is never published.
 *
 * Usage:
 *   npm run photos:apple-sync                          # report only
 *   npm run photos:apple-sync -- --apply               # upload and update the draft
 *   npm run photos:apple-sync -- --folder Trips --all  # another folder, every photo
 *
 * Environment (.env.local): PHOTOS_IMPORT_SITE_URL, PHOTOS_IMPORT_TOKEN,
 * optional APPLE_PHOTOS_PYTHON (a Python with osxphotos installed).
 */

import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { loadEnvironment, requiredEnvironment } from './lib/cloudinary-images.mjs';

const EXPORTER = resolve(dirname(fileURLToPath(import.meta.url)), 'apple-photos/export_folder.py');
const MAX_EDGE = 4096;

const sourceKey = ({ sourcePhotoId, sourceVersion }) => `${sourcePhotoId}@${sourceVersion}`;

/**
 * Media already uploaded for each source photo version. The server manifest
 * wins; the local journal covers uploads whose sync never reached the server.
 */
export function knownMedia(manifest, journal) {
  const known = new Map(Object.entries(journal));
  for (const photo of manifest.photos) known.set(sourceKey(photo), photo.mediaAssetId);
  return known;
}

/** Photos to export and upload: new or edited since the last sync, once each. */
export function planUploads(albums, known) {
  const pending = new Map();
  for (const album of albums) {
    for (const photo of album.photos) {
      const key = sourceKey(photo);
      if (!known.has(key) && !pending.has(photo.sourcePhotoId)) pending.set(photo.sourcePhotoId, photo);
    }
  }
  return Array.from(pending.values());
}

export function buildSyncRequest(albums, known) {
  return {
    albums: albums.map((album) => ({
      sourceAlbumId: album.sourceAlbumId,
      title: album.title,
      photos: album.photos
        .filter((photo) => known.has(sourceKey(photo)))
        .map((photo) => ({ ...photo, mediaAssetId: known.get(sourceKey(photo)) })),
    })),
  };
}

function parseArguments(argv) {
  const folderIndex = argv.indexOf('--folder');
  return {
    apply: argv.includes('--apply'),
    includeAll: argv.includes('--all'),
    folder: folderIndex === -1 ? 'Website' : argv[folderIndex + 1],
  };
}

async function runExporter(args) {
  const python = process.env.APPLE_PHOTOS_PYTHON?.trim() || 'python3';
  const { stdout } = await promisify(execFile)(python, [EXPORTER, ...args], { maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(stdout);
}

function createApi(siteUrl, token) {
  return async function api(path, init = {}) {
    const response = await fetch(new URL(path, siteUrl), {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers },
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(`${path}: ${payload?.error?.message ?? response.statusText}`);
      error.code = payload?.error?.code;
      error.details = payload?.error?.details;
      throw error;
    }
    return payload;
  };
}

async function uploadJpeg(api, path) {
  const bytes = await readFile(path);
  const filename = basename(path);
  const idempotencyKey = crypto.randomUUID().replace(/-/g, '');
  const { authorization } = await api('/api/admin/media/upload-authorizations', {
    method: 'POST',
    body: JSON.stringify({ filename, mimeType: 'image/jpeg', bytes: bytes.length, idempotencyKey, resourceType: 'image' }),
  });
  const form = new FormData();
  for (const [key, value] of Object.entries(authorization.parameters)) form.append(key, String(value));
  form.append('file', new Blob([bytes], { type: 'image/jpeg' }), filename);
  const uploaded = await fetch(authorization.uploadUrl, { method: 'POST', body: form });
  const result = await uploaded.json();
  if (!uploaded.ok) throw new Error(`Cloudinary rejected ${filename}: ${result?.error?.message ?? uploaded.statusText}`);
  const { media } = await api('/api/admin/media/finalize', {
    method: 'POST',
    body: JSON.stringify({
      idempotencyKey,
      result: {
        providerAssetId: result.asset_id,
        providerPublicId: result.public_id,
        resourceType: result.resource_type,
        deliveryType: result.type || 'upload',
        version: Number(result.version),
        originalFilename: result.original_filename || filename,
        format: result.format,
        width: result.width,
        height: result.height,
        bytes: result.bytes,
        ...(result.etag ? { checksum: result.etag } : {}),
        tags: Array.isArray(result.tags) ? result.tags : String(result.tags ?? '').split(',').filter(Boolean),
        signature: result.signature,
      },
    }),
  });
  return media._id;
}

const journalPath = () => process.env.APPLE_PHOTOS_SYNC_JOURNAL?.trim() || join(homedir(), '.cache', 'apple-photos-sync', 'uploads.json');

async function readJournal() {
  try {
    return JSON.parse(await readFile(journalPath(), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

async function writeJournal(journal) {
  await mkdir(dirname(journalPath()), { recursive: true });
  await writeFile(journalPath(), JSON.stringify(journal, null, 2));
}

async function main() {
  loadEnvironment();
  const options = parseArguments(process.argv.slice(2));
  const api = createApi(requiredEnvironment('PHOTOS_IMPORT_SITE_URL'), requiredEnvironment('PHOTOS_IMPORT_TOKEN'));

  const [{ albums }, manifest, journal] = await Promise.all([
    runExporter(['list', '--folder', options.folder, ...(options.includeAll ? ['--all'] : [])]),
    api('/api/admin/imports/apple-photos'),
    readJournal(),
  ]);
  const known = knownMedia(manifest, journal);
  const uploads = planUploads(albums, known);
  const photoCount = albums.reduce((total, album) => total + album.photos.length, 0);
  console.log(`"${options.folder}": ${albums.length} albums, ${photoCount} photos, ${uploads.length} to upload`);
  if (!options.apply) {
    console.log('Report only. Re-run with --apply to upload and update the Photos draft.');
    return;
  }

  let failed = 0;
  if (uploads.length) {
    const out = await mkdtemp(join(tmpdir(), 'apple-photos-sync-'));
    try {
      const exported = await runExporter([
        'export', '--out', out, '--max-edge', String(MAX_EDGE),
        ...uploads.flatMap((photo) => ['--uuid', photo.sourcePhotoId]),
      ]);
      for (const { sourcePhotoId, message } of exported.errors) console.error(`Skipped ${sourcePhotoId}: ${message}`);
      failed += exported.errors.length;
      const versions = new Map(uploads.map((photo) => [photo.sourcePhotoId, photo]));
      for (const file of exported.files) {
        try {
          const mediaAssetId = await uploadJpeg(api, file.path);
          const key = sourceKey(versions.get(file.sourcePhotoId));
          known.set(key, mediaAssetId);
          journal[key] = mediaAssetId;
          await writeJournal(journal);
          console.log(`Uploaded ${file.sourcePhotoId} (${Math.round((await stat(file.path)).size / 1024)} KB)`);
        } catch (error) {
          failed += 1;
          console.error(`Upload failed for ${file.sourcePhotoId}: ${error.message}`);
        }
      }
    } finally {
      await rm(out, { recursive: true, force: true });
    }
  }

  try {
    const result = await api('/api/admin/imports/apple-photos', {
      method: 'POST',
      body: JSON.stringify(buildSyncRequest(albums, known)),
    });
    console.log(result.draftChanged
      ? `Photos draft updated: ${result.photosAdded} added, ${result.photosUpdated} replaced, ${result.photosRemoved} removed. Review and publish in /admin/photos.`
      : 'Photos draft already matches the folder.');
    if (result.duplicatePhotoIds.length) console.log(`${result.duplicatePhotoIds.length} photos are in more than one album; each was placed once.`);
  } catch (error) {
    if (error.code === 'APPLE_PHOTOS_MEDIA_UNAVAILABLE') {
      const gone = new Set(error.details?.mediaAssetIds ?? []);
      for (const [key, mediaAssetId] of Object.entries(journal)) if (gone.has(mediaAssetId)) delete journal[key];
      await writeJournal(journal);
      throw new Error(`${gone.size} uploaded photos are no longer in the media library. Run the sync again to re-upload them.`);
    }
    throw error;
  }
  if (failed) {
    console.error(`${failed} photos were not uploaded; run the sync again to retry them.`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
