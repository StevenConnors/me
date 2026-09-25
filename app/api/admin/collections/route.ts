import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';

import { apiError, requireAuthorApi } from '@/lib/http/admin-api';
import { DuplicateMediaCollectionError, MediaCollectionRepository, serializeMediaCollection } from '@/lib/media/collections';

export const runtime = 'nodejs';

export async function GET() {
  const authorization = await requireAuthorApi();
  if (authorization.response) return authorization.response;
  try {
    const collections = await (await MediaCollectionRepository.connect()).list();
    return NextResponse.json({ collections: collections.map(serializeMediaCollection) });
  } catch (error) {
    console.error('Unable to list media collections', error);
    return apiError('COLLECTION_LIST_FAILED', 'Unable to load collections right now', 503);
  }
}

export async function POST(request: NextRequest) {
  const authorization = await requireAuthorApi();
  if (authorization.response) return authorization.response;
  try {
    const collection = await (await MediaCollectionRepository.connect()).create(await request.json());
    return NextResponse.json({ collection: serializeMediaCollection(collection) }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) return apiError('INVALID_COLLECTION', 'The collection details are invalid', 400, error.issues);
    if (error instanceof DuplicateMediaCollectionError) return apiError(error.code, error.message, 409);
    console.error('Unable to create media collection', error);
    return apiError('COLLECTION_CREATE_FAILED', 'Unable to create this collection right now', 503);
  }
}
