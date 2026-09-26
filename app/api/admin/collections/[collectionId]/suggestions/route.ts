import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';

import { apiError, requireAuthorApi } from '@/lib/http/admin-api';
import { MediaCollectionNotFoundError } from '@/lib/media/collections';
import { DismissSuggestionsSchema, MediaCollectionSuggestionsRepository } from '@/lib/media/suggestions';

export const runtime = 'nodejs';
type Context = { params: Promise<{ collectionId: string }> };

export async function GET(_request: NextRequest, { params }: Context) {
  const authorization = await requireAuthorApi();
  if (authorization.response) return authorization.response;
  try {
    const { collectionId } = await params;
    const suggestions = await (await MediaCollectionSuggestionsRepository.connect()).list(collectionId);
    return NextResponse.json({ suggestions });
  } catch (error) {
    if (error instanceof MediaCollectionNotFoundError) return apiError(error.code, error.message, 404);
    console.error('Unable to find collection suggestions', error);
    return apiError('COLLECTION_SUGGESTIONS_FAILED', 'Unable to load suggestions right now', 503);
  }
}

export async function POST(request: NextRequest, { params }: Context) {
  const authorization = await requireAuthorApi();
  if (authorization.response) return authorization.response;
  try {
    const [{ collectionId }, { dismissedMediaAssetIds }] = await Promise.all([params, request.json().then((body) => DismissSuggestionsSchema.parse(body))]);
    await (await MediaCollectionSuggestionsRepository.connect()).dismiss(collectionId, dismissedMediaAssetIds);
    return NextResponse.json({ dismissedMediaAssetIds });
  } catch (error) {
    if (error instanceof ZodError) return apiError('INVALID_SUGGESTION_DISMISSAL', 'The dismissed media list is invalid', 400, error.issues);
    if (error instanceof MediaCollectionNotFoundError) return apiError(error.code, error.message, 404);
    console.error('Unable to dismiss collection suggestions', error);
    return apiError('COLLECTION_SUGGESTIONS_DISMISS_FAILED', 'Unable to dismiss these suggestions right now', 503);
  }
}
