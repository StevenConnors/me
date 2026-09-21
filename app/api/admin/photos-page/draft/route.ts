import { NextRequest, NextResponse } from 'next/server';
import { z, ZodError } from 'zod';

import { apiError, requireAuthorApi } from '@/lib/http/admin-api';
import {
  PhotosPageConflictError,
  PhotosPageNotFoundError,
  PhotosPageRepository,
} from '@/lib/photos/repository';
import { PhotosPageDocumentSchema } from '@/lib/photos/schemas';
import { serializePhotosPage } from '@/lib/photos/serializers';

export const runtime = 'nodejs';

const DraftRequestSchema = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
    document: PhotosPageDocumentSchema,
  })
  .strict();

export async function PATCH(request: NextRequest) {
  const authorization = await requireAuthorApi();
  if (authorization.response) return authorization.response;

  try {
    const { expectedVersion, document } = DraftRequestSchema.parse(await request.json());
    const page = await (await PhotosPageRepository.connect()).updateDraft(expectedVersion, document);
    return NextResponse.json({ page: serializePhotosPage(page) });
  } catch (error) {
    if (error instanceof PhotosPageConflictError) {
      return apiError('PHOTOS_DRAFT_CONFLICT', 'This Photos draft changed in another session', 409, {
        expectedVersion: error.expectedDraftVersion,
        currentVersion: error.currentDraftVersion,
      });
    }
    if (error instanceof PhotosPageNotFoundError) {
      return apiError('PHOTOS_PAGE_NOT_INITIALIZED', error.message, 404);
    }
    if (error instanceof ZodError || error instanceof RangeError) {
      return apiError('INVALID_PHOTOS_DRAFT', 'The Photos draft is invalid', 400,
        error instanceof ZodError ? error.issues : undefined);
    }
    console.error('Unable to save the Photos page draft', error);
    return apiError('PHOTOS_DRAFT_SAVE_FAILED', 'Unable to save the Photos draft right now', 503);
  }
}
