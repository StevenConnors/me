import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';

import { apiError, requireAuthorApi } from '@/lib/http/admin-api';
import { DuplicateMediaCollectionError, MediaCollectionNotFoundError, MediaCollectionRepository, serializeMediaCollection } from '@/lib/media/collections';

export const runtime = 'nodejs';
type Context = { params: Promise<{ collectionId: string }> };

export async function GET(_request: NextRequest, { params }: Context) {
  const authorization = await requireAuthorApi();
  if (authorization.response) return authorization.response;
  try {
    const { collectionId } = await params;
    const collection = await (await MediaCollectionRepository.connect()).findById(collectionId);
    if (!collection) throw new MediaCollectionNotFoundError(collectionId);
    return NextResponse.json({ collection: serializeMediaCollection(collection) });
  } catch (error) {
    if (error instanceof MediaCollectionNotFoundError) return apiError(error.code, error.message, 404);
    console.error('Unable to load media collection', error);
    return apiError('COLLECTION_GET_FAILED', 'Unable to load this collection right now', 503);
  }
}

export async function PATCH(request: NextRequest, { params }: Context) {
  const authorization = await requireAuthorApi();
  if (authorization.response) return authorization.response;
  try {
    const { collectionId } = await params;
    const collection = await (await MediaCollectionRepository.connect()).patch(collectionId, await request.json());
    return NextResponse.json({ collection: serializeMediaCollection(collection) });
  } catch (error) {
    if (error instanceof ZodError) return apiError('INVALID_COLLECTION', 'The collection details are invalid', 400, error.issues);
    if (error instanceof DuplicateMediaCollectionError) return apiError(error.code, error.message, 409);
    if (error instanceof MediaCollectionNotFoundError) return apiError(error.code, error.message, 404);
    console.error('Unable to update media collection', error);
    return apiError('COLLECTION_UPDATE_FAILED', 'Unable to update this collection right now', 503);
  }
}

export async function DELETE(_request: NextRequest, { params }: Context) {
  const authorization = await requireAuthorApi();
  if (authorization.response) return authorization.response;
  try {
    const { collectionId } = await params;
    await (await MediaCollectionRepository.connect()).delete(collectionId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof MediaCollectionNotFoundError) return apiError(error.code, error.message, 404);
    console.error('Unable to delete media collection', error);
    return apiError('COLLECTION_DELETE_FAILED', 'Unable to delete this collection right now', 503);
  }
}
