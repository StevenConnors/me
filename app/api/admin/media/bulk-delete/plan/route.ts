import { NextRequest, NextResponse } from 'next/server';
import { z, ZodError } from 'zod';

import { apiError, requireAuthorApi } from '@/lib/http/admin-api';
import { planMediaDeletion } from '@/lib/media/bulk-delete-service';
import { MediaRepository } from '@/lib/media/repository';
import { JourneyRepository } from '@/lib/journeys/repository';
import { PhotosPageRepository } from '@/lib/photos/repository';

export const runtime = 'nodejs';

const RequestSchema = z.object({ mediaIds: z.array(z.string().trim().min(1)).min(1).max(500) }).strict();

export async function POST(request: NextRequest) {
  const authorization = await requireAuthorApi();
  if (authorization.response) return authorization.response;
  try {
    const { mediaIds } = RequestSchema.parse(await request.json());
    const [mediaRepository, journeyRepository, photosPageRepository] = await Promise.all([
      MediaRepository.connect(), JourneyRepository.connect(), PhotosPageRepository.connect(),
    ]);
    const plan = await planMediaDeletion(mediaIds, { mediaRepository, journeyRepository, photosPageRepository });
    return NextResponse.json({ plan });
  } catch (error) {
    if (error instanceof ZodError) return apiError('INVALID_BULK_DELETE', 'Select between 1 and 500 uploads', 400, error.issues);
    console.error('Unable to plan media deletion', error);
    return apiError('BULK_DELETE_PLAN_FAILED', 'Unable to check these uploads right now', 503);
  }
}
