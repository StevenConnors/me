import { NextRequest, NextResponse } from 'next/server';

import { apiError, requireAuthorApi } from '@/lib/http/admin-api';
import { InvalidAdminMediaCursorError } from '@/lib/media/admin-cursor';
import { MediaRepository } from '@/lib/media/repository';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const authorization = await requireAuthorApi();
  if (authorization.response) return authorization.response;

  try {
    const query = request.nextUrl.searchParams.get('q') ?? undefined;
    const limitParam = request.nextUrl.searchParams.get('limit');
    const limit = limitParam ? Number(limitParam) : undefined;
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 100)) {
      return apiError('INVALID_LIMIT', 'limit must be an integer from 1 to 100', 400);
    }
    const cursor = request.nextUrl.searchParams.get('cursor') ?? undefined;
    const paged = request.nextUrl.searchParams.get('paged') === 'true';
    const resourceTypeValue = request.nextUrl.searchParams.get('resourceType') ?? undefined;
    if (resourceTypeValue && resourceTypeValue !== 'image' && resourceTypeValue !== 'video') {
      return apiError('INVALID_RESOURCE_TYPE', 'resourceType must be image or video', 400);
    }
    if (cursor || resourceTypeValue || paged) {
      const page = await (await MediaRepository.connect()).listPage({
        query,
        limit,
        cursor,
        resourceType: resourceTypeValue as 'image' | 'video' | undefined,
      });
      return NextResponse.json({ media: page.items, nextCursor: page.nextCursor });
    }
    const assets = await (await MediaRepository.connect()).list({ query, limit });
    return NextResponse.json({ media: assets, nextCursor: null });
  } catch (error) {
    if (error instanceof InvalidAdminMediaCursorError) {
      return apiError('INVALID_MEDIA_CURSOR', 'The media cursor is invalid', 400);
    }
    console.error('Unable to list media', error);
    return apiError('MEDIA_LIST_FAILED', 'Unable to load media right now', 503);
  }
}
