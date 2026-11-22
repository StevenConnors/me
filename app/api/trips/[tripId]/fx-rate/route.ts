import { NextResponse } from 'next/server';
import { z } from 'zod';

import { apiError } from '@/lib/http/admin-api';
import { parseTripIdParam, tripErrorResponse } from '@/lib/trips/api-errors';
import { CurrencyCodeSchema, SETTLEMENT_CURRENCY } from '@/lib/trips/currencies';
import { getYenReferenceRate } from '@/lib/trips/fx';
import { TripRepository } from '@/lib/trips/repository';
import { IsoDateSchema } from '@/lib/trips/schemas';

export const runtime = 'nodejs';
type Context = { params: Promise<{ tripId: string }> };

const QuerySchema = z.object({ currency: CurrencyCodeSchema, date: IsoDateSchema });

/** Preview of the yen rate an expense will be saved with. Scoped to a real trip so it is not an open rate proxy. */
export async function GET(request: Request, { params }: Context) {
  const searchParams = new URL(request.url).searchParams;
  const query = QuerySchema.safeParse({ currency: searchParams.get('currency'), date: searchParams.get('date') });
  if (!query.success) return apiError('FX_QUERY_INVALID', 'Provide a supported currency and a YYYY-MM-DD date', 400);
  const { currency, date } = query.data;
  try {
    await (await TripRepository.connect()).getTrip(parseTripIdParam((await params).tripId));
    if (currency === SETTLEMENT_CURRENCY) return NextResponse.json({ rate: 1, rateDate: date });
    return NextResponse.json(await getYenReferenceRate(currency, date));
  } catch (error) {
    return tripErrorResponse(error, 'look up the exchange rate');
  }
}
