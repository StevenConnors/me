import { NextRequest, NextResponse } from 'next/server';
import { z, ZodError } from 'zod';

import { apiError, requireAuthorApi } from '@/lib/http/admin-api';
import { getCloudinaryMediaProvider } from '@/lib/media/provider';
import { MediaRepository } from '@/lib/media/repository';
import { MediaIdSchema } from '@/lib/media/schemas';
import { serializePhotosEditorMedia } from '@/lib/photos/editor-media';

export const runtime = 'nodejs';
const MediaIdsSchema = z.array(MediaIdSchema).min(1).max(24);

/** Resolve only the next visible batch; draft ordering remains owned by the client. */
export async function GET(request: NextRequest) {
  const authorization = await requireAuthorApi();
  if (authorization.response) return authorization.response;

  try {
    const ids = MediaIdsSchema.parse(request.nextUrl.searchParams.getAll('id'));
    const assets = await (await MediaRepository.connect()).findByIds(ids);
    return NextResponse.json({ mediaById: serializePhotosEditorMedia(assets, getCloudinaryMediaProvider()) });
  } catch (error) {
    if (error instanceof ZodError) return apiError('INVALID_MEDIA_IDS', 'Choose between 1 and 24 media IDs', 400);
    console.error('Unable to load Photos editor previews', error);
    return apiError('PHOTOS_MEDIA_READ_FAILED', 'Unable to load more photos right now', 503);
  }
}
