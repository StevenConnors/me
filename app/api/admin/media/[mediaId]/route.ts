import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';

import { apiError, requireAuthorApi } from '@/lib/http/admin-api';
import { MediaNotFoundError, MediaRepository } from '@/lib/media/repository';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ mediaId: string }> };

function mediaError(error: unknown) {
  if (error instanceof MediaNotFoundError) {
    return apiError('MEDIA_NOT_FOUND', 'This media asset no longer exists', 404);
  }
  if (error instanceof ZodError) {
    return apiError('INVALID_MEDIA', 'The media update is invalid', 400, error.issues);
  }
  return null;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const authorization = await requireAuthorApi();
  if (authorization.response) return authorization.response;

  try {
    const { mediaId } = await context.params;
    const media = await (await MediaRepository.connect()).findById(mediaId);
    if (!media) return apiError('MEDIA_NOT_FOUND', 'This media asset no longer exists', 404);
    return NextResponse.json({ media });
  } catch (error) {
    const mapped = mediaError(error);
    if (mapped) return mapped;
    console.error('Unable to load media', error);
    return apiError('MEDIA_READ_FAILED', 'Unable to load this media asset right now', 503);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const authorization = await requireAuthorApi();
  if (authorization.response) return authorization.response;

  try {
    const { mediaId } = await context.params;
    const media = await (await MediaRepository.connect()).updateMetadata(mediaId, await request.json());
    return NextResponse.json({ media });
  } catch (error) {
    const mapped = mediaError(error);
    if (mapped) return mapped;
    console.error('Unable to update media', error);
    return apiError('MEDIA_UPDATE_FAILED', 'Unable to update this media asset right now', 503);
  }
}
