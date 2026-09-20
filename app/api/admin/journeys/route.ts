import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';

import { apiError, requireAuthorApi } from '@/lib/http/admin-api';
import { JourneyRepository } from '@/lib/journeys/repository';
import { serializeJourney } from '@/lib/journeys/serializers';
import { JourneyStatusSchema } from '@/lib/journeys/schemas';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const authorization = await requireAuthorApi();
  if (authorization.response) return authorization.response;

  try {
    const statusValue = request.nextUrl.searchParams.get('status');
    const status = statusValue ? JourneyStatusSchema.parse(statusValue) : undefined;
    const query = request.nextUrl.searchParams.get('q') ?? undefined;
    const limitValue = request.nextUrl.searchParams.get('limit');
    const limit = limitValue ? Number(limitValue) : undefined;
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 100)) {
      return apiError('INVALID_LIMIT', 'limit must be an integer from 1 to 100', 400);
    }

    const repository = await JourneyRepository.connect();
    const journeys = await repository.list({ status, query, limit });
    return NextResponse.json({ journeys: journeys.map(serializeJourney) });
  } catch (error) {
    if (error instanceof ZodError) {
      return apiError('INVALID_QUERY', 'The journey query is invalid', 400, error.issues);
    }
    console.error('Unable to list admin journeys', error);
    return apiError('JOURNEY_LIST_FAILED', 'Unable to load journeys right now', 503);
  }
}

export async function POST(request: NextRequest) {
  const authorization = await requireAuthorApi();
  if (authorization.response) return authorization.response;

  try {
    const repository = await JourneyRepository.connect();
    const journey = await repository.create(await request.json());
    return NextResponse.json({ journey: serializeJourney(journey) }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return apiError('INVALID_JOURNEY', 'The journey draft is invalid', 400, error.issues);
    }
    console.error('Unable to create admin journey', error);
    return apiError('JOURNEY_CREATE_FAILED', 'Unable to create this journey right now', 503);
  }
}
