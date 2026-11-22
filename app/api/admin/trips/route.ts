import { NextResponse } from 'next/server';

import { requireAuthorApi } from '@/lib/http/admin-api';
import { readJson, tripErrorResponse } from '@/lib/trips/api-errors';
import { TripRepository } from '@/lib/trips/repository';
import { CreateTripInputSchema, serializeTrip } from '@/lib/trips/schemas';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const authorization = await requireAuthorApi();
  if (authorization.response) return authorization.response;
  const json = await readJson(request);
  if (!json.ok) return json.response;
  try {
    const input = CreateTripInputSchema.parse(json.body);
    const trip = await (await TripRepository.connect()).createTrip(input);
    return NextResponse.json({ trip: serializeTrip(trip) }, { status: 201 });
  } catch (error) {
    return tripErrorResponse(error, 'create this trip');
  }
}
