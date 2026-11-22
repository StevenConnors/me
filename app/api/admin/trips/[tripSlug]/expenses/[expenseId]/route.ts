import { NextResponse } from 'next/server';

import { requireAuthorApi } from '@/lib/http/admin-api';
import { readJson, tripErrorResponse } from '@/lib/trips/api-errors';
import { TripRepository } from '@/lib/trips/repository';
import { serializeExpense, UpdateExpenseInputSchema } from '@/lib/trips/schemas';

export const runtime = 'nodejs';
type Context = { params: Promise<{ tripSlug: string; expenseId: string }> };

export async function PUT(request: Request, { params }: Context) {
  const authorization = await requireAuthorApi();
  if (authorization.response) return authorization.response;
  const json = await readJson(request);
  if (!json.ok) return json.response;
  try {
    const { tripSlug, expenseId } = await params;
    const expense = await (await TripRepository.connect()).updateExpense(tripSlug, expenseId, UpdateExpenseInputSchema.parse(json.body));
    return NextResponse.json({ expense: serializeExpense(expense) });
  } catch (error) {
    return tripErrorResponse(error, 'update this expense');
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const authorization = await requireAuthorApi();
  if (authorization.response) return authorization.response;
  try {
    const { tripSlug, expenseId } = await params;
    await (await TripRepository.connect()).deleteExpense(tripSlug, expenseId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return tripErrorResponse(error, 'delete this expense');
  }
}
