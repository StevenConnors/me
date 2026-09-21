import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';

import { apiError, requireAuthorApi } from '@/lib/http/admin-api';
import { deleteMediaAsset, MediaInUseError } from '@/lib/media/delete-service';
import { getCloudinaryMediaProvider } from '@/lib/media/provider';
import { MediaNotFoundError, MediaRepository } from '@/lib/media/repository';
import { JourneyRepository } from '@/lib/journeys/repository';
import { PhotosPageRepository } from '@/lib/photos/repository';
import { MediaProviderError } from '@/lib/media/providers/CloudinaryProvider';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ mediaId: string }> };

function mediaError(error: unknown) {
  if (error instanceof MediaNotFoundError) {
    return apiError('MEDIA_NOT_FOUND', 'This media asset no longer exists', 404);
  }
  if (error instanceof MediaInUseError) {
    return apiError('MEDIA_IN_USE', 'This media is still used by published content and cannot be deleted', 409);
  }
  if (error instanceof MediaProviderError) {
    return apiError(error.code, error.message, error.status ?? 503);
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

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const authorization = await requireAuthorApi();
  if (authorization.response) return authorization.response;

  try {
    const { mediaId } = await context.params;
    await deleteMediaAsset(mediaId, {
      mediaRepository: await MediaRepository.connect(),
      journeyRepository: await JourneyRepository.connect(),
      photosPageRepository: await PhotosPageRepository.connect(),
      mediaProvider: getCloudinaryMediaProvider(),
    });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const mapped = mediaError(error);
    if (mapped) return mapped;
    console.error('Unable to delete media', error);
    return apiError('MEDIA_DELETE_FAILED', 'Unable to delete this media asset right now', 503);
  }
}
