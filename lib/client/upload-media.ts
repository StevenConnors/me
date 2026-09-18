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
  status: 'ready';
};

function toProviderResult(result: Record<string, unknown>) {
  return {
    providerAssetId: result.asset_id,
    providerPublicId: result.public_id,
    resourceType: result.resource_type,
    deliveryType: result.type,
    version: result.version,
    originalFilename: result.original_filename ?? result.public_id,
    format: result.format,
    width: result.width,
    height: result.height,
    bytes: result.bytes,
    checksum: result.etag,
    tags: result.tags ?? [],
    signature: result.signature,
  };
}

export async function uploadMedia(
  file: File,
  options: {
    intendedJourneyId?: string;
    onPhase?: (phase: MediaUploadPhase) => void;
  } = {},
): Promise<UploadedMedia> {
  const idempotencyKey = crypto.randomUUID().replace(/-/g, '');
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
      resourceType: 'image',
    }),
  });
  const authorizationPayload = await authorizationResponse.json();
  if (!authorizationResponse.ok) {
    throw new Error(authorizationPayload.error?.message ?? 'Upload could not be prepared');
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
    throw new Error(providerPayload.error?.message ?? 'Cloudinary rejected the file');
  }

  options.onPhase?.('finalizing');
  const finalizationResponse = await fetch('/api/admin/media/finalize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idempotencyKey, result: toProviderResult(providerPayload) }),
  });
  const finalizationPayload = await finalizationResponse.json();
  if (!finalizationResponse.ok) {
    throw new Error(finalizationPayload.error?.message ?? 'The upload needs finalizing again');
  }
  return finalizationPayload.media as UploadedMedia;
}
