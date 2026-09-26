import { after, NextRequest, NextResponse } from 'next/server';
import { z, ZodError } from 'zod';

import { apiError, requireAuthorApi } from '@/lib/http/admin-api';
import { getCloudinaryMediaProvider } from '@/lib/media/provider';
import {
  MediaRepository,
  UploadResourceTypeMismatchError,
  UploadSessionNotFoundError,
} from '@/lib/media/repository';
import { MediaProviderError } from '@/lib/media/providers/CloudinaryProvider';
import { ProviderUploadResultSchema, type MediaProvider } from '@/lib/media/providers/MediaProvider';
import { MediaEnrichmentService } from '@/lib/media/enrichment';
import { isE2ETestMode } from '@/lib/e2e/test-mode';

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
    const provider: MediaProvider = getCloudinaryMediaProvider();
    if (!provider.verifyUploadResult(result)) {
      return apiError('INVALID_UPLOAD_SIGNATURE', 'The uploaded asset could not be verified', 400);
    }
    if (!result.tags.includes(`upload-session-${idempotencyKey}`)) {
      return apiError('UPLOAD_SESSION_MISMATCH', 'The uploaded asset does not belong to this editor session', 400);
    }
    const providerAsset = await provider.inspectAsset(result.providerAssetId);
    const media = await (await MediaRepository.connect()).finalizeUpload(idempotencyKey, providerAsset);
    let enrichment: MediaEnrichmentService | null = null;
    try {
      enrichment = await MediaEnrichmentService.connect();
      await enrichment.ensurePending(media._id);
    } catch (error) {
      // Upload finalization is authoritative; enrichment can be retried by backfill.
      console.error('Unable to queue media enrichment', error);
    }
    after(async () => {
      try {
        const worker = enrichment ?? await MediaEnrichmentService.connect();
        if (await worker.isCurrent(media._id)) return;
        const [metadata, imageUrl] = await Promise.all([
          provider.getAssetMetadata?.(providerAsset.providerAssetId) ?? Promise.resolve({}),
          media.resourceType === 'image' && !isE2ETestMode()
            ? Promise.resolve(provider.buildAnalysisImageUrl?.(providerAsset) ?? '')
            : Promise.resolve(''),
        ]);
        await worker.enrich({
          mediaAssetId: media._id,
          providerAsset,
          imageUrl,
          metadata,
          analyzeImage: media.resourceType === 'image',
        });
      } catch (error) {
        console.error('Unable to enrich uploaded media', error);
        try {
          const worker = enrichment ?? await MediaEnrichmentService.connect();
          await worker.markFailed(media._id, error);
        } catch (persistError) {
          console.error('Unable to record media enrichment failure', persistError);
        }
      }
    });
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
