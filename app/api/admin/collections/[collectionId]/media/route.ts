import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';

import { apiError, requireAuthorApi } from '@/lib/http/admin-api';
import {
  CollectionMediaNotFoundError,
  CollectionMediaIdsSchema,
  MediaCollectionNotFoundError,
  MediaCollectionRepository,
  serializeMediaCollection,
} from '@/lib/media/collections';

export const runtime = 'nodejs';
type Context = { params: Promise<{ collectionId: string }> };

async function parseBody(request: NextRequest) {
  return CollectionMediaIdsSchema.parse(await request.json());
}

export async function POST(request: NextRequest, { params }: Context) {
  const authorization = await requireAuthorApi();
  if (authorization.response) return authorization.response;
  try {
    const [{ collectionId }, { mediaAssetIds }] = await Promise.all([params, parseBody(request)]);
    const collection = await (await MediaCollectionRepository.connect()).addMedia(collectionId, mediaAssetIds);
    return NextResponse.json({ collection: serializeMediaCollection(collection) });
  } catch (error) {
    if (error instanceof ZodError) return apiError('INVALID_COLLECTION_MEDIA', 'The media asset list is invalid', 400, error.issues);
    if (error instanceof MediaCollectionNotFoundError) return apiError(error.code, error.message, 404);
    if (error instanceof CollectionMediaNotFoundError) return apiError(error.code, error.message, 404, error.mediaAssetIds);
    console.error('Unable to add media to collection', error);
    return apiError('COLLECTION_MEDIA_ADD_FAILED', 'Unable to add these assets right now', 503);
  }
}

export async function DELETE(request: NextRequest, { params }: Context) {
  const authorization = await requireAuthorApi();
  if (authorization.response) return authorization.response;
  try {
    const [{ collectionId }, { mediaAssetIds }] = await Promise.all([params, parseBody(request)]);
    const collection = await (await MediaCollectionRepository.connect()).removeMedia(collectionId, mediaAssetIds);
    return NextResponse.json({ collection: serializeMediaCollection(collection) });
  } catch (error) {
    if (error instanceof ZodError) return apiError('INVALID_COLLECTION_MEDIA', 'The media asset list is invalid', 400, error.issues);
    if (error instanceof MediaCollectionNotFoundError) return apiError(error.code, error.message, 404);
    console.error('Unable to remove media from collection', error);
    return apiError('COLLECTION_MEDIA_REMOVE_FAILED', 'Unable to remove these assets right now', 503);
  }
}

export async function PATCH(request: NextRequest, { params }: Context) {
  const authorization = await requireAuthorApi();
  if (authorization.response) return authorization.response;
  try {
    const [{ collectionId }, { mediaAssetIds }] = await Promise.all([params, parseBody(request)]);
    const collection = await (await MediaCollectionRepository.connect()).reorderMedia(collectionId, mediaAssetIds);
    return NextResponse.json({ collection: serializeMediaCollection(collection) });
  } catch (error) {
    if (error instanceof ZodError) return apiError('INVALID_COLLECTION_MEDIA', 'The media asset list is invalid', 400, error.issues);
    if (error instanceof MediaCollectionNotFoundError) return apiError(error.code, error.message, 404);
    if (error instanceof CollectionMediaNotFoundError) return apiError(error.code, error.message, 404, error.mediaAssetIds);
    if (error instanceof Error && error.message.startsWith('Reordering')) return apiError('INVALID_COLLECTION_ORDER', error.message, 400);
    console.error('Unable to order collection media', error);
    return apiError('COLLECTION_MEDIA_ORDER_FAILED', 'Unable to reorder these assets right now', 503);
  }
}
