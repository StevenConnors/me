import { NextResponse } from 'next/server';

import { apiError, requireAuthorApi } from '@/lib/http/admin-api';
import { getCloudinaryMediaProvider } from '@/lib/media/provider';
import { MediaRepository } from '@/lib/media/repository';
import { serializePhotosEditorMedia } from '@/lib/photos/editor-media';
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
    const [photosRepository, mediaRepository, provider] = await Promise.all([
      PhotosPageRepository.connect(),
      MediaRepository.connect(),
      Promise.resolve(getCloudinaryMediaProvider()),
    ]);
    const page = await photosRepository.get();
    if (!page) {
      return apiError(
        'PHOTOS_PAGE_NOT_INITIALIZED',
        'The Photos page has not been initialized yet. Run the Photos migration first.',
        404,
      );
    }
    // Keep draft identities complete, but fetch preview assets only as they enter the canvas.
    const mediaIds = page.draftDocument.blocks.flatMap((block) => block.type === 'media' ? [block.mediaAssetId] : []).slice(0, 24);
    const mediaById = serializePhotosEditorMedia(await mediaRepository.findByIds(mediaIds), provider);
    return NextResponse.json({ page: serializePhotosPage(page), mediaById });
  } catch (error) {
    console.error('Unable to load the Photos page draft', error);
    return apiError('PHOTOS_PAGE_READ_FAILED', 'Unable to load the Photos page right now', 503);
  }
}
