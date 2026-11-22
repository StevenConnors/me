import { NextResponse } from 'next/server';

import { requireAuthorApi } from '@/lib/http/admin-api';
import { parseTripIdParam, readJson, tripErrorResponse } from '@/lib/trips/api-errors';
import { TripRepository } from '@/lib/trips/repository';
import { serializeTrip, UpdateTripInputSchema } from '@/lib/trips/schemas';

export const runtime = 'nodejs';
type Context = { params: Promise<{ tripId: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const authorization = await requireAuthorApi();
  if (authorization.response) return authorization.response;
  const json = await readJson(request);
  if (!json.ok) return json.response;
  try {
    const tripId = parseTripIdParam((await params).tripId);
    const trip = await (await TripRepository.connect()).updateTrip(tripId, UpdateTripInputSchema.parse(json.body));
    return NextResponse.json({ trip: serializeTrip(trip) });
  } catch (error) {
    return tripErrorResponse(error, 'update this trip');
  }
}
