import { NextResponse } from 'next/server';

import { apiError, requireAuthorApi } from '@/lib/http/admin-api';
import { PhotosPageRepository } from '@/lib/photos/repository';
import { serializePhotosPage } from '@/lib/photos/serializers';

export const runtime = 'nodejs';

/**
 * This recovery endpoint deliberately does not create an empty page. A
 * migration must seed the legacy public page before editing begins.
 */
export async function GET() {
  const authorization = await requireAuthorApi();
  if (authorization.response) return authorization.response;

  try {
    const page = await (await PhotosPageRepository.connect()).get();
    if (!page) {
      return apiError(
        'PHOTOS_PAGE_NOT_INITIALIZED',
        'The Photos page has not been initialized yet. Run the Photos migration first.',
        404,
      );
    }
    return NextResponse.json({ page: serializePhotosPage(page) });
  } catch (error) {
    console.error('Unable to load the Photos page draft', error);
    return apiError('PHOTOS_PAGE_READ_FAILED', 'Unable to load the Photos page right now', 503);
  }
}
