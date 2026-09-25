import { NextRequest, NextResponse } from 'next/server';

import { apiError, requireAuthorApi } from '@/lib/http/admin-api';
import { getCloudinaryMediaProvider } from '@/lib/media/provider';
import { MediaRepository } from '@/lib/media/repository';

export const runtime = 'nodejs';

/** Registers one Cloudinary page at a time so a large account stays resumable. */
export async function POST(request: NextRequest) {
  const authorization = await requireAuthorApi();
  if (authorization.response) return authorization.response;

  try {
    const body = await request.json() as { cursor?: unknown };
    if (body.cursor !== undefined && (typeof body.cursor !== 'string' || !body.cursor || body.cursor.length > 2000)) {
      return apiError('INVALID_CURSOR', 'A valid Cloudinary cursor is required', 400);
    }
    const provider = getCloudinaryMediaProvider();
    const repository = await MediaRepository.connect();
    const page = await provider.listAssets(body.cursor as string | undefined, 'video');
    let imported = 0;
    for (const asset of page.assets) {
      if (asset.resourceType !== 'video' || asset.deliveryType !== 'upload') continue;
      if (await repository.importProviderAsset(asset)) imported += 1;
    }
    return NextResponse.json({ imported, examined: page.assets.length, nextCursor: page.nextCursor ?? null });
  } catch (error) {
    console.error('Unable to import Cloudinary videos', error);
    return apiError('VIDEO_IMPORT_FAILED', 'Unable to import Cloudinary videos right now', 503);
  }
}
