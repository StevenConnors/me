import { NextResponse } from 'next/server';

import { requireAuthorApi } from '@/lib/http/admin-api';
import { readJson, tripErrorResponse } from '@/lib/trips/api-errors';
import { TripRepository } from '@/lib/trips/repository';
import { serializeExpense, serializeTrip, UpdateTripInputSchema } from '@/lib/trips/schemas';

export const runtime = 'nodejs';
type Context = { params: Promise<{ tripSlug: string }> };

export async function GET(_request: Request, { params }: Context) {
  const authorization = await requireAuthorApi();
  if (authorization.response) return authorization.response;
  try {
    const { tripSlug } = await params;
    const repository = await TripRepository.connect();
    const [trip, expenses] = await Promise.all([repository.getTrip(tripSlug), repository.listExpenses(tripSlug)]);
    return NextResponse.json({ trip: serializeTrip(trip), expenses: expenses.map(serializeExpense) });
  } catch (error) {
    return tripErrorResponse(error, 'load this trip');
  }
}

export async function PATCH(request: Request, { params }: Context) {
  const authorization = await requireAuthorApi();
  if (authorization.response) return authorization.response;
  const json = await readJson(request);
  if (!json.ok) return json.response;
  try {
    const { tripSlug } = await params;
    const trip = await (await TripRepository.connect()).updateTrip(tripSlug, UpdateTripInputSchema.parse(json.body));
    return NextResponse.json({ trip: serializeTrip(trip) });
  } catch (error) {
    return tripErrorResponse(error, 'update this trip');
  }
}
