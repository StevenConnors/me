import { NextRequest, NextResponse } from 'next/server';
import { z, ZodError } from 'zod';

import { apiError, requireAuthorApi } from '@/lib/http/admin-api';
import {
  PhotosPageConflictError,
  PhotosPageNotFoundError,
  PhotosPageRepository,
  PhotosPublishValidationError,
} from '@/lib/photos/repository';
import { serializePhotosPage } from '@/lib/photos/serializers';

export const runtime = 'nodejs';

const ExpectedVersionSchema = z.object({ expectedVersion: z.number().int().nonnegative() }).strict();

export async function POST(request: NextRequest) {
  const authorization = await requireAuthorApi();
  if (authorization.response) return authorization.response;

  try {
    const { expectedVersion } = ExpectedVersionSchema.parse(await request.json());
    const page = await (await PhotosPageRepository.connect()).publish(expectedVersion);
    return NextResponse.json({ page: serializePhotosPage(page) });
  } catch (error) {
    if (error instanceof PhotosPageConflictError) {
      return apiError('PHOTOS_DRAFT_CONFLICT', 'This Photos draft changed in another session', 409, {
        expectedVersion: error.expectedDraftVersion,
        currentVersion: error.currentDraftVersion,
      });
    }
    if (error instanceof PhotosPublishValidationError) {
      return apiError('PHOTOS_PUBLISH_INVALID', error.message, 400, error.issues);
    }
    if (error instanceof PhotosPageNotFoundError) {
      return apiError('PHOTOS_PAGE_NOT_INITIALIZED', error.message, 404);
    }
    if (error instanceof ZodError || error instanceof RangeError) {
      return apiError('INVALID_PUBLISH_REQUEST', 'The publish request is invalid', 400,
        error instanceof ZodError ? error.issues : undefined);
    }
    console.error('Unable to publish the Photos page', error);
    return apiError('PHOTOS_PUBLISH_FAILED', 'Unable to publish the Photos page right now', 503);
  }
}
