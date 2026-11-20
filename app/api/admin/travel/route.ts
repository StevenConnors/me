import { NextResponse } from 'next/server';
import { z } from 'zod';

import { apiError, requireAdminReadApi, requireAuthorApi } from '@/lib/http/admin-api';
import { TravelRepository, TravelVersionConflictError } from '@/lib/travel/repository';
import { InvalidTravelSelectionsError, normalizeTravelSelections, TravelSelectionsSchema } from '@/lib/travel/schema';

export const runtime = 'nodejs';

const UpdateTravelSchema = z.object({
  selections: TravelSelectionsSchema,
  expectedVersion: z.number().int().nonnegative(),
}).strict();

export async function GET() {
  const authorization = await requireAdminReadApi();
  if (authorization.response) return authorization.response;
  try {
    return NextResponse.json(await (await TravelRepository.connect()).get());
  } catch (error) {
    console.error('Unable to load visited travel locations', error);
    return apiError('TRAVEL_READ_FAILED', 'Unable to load visited locations right now', 503);
  }
}

export async function PUT(request: Request) {
  const authorization = await requireAuthorApi();
  if (authorization.response) return authorization.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError('INVALID_JSON', 'Request body must be valid JSON', 400);
  }

  const parsed = UpdateTravelSchema.safeParse(body);
  if (!parsed.success) {
    return apiError('TRAVEL_REQUEST_INVALID', 'Provide all three place lists and a non-negative expectedVersion', 400, parsed.error.flatten());
  }

  let selections;
  try {
    selections = normalizeTravelSelections(parsed.data.selections);
  } catch (error) {
    if (error instanceof InvalidTravelSelectionsError) {
      return apiError('TRAVEL_PLACE_UNKNOWN', 'One or more place codes are not in the travel catalog', 400, error.invalid);
    }
    return apiError('TRAVEL_REQUEST_INVALID', 'Travel selections are invalid', 400);
  }

  try {
    const record = await (await TravelRepository.connect()).update(selections, parsed.data.expectedVersion);
    return NextResponse.json(record);
  } catch (error) {
    if (error instanceof TravelVersionConflictError) {
      return apiError('TRAVEL_VERSION_CONFLICT', 'Visited locations changed in another session. Reload and review the latest selections.', 409, {
        expectedVersion: error.expectedVersion,
        currentVersion: error.currentVersion,
      });
    }
    console.error('Unable to save visited travel locations', error);
    return apiError('TRAVEL_SAVE_FAILED', 'Unable to save visited locations right now', 503);
  }
}
