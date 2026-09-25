import { NextRequest, NextResponse } from 'next/server';
import { z, ZodError } from 'zod';

import { recordPhotoOpen } from '@/lib/analytics/photo-opens';
import { apiError } from '@/lib/http/admin-api';

export const runtime = 'nodejs';

const PhotoOpenRequestSchema = z.object({
  photoId: z.string().trim().min(1).max(128).refine((value) => !/^https?:\/\//i.test(value)),
}).strict();

export async function POST(request: NextRequest) {
  let photoId: string;
  try {
    ({ photoId } = PhotoOpenRequestSchema.parse(await request.json()));
  } catch (error) {
    if (error instanceof ZodError) return apiError('INVALID_PHOTO_ID', 'A valid photo ID is required', 400);
    return apiError('INVALID_REQUEST', 'A valid JSON request is required', 400);
  }

  try {
    await recordPhotoOpen(photoId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('PHOTO_NOT_')) {
      return apiError('PHOTO_NOT_PUBLISHED', 'This photo is not available in the published gallery', 404);
    }
    console.error('Unable to record a photo open');
    return apiError('PHOTO_OPEN_UNAVAILABLE', 'Photo opens are temporarily unavailable', 503);
  }
}
