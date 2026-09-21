import { NextRequest, NextResponse } from 'next/server';

import { apiError } from '@/lib/http/admin-api';
import { loadPublicPhotosPage } from '@/lib/photos/gallery';
import { InvalidGalleryCursorError, StaleGalleryCursorError } from '@/lib/photos/cursor';
import { getCloudinaryMediaProvider } from '@/lib/media/provider';
import { MediaRepository } from '@/lib/media/repository';
import { PhotosPageRepository } from '@/lib/photos/repository';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const limitValue = request.nextUrl.searchParams.get('limit');
  const limit = limitValue ? Number(limitValue) : 24;
  if (!Number.isInteger(limit) || limit < 1 || limit > 48) {
    return apiError('INVALID_LIMIT', 'limit must be an integer from 1 to 48', 400);
  }
  try {
    const [photosPageRepository, mediaRepository, provider] = await Promise.all([
      PhotosPageRepository.connect(), MediaRepository.connect(), Promise.resolve(getCloudinaryMediaProvider()),
    ]);
    const page = await loadPublicPhotosPage(
      await photosPageRepository.get(),
      mediaRepository,
      provider,
      { limit, cursor: request.nextUrl.searchParams.get('cursor') ?? undefined },
    );
    if (page.unavailable.length) console.error('Photos API skipped unavailable media', page.unavailable);
    return NextResponse.json({ items: page.items, nextCursor: page.nextCursor });
  } catch (error) {
    if (error instanceof InvalidGalleryCursorError) {
      return apiError('INVALID_GALLERY_CURSOR', 'The gallery cursor is invalid', 400);
    }
    if (error instanceof StaleGalleryCursorError) {
      return apiError('GALLERY_CURSOR_STALE', 'This gallery page has changed. Reload Photos to continue.', 409);
    }
    console.error('Unable to load Photos page', error);
    return apiError('PHOTOS_UNAVAILABLE', 'Photos are temporarily unavailable', 503);
  }
}
