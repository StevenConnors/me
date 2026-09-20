import { NextRequest, NextResponse } from 'next/server';
import { z, ZodError } from 'zod';

import { apiError, requireAuthorApi } from '@/lib/http/admin-api';
import { getCloudinaryMediaProvider } from '@/lib/media/provider';
import {
  MediaRepository,
  UploadResourceTypeMismatchError,
  UploadSessionNotFoundError,
} from '@/lib/media/repository';
import { MediaProviderError } from '@/lib/media/providers/CloudinaryProvider';
import { ProviderUploadResultSchema } from '@/lib/media/providers/MediaProvider';

export const runtime = 'nodejs';

const FinalizeRequestSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(128),
  result: ProviderUploadResultSchema,
}).strict();

export async function POST(request: NextRequest) {
  const authorization = await requireAuthorApi();
  if (authorization.response) return authorization.response;

  try {
    const { idempotencyKey, result } = FinalizeRequestSchema.parse(await request.json());
    const provider = getCloudinaryMediaProvider();
    if (!provider.verifyUploadResult(result)) {
      return apiError('INVALID_UPLOAD_SIGNATURE', 'The uploaded asset could not be verified', 400);
    }
    if (!result.tags.includes(`upload-session-${idempotencyKey}`)) {
      return apiError('UPLOAD_SESSION_MISMATCH', 'The uploaded asset does not belong to this editor session', 400);
    }
    const providerAsset = await provider.inspectAsset(result.providerAssetId);
    const media = await (await MediaRepository.connect()).finalizeUpload(idempotencyKey, providerAsset);
    return NextResponse.json({ media });
  } catch (error) {
    if (error instanceof ZodError) {
      return apiError('INVALID_UPLOAD_RESULT', 'The upload result is invalid', 400, error.issues);
    }
    if (error instanceof UploadSessionNotFoundError) {
      return apiError('UPLOAD_SESSION_NOT_FOUND', 'This upload session has expired; start the upload again', 404);
    }
    if (error instanceof UploadResourceTypeMismatchError) {
      return apiError(error.code, 'The uploaded file type does not match its upload session', 400);
    }
    if (error instanceof MediaProviderError) {
      return apiError(error.code, error.message, 502);
    }
    console.error('Unable to finalize media upload', error);
    return apiError('UPLOAD_FINALIZATION_FAILED', 'The file uploaded but could not be finalized; retry this step', 503);
  }
}
