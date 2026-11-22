import { NextResponse } from 'next/server';

import { parseTripIdParam, readJson, tripErrorResponse } from '@/lib/trips/api-errors';
import { TripRepository } from '@/lib/trips/repository';
import { ExpenseInputSchema, serializeExpense } from '@/lib/trips/schemas';

export const runtime = 'nodejs';
type Context = { params: Promise<{ tripId: string }> };

/** Public on purpose: holding the unguessable trip link is the permission to add expenses. */
export async function POST(request: Request, { params }: Context) {
  const json = await readJson(request);
  if (!json.ok) return json.response;
  try {
    const tripId = parseTripIdParam((await params).tripId);
    const expense = await (await TripRepository.connect()).createExpense(tripId, ExpenseInputSchema.parse(json.body));
    return NextResponse.json({ expense: serializeExpense(expense) }, { status: 201 });
  } catch (error) {
    return tripErrorResponse(error, 'save this expense');
  }
}
