import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';

import { apiError, requireAuthorApi } from '@/lib/http/admin-api';
import { PublicationValidationError, publishJourney } from '@/lib/journeys/publish-service';
import {
  InvalidJourneyIdError,
  JourneyConflictError,
  JourneyNotFoundError,
  JourneyRepository,
} from '@/lib/journeys/repository';
import { serializeJourney, serializeJourneyRevision } from '@/lib/journeys/serializers';
import { MediaRepository } from '@/lib/media/repository';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ journeyId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const authorization = await requireAuthorApi();
  if (authorization.response) return authorization.response;

  try {
    const body = await request.json();
    if (!Number.isInteger(body?.expectedEditVersion) || body.expectedEditVersion < 0) {
      return apiError('INVALID_EDIT_VERSION', 'expectedEditVersion must be a non-negative integer', 400);
    }
    if (body.summaryOmissionConfirmed !== undefined && typeof body.summaryOmissionConfirmed !== 'boolean') {
      return apiError('INVALID_PUBLICATION_INPUT', 'summaryOmissionConfirmed must be a boolean', 400);
    }

    const { journeyId } = await context.params;
    const result = await publishJourney(
      await JourneyRepository.connect(),
      await MediaRepository.connect(),
      {
        journeyId,
        expectedEditVersion: body.expectedEditVersion,
        summaryOmissionConfirmed: body.summaryOmissionConfirmed,
      },
    );
    return NextResponse.json({
      journey: serializeJourney(result.journey),
      revision: serializeJourneyRevision(result.revision),
    });
  } catch (error) {
    if (error instanceof PublicationValidationError) {
      return apiError('JOURNEY_NOT_PUBLISHABLE', 'Resolve the publication checks before publishing', 422, error.issues);
    }
    if (error instanceof JourneyConflictError) {
      return apiError('JOURNEY_EDIT_CONFLICT', 'This journey changed in another session', 409, {
        expectedEditVersion: error.expectedEditVersion,
        currentEditVersion: error.currentEditVersion,
      });
    }
    if (error instanceof JourneyNotFoundError) {
      return apiError('JOURNEY_NOT_FOUND', 'This journey no longer exists', 404);
    }
    if (error instanceof InvalidJourneyIdError || error instanceof ZodError) {
      return apiError('INVALID_PUBLICATION_INPUT', 'The publication request is invalid', 400);
    }
    console.error('Unable to publish journey', error);
    return apiError('JOURNEY_PUBLISH_FAILED', 'Unable to publish this journey right now', 503);
  }
}
