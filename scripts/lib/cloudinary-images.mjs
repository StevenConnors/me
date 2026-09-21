import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const cloudinaryApiRoot = 'https://api.cloudinary.com/v1_1';

/** Load local credentials without printing them. */
export function loadEnvironment() {
  dotenv.config({ path: resolve(root, '.env.local'), quiet: true });
}

export function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} must be set in .env.local`);
  return value;
}

export function cloudinaryCredentials() {
  const signatureAlgorithm = process.env.CLOUDINARY_SIGNATURE_ALGORITHM?.trim() || 'sha256';
  if (signatureAlgorithm !== 'sha1' && signatureAlgorithm !== 'sha256') {
    throw new Error('CLOUDINARY_SIGNATURE_ALGORITHM must be sha1 or sha256 when set');
  }

  return {
    cloudName: requiredEnvironment('CLOUDINARY_CLOUD_NAME'),
    apiKey: requiredEnvironment('CLOUDINARY_API_KEY'),
    apiSecret: requiredEnvironment('CLOUDINARY_API_SECRET'),
    signatureAlgorithm,
  };
}

function authorizationHeader({ apiKey, apiSecret }) {
  return `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')}`;
}

function parseDate(value, field) {
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.valueOf())) throw new Error(`Cloudinary returned an invalid ${field}`);
  return parsed;
}

function asNonEmptyString(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Cloudinary returned a resource without ${field}`);
  }
  return value.trim();
}

function positiveInteger(value, field) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Cloudinary returned a resource without a positive ${field}`);
  }
  return value;
}

/**
 * Only fields needed by the maintenance scripts are retained. Cloudinary's
 * `etag` identifies an exact original byte-for-byte duplicate, not merely a
 * visually similar image.
 */
export function normalizeImageResource(resource) {
  if (resource?.resource_type !== 'image' || (resource.type ?? 'upload') !== 'upload') {
    throw new Error('Cloudinary returned a resource that is not an uploaded image');
  }

  return {
    providerAssetId: asNonEmptyString(resource.asset_id, 'asset_id'),
    providerPublicId: asNonEmptyString(resource.public_id, 'public_id'),
    deliveryType: 'upload',
    version: Number.isInteger(resource.version) && resource.version >= 0 ? resource.version : undefined,
    originalFilename: asNonEmptyString(resource.original_filename ?? resource.filename ?? resource.public_id, 'original filename'),
    format: asNonEmptyString(resource.format, 'format'),
    width: positiveInteger(resource.width, 'width'),
    height: positiveInteger(resource.height, 'height'),
    bytes: Number.isInteger(resource.bytes) && resource.bytes >= 0 ? resource.bytes : 0,
    checksum: typeof resource.etag === 'string' && resource.etag.trim() ? resource.etag.trim() : undefined,
    tags: Array.isArray(resource.tags)
      ? Array.from(new Set(resource.tags.filter((tag) => typeof tag === 'string' && tag.trim()).map((tag) => tag.trim())))
      : [],
    createdAt: parseDate(resource.created_at, 'created_at'),
  };
}

/** Fetch every uploaded image, following Cloudinary's opaque search cursor. */
export async function listAllImageUploads(credentials) {
  const assets = [];
  const cursors = new Set();
  let cursor;

  do {
    const response = await fetch(
      `${cloudinaryApiRoot}/${encodeURIComponent(credentials.cloudName)}/resources/search`,
      {
        method: 'POST',
        headers: {
          Authorization: authorizationHeader(credentials),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          expression: 'resource_type:image AND type:upload',
          max_results: 500,
          sort_by: [{ created_at: 'asc' }],
          ...(cursor ? { next_cursor: cursor } : {}),
        }),
      },
    );
    if (!response.ok) throw new Error(`Cloudinary image search failed (${response.status})`);

    const payload = await response.json();
    const resources = Array.isArray(payload.resources) ? payload.resources : [];
    assets.push(...resources.map(normalizeImageResource));
    cursor = typeof payload.next_cursor === 'string' && payload.next_cursor ? payload.next_cursor : undefined;
    if (cursor && cursors.has(cursor)) throw new Error('Cloudinary search returned a repeated cursor');
    if (cursor) cursors.add(cursor);
  } while (cursor);

  return assets;
}

function sign(parameters, apiSecret, algorithm) {
  const serialized = Object.entries(parameters)
    .filter(([, value]) => value !== '' && value !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join('&');
  return createHash(algorithm).update(`${serialized}${apiSecret}`).digest('hex');
}

/** Permanently remove one original and invalidate its delivery URLs. */
export async function destroyImage(credentials, asset) {
  const timestamp = Math.floor(Date.now() / 1_000);
  const parameters = {
    public_id: asset.providerPublicId,
    timestamp,
    type: asset.deliveryType,
    invalidate: true,
  };
  const body = new URLSearchParams({
    ...Object.fromEntries(Object.entries(parameters).map(([key, value]) => [key, String(value)])),
    api_key: credentials.apiKey,
    signature: sign(parameters, credentials.apiSecret, credentials.signatureAlgorithm),
  });
  const response = await fetch(
    `${cloudinaryApiRoot}/${encodeURIComponent(credentials.cloudName)}/image/destroy`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    },
  );
  if (!response.ok) throw new Error(`Cloudinary image deletion failed (${response.status})`);
  const payload = await response.json();
  if (payload.result !== 'ok' && payload.result !== 'not found') {
    throw new Error(`Cloudinary rejected deletion of ${asset.providerPublicId}`);
  }
}

export function captureDateFrom(createdAt) {
  return createdAt.toISOString().slice(0, 10);
}
