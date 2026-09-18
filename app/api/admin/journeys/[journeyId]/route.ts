import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';

import { apiError, requireAuthorApi } from '@/lib/http/admin-api';
import {
  InvalidJourneyIdError,
  JourneyConflictError,
  JourneyNotFoundError,
  JourneyRepository,
} from '@/lib/journeys/repository';
import { serializeJourney } from '@/lib/journeys/serializers';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ journeyId: string }> };

function mapJourneyError(error: unknown) {
  if (error instanceof JourneyNotFoundError) {
    return apiError('JOURNEY_NOT_FOUND', 'This journey no longer exists', 404);
  }
  if (error instanceof InvalidJourneyIdError) {
    return apiError('INVALID_JOURNEY_ID', 'The journey ID is invalid', 400);
  }
  if (error instanceof JourneyConflictError) {
    return apiError('JOURNEY_EDIT_CONFLICT', 'This journey changed in another session', 409, {
      expectedEditVersion: error.expectedEditVersion,
      currentEditVersion: error.currentEditVersion,
    });
  }
  if (error instanceof ZodError) {
    return apiError('INVALID_JOURNEY', 'The journey update is invalid', 400, error.issues);
  }
  return null;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const authorization = await requireAuthorApi();
  if (authorization.response) return authorization.response;

  try {
    const { journeyId } = await context.params;
    const repository = await JourneyRepository.connect();
    const journey = await repository.findById(journeyId);
    if (!journey) return apiError('JOURNEY_NOT_FOUND', 'This journey no longer exists', 404);
    return NextResponse.json({ journey: serializeJourney(journey) });
  } catch (error) {
    const mapped = mapJourneyError(error);
    if (mapped) return mapped;
    console.error('Unable to load admin journey', error);
    return apiError('JOURNEY_READ_FAILED', 'Unable to load this journey right now', 503);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const authorization = await requireAuthorApi();
  if (authorization.response) return authorization.response;

  try {
    const body = await request.json();
    const expectedEditVersion = body?.expectedEditVersion;
    if (!Number.isInteger(expectedEditVersion) || expectedEditVersion < 0) {
      return apiError('INVALID_EDIT_VERSION', 'expectedEditVersion must be a non-negative integer', 400);
    }
    const { expectedEditVersion: _discarded, ...patch } = body as Record<string, unknown>;
    const { journeyId } = await context.params;
    const repository = await JourneyRepository.connect();
    const journey = await repository.updateDraft(journeyId, expectedEditVersion, patch);
    return NextResponse.json({ journey: serializeJourney(journey) });
  } catch (error) {
    const mapped = mapJourneyError(error);
    if (mapped) return mapped;
    console.error('Unable to save admin journey', error);
    return apiError('JOURNEY_SAVE_FAILED', 'Unable to save this journey right now', 503);
  }
}
