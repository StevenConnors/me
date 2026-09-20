export type MediaUploadPhase = 'authorizing' | 'uploading' | 'finalizing';

type CloudinaryAuthorization = {
  uploadUrl: string;
  parameters: Record<string, string | number | boolean>;
};

export type UploadedMedia = {
  _id: string;
  originalFilename: string;
  width: number;
  height: number;
  format: string;
  resourceType: 'image' | 'video';
  status: 'ready';
};

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function normalizeTags(value: unknown): string[] {
  const tags = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];
  return tags.filter((tag): tag is string => typeof tag === 'string').map((tag) => tag.trim()).filter(Boolean);
}

function normalizeVersion(value: unknown): unknown {
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
  return value;
}

function resourceTypeForMimeType(mimeType: string): 'image' | 'video' {
  if (['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(mimeType)) return 'image';
  if (['video/mp4', 'video/quicktime', 'video/webm'].includes(mimeType)) return 'video';
  throw new Error('Choose a JPEG, PNG, WebP, HEIC, HEIF, MP4, MOV, or WebM file');
}

function toProviderResult(result: Record<string, unknown>) {
  const checksum = nonEmptyString(result.etag);
  return {
    providerAssetId: result.asset_id,
    providerPublicId: result.public_id,
    resourceType: result.resource_type,
    deliveryType: nonEmptyString(result.type) ?? 'upload',
    version: normalizeVersion(result.version),
    originalFilename: nonEmptyString(result.original_filename) ?? nonEmptyString(result.filename) ?? result.public_id,
    format: result.format,
    width: result.width,
    height: result.height,
    bytes: result.bytes,
    ...(checksum ? { checksum } : {}),
    tags: normalizeTags(result.tags),
    signature: result.signature,
  };
}

function responseErrorMessage(payload: unknown, fallback: string): string {
  const error = (payload as { error?: { message?: unknown; details?: unknown } } | null)?.error;
  const message = nonEmptyString(error?.message) ?? fallback;
  if (!Array.isArray(error?.details)) return message;

  const details = error.details
    .slice(0, 3)
    .map((detail) => {
      if (!detail || typeof detail !== 'object') return undefined;
      const issue = detail as { path?: unknown; message?: unknown };
      const path = Array.isArray(issue.path) ? issue.path.filter((part): part is string | number => typeof part === 'string' || typeof part === 'number').join('.') : '';
      const reason = nonEmptyString(issue.message);
      return path && reason ? `${path}: ${reason}` : reason;
    })
    .filter((detail): detail is string => Boolean(detail));
  return details.length ? `${message}: ${details.join('; ')}` : message;
}

export async function uploadMedia(
  file: File,
  options: {
    intendedJourneyId?: string;
    onPhase?: (phase: MediaUploadPhase) => void;
  } = {},
): Promise<UploadedMedia> {
  const idempotencyKey = crypto.randomUUID().replace(/-/g, '');
  const resourceType = resourceTypeForMimeType(file.type);
  options.onPhase?.('authorizing');
  const authorizationResponse = await fetch('/api/admin/media/upload-authorizations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: file.name,
      mimeType: file.type,
      bytes: file.size,
      idempotencyKey,
      intendedJourneyId: options.intendedJourneyId,
      resourceType,
    }),
  });
  const authorizationPayload = await authorizationResponse.json();
  if (!authorizationResponse.ok) {
    throw new Error(responseErrorMessage(authorizationPayload, 'Upload could not be prepared'));
  }
  const authorization = authorizationPayload.authorization as CloudinaryAuthorization;

  options.onPhase?.('uploading');
  const formData = new FormData();
  for (const [key, value] of Object.entries(authorization.parameters)) {
    formData.append(key, String(value));
  }
  formData.append('file', file);
  const providerResponse = await fetch(authorization.uploadUrl, { method: 'POST', body: formData });
  const providerPayload = await providerResponse.json();
  if (!providerResponse.ok) {
    throw new Error(responseErrorMessage(providerPayload, 'Cloudinary rejected the file'));
  }

  options.onPhase?.('finalizing');
  const finalizationResponse = await fetch('/api/admin/media/finalize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idempotencyKey, result: toProviderResult(providerPayload) }),
  });
  const finalizationPayload = await finalizationResponse.json();
  if (!finalizationResponse.ok) {
    throw new Error(responseErrorMessage(finalizationPayload, 'The upload needs finalizing again'));
  }
  return finalizationPayload.media as UploadedMedia;
}
