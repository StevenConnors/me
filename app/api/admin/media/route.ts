import { NextRequest, NextResponse } from 'next/server';

import { apiError, requireAuthorApi } from '@/lib/http/admin-api';
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
    const assets = await (await MediaRepository.connect()).list({ query, limit });
    return NextResponse.json({ media: assets });
  } catch (error) {
    console.error('Unable to list media', error);
    return apiError('MEDIA_LIST_FAILED', 'Unable to load media right now', 503);
  }
}
