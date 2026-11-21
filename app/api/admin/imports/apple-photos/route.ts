import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';

import { apiError, requireImportApi } from '@/lib/http/admin-api';
import { ApplePhotosSyncRequestSchema } from '@/lib/photos/apple-import/schemas';
import {
  ApplePhotosDraftInvalidError,
  ApplePhotosImportService,
  ApplePhotosMediaUnavailableError,
} from '@/lib/photos/apple-import/service';
import { PhotosPageConflictError, PhotosPageNotFoundError } from '@/lib/photos/repository';

export const runtime = 'nodejs';

/** Photos already uploaded by earlier syncs, so the Mac script skips them. */
export async function GET(request: NextRequest) {
  const authorization = requireImportApi(request);
  if (authorization.response) return authorization.response;

  try {
    return NextResponse.json(await (await ApplePhotosImportService.connect()).manifest());
  } catch (error) {
    console.error('Unable to read the Apple Photos import manifest', error);
    return apiError('APPLE_PHOTOS_MANIFEST_FAILED', 'Unable to read the import manifest right now', 503);
  }
}

/** Merge the synced Photos.app folder into the Photos page draft. Never publishes. */
export async function POST(request: NextRequest) {
  const authorization = requireImportApi(request);
  if (authorization.response) return authorization.response;

  try {
    const syncRequest = ApplePhotosSyncRequestSchema.parse(await request.json());
    const result = await (await ApplePhotosImportService.connect()).sync(syncRequest);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return apiError('INVALID_APPLE_PHOTOS_SYNC', 'The synced albums are invalid', 400, error.issues);
    }
    if (error instanceof ApplePhotosMediaUnavailableError) {
      return apiError('APPLE_PHOTOS_MEDIA_UNAVAILABLE', error.message, 400, { mediaAssetIds: error.mediaAssetIds });
    }
    if (error instanceof ApplePhotosDraftInvalidError) {
      return apiError('APPLE_PHOTOS_DRAFT_INVALID', error.message, 400, { issues: error.issues });
    }
    if (error instanceof PhotosPageNotFoundError) {
      return apiError('PHOTOS_PAGE_NOT_INITIALIZED', error.message, 404);
    }
    if (error instanceof PhotosPageConflictError) {
      return apiError('PHOTOS_DRAFT_CONFLICT', 'The Photos draft kept changing during the sync; run it again', 409);
    }
    console.error('Unable to sync Apple Photos albums', error);
    return apiError('APPLE_PHOTOS_SYNC_FAILED', 'Unable to sync albums right now', 503);
  }
}
