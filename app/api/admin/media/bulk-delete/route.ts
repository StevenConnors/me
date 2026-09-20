import { NextRequest, NextResponse } from 'next/server';
import { z, ZodError } from 'zod';

import { apiError, requireAuthorApi } from '@/lib/http/admin-api';
import { planMediaDeletion, type MediaDeletionPlanItem } from '@/lib/media/bulk-delete-service';
import { deleteMediaAsset, MediaInUseError } from '@/lib/media/delete-service';
import { getCloudinaryMediaProvider } from '@/lib/media/provider';
import { MediaNotFoundError, MediaRepository } from '@/lib/media/repository';
import { JourneyRepository } from '@/lib/journeys/repository';
import { MediaProviderError } from '@/lib/media/providers/CloudinaryProvider';
import { PhotosPageRepository } from '@/lib/photos/repository';

export const runtime = 'nodejs';

const RequestSchema = z.object({ mediaIds: z.array(z.string().trim().min(1)).min(1).max(500) }).strict();
type DeleteResult = MediaDeletionPlanItem & { result: 'deleted' | 'protected' | 'not_found' | 'failed' };

export async function POST(request: NextRequest) {
  const authorization = await requireAuthorApi();
  if (authorization.response) return authorization.response;
  try {
    const { mediaIds } = RequestSchema.parse(await request.json());
    const [mediaRepository, journeyRepository, photosPageRepository] = await Promise.all([
      MediaRepository.connect(), JourneyRepository.connect(), PhotosPageRepository.connect(),
    ]);
    const provider = getCloudinaryMediaProvider();
    const plan = await planMediaDeletion(mediaIds, { mediaRepository, journeyRepository, photosPageRepository });
    const results: DeleteResult[] = [];
    for (const item of plan) {
      if (item.classification === 'not_found') {
        results.push({ ...item, result: 'not_found' });
        continue;
      }
      if (item.classification !== 'ready_to_delete') {
        results.push({ ...item, result: 'protected' });
        continue;
      }
      try {
        await deleteMediaAsset(item.id, { mediaRepository, journeyRepository, photosPageRepository, mediaProvider: provider });
        results.push({ ...item, result: 'deleted' });
      } catch (error) {
        if (error instanceof MediaNotFoundError) results.push({ ...item, result: 'not_found' });
        else if (error instanceof MediaInUseError) results.push({ ...item, result: 'protected' });
        else {
          if (!(error instanceof MediaProviderError)) console.error('Unable to delete media in bulk', error);
          results.push({ ...item, result: 'failed' });
        }
      }
    }
    return NextResponse.json({ results });
  } catch (error) {
    if (error instanceof ZodError) return apiError('INVALID_BULK_DELETE', 'Select between 1 and 500 uploads', 400, error.issues);
    console.error('Unable to delete media in bulk', error);
    return apiError('BULK_DELETE_FAILED', 'Unable to delete these uploads right now', 503);
  }
}
