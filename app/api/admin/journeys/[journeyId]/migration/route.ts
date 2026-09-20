import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';

import { apiError, requireAuthorApi } from '@/lib/http/admin-api';
import { startHeldPlacesMigration } from '@/lib/journeys/migration';
import {
  InvalidJourneyIdError,
  JourneyConflictError,
  JourneyNotFoundError,
  JourneyRepository,
} from '@/lib/journeys/repository';
import { serializeJourney } from '@/lib/journeys/serializers';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ journeyId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const authorization = await requireAuthorApi();
  if (authorization.response) return authorization.response;

  try {
    const body = await request.json();
    if (!Number.isInteger(body?.expectedEditVersion) || body.expectedEditVersion < 0) {
      return apiError(
        'INVALID_EDIT_VERSION',
        'expectedEditVersion must be a non-negative integer',
        400,
      );
    }
    const { journeyId } = await context.params;
    const result = await startHeldPlacesMigration(
      await JourneyRepository.connect(),
      { journeyId, expectedEditVersion: body.expectedEditVersion },
    );
    return NextResponse.json({
      journey: serializeJourney(result.journey),
      migrated: result.migrated,
    });
  } catch (error) {
    if (error instanceof JourneyConflictError) {
      return apiError(
        'JOURNEY_EDIT_CONFLICT',
        'This journey changed in another session',
        409,
      );
    }
    if (error instanceof JourneyNotFoundError) {
      return apiError('JOURNEY_NOT_FOUND', 'This journey no longer exists', 404);
    }
    if (error instanceof InvalidJourneyIdError || error instanceof ZodError) {
      return apiError('INVALID_MIGRATION_INPUT', 'The migration request is invalid', 400);
    }
    console.error('Unable to start Held Places migration', error);
    return apiError(
      'JOURNEY_MIGRATION_FAILED',
      'Unable to start this migration right now',
      503,
    );
  }
}
