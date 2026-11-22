import { NextResponse } from 'next/server';

import { parseTripIdParam, readJson, tripErrorResponse } from '@/lib/trips/api-errors';
import { TripRepository } from '@/lib/trips/repository';
import { serializeExpense, UpdateExpenseInputSchema } from '@/lib/trips/schemas';

export const runtime = 'nodejs';
type Context = { params: Promise<{ tripId: string; expenseId: string }> };

/** Public on purpose: anyone with the trip link can fix or remove an expense. */
export async function PUT(request: Request, { params }: Context) {
  const json = await readJson(request);
  if (!json.ok) return json.response;
  try {
    const { tripId, expenseId } = await params;
    const expense = await (await TripRepository.connect()).updateExpense(parseTripIdParam(tripId), expenseId, UpdateExpenseInputSchema.parse(json.body));
    return NextResponse.json({ expense: serializeExpense(expense) });
  } catch (error) {
    return tripErrorResponse(error, 'update this expense');
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const { tripId, expenseId } = await params;
    await (await TripRepository.connect()).deleteExpense(parseTripIdParam(tripId), expenseId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return tripErrorResponse(error, 'delete this expense');
  }
}
