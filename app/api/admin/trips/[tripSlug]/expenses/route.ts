import { NextResponse } from 'next/server';

import { requireAuthorApi } from '@/lib/http/admin-api';
import { readJson, tripErrorResponse } from '@/lib/trips/api-errors';
import { TripRepository } from '@/lib/trips/repository';
import { ExpenseInputSchema, serializeExpense } from '@/lib/trips/schemas';

export const runtime = 'nodejs';
type Context = { params: Promise<{ tripSlug: string }> };

export async function POST(request: Request, { params }: Context) {
  const authorization = await requireAuthorApi();
  if (authorization.response) return authorization.response;
  const json = await readJson(request);
  if (!json.ok) return json.response;
  try {
    const { tripSlug } = await params;
    const expense = await (await TripRepository.connect()).createExpense(tripSlug, ExpenseInputSchema.parse(json.body));
    return NextResponse.json({ expense: serializeExpense(expense) }, { status: 201 });
  } catch (error) {
    return tripErrorResponse(error, 'save this expense');
  }
}
