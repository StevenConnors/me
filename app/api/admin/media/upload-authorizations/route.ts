import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';

import { apiError, requireAuthorApi } from '@/lib/http/admin-api';
import { getCloudinaryMediaProvider } from '@/lib/media/provider';
import { MediaRepository } from '@/lib/media/repository';
import { UploadIntentSchema } from '@/lib/media/providers/MediaProvider';
import { MediaProviderError } from '@/lib/media/providers/CloudinaryProvider';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const authorization = await requireAuthorApi();
  if (authorization.response) return authorization.response;

  try {
    const intent = UploadIntentSchema.parse(await request.json());
    const repository = await MediaRepository.connect();
    const session = await repository.createOrReuseUploadSession(intent);
    const provider = getCloudinaryMediaProvider();
    const authorizationResult = await provider.createUploadAuthorization(intent);
    return NextResponse.json({ uploadSessionId: session._id, authorization: authorizationResult });
  } catch (error) {
    if (error instanceof ZodError) {
      return apiError('INVALID_UPLOAD', 'The selected file is not accepted', 400, error.issues);
    }
    if (error instanceof MediaProviderError) {
      return apiError(error.code, error.message, error.code === 'UPLOAD_TOO_LARGE' ? 400 : 503);
    }
    console.error('Unable to authorize media upload', error);
    return apiError('UPLOAD_AUTHORIZATION_FAILED', 'Unable to prepare this upload right now', 503);
  }
}
