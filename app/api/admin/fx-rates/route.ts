import { NextResponse } from 'next/server';
import { z } from 'zod';

import { apiError, requireAuthorApi } from '@/lib/http/admin-api';
import { tripErrorResponse } from '@/lib/trips/api-errors';
import { CurrencyCodeSchema, SETTLEMENT_CURRENCY } from '@/lib/trips/currencies';
import { getYenReferenceRate } from '@/lib/trips/fx';
import { IsoDateSchema } from '@/lib/trips/schemas';

export const runtime = 'nodejs';

const QuerySchema = z.object({ currency: CurrencyCodeSchema, date: IsoDateSchema });

/** Preview of the yen rate the expense will be saved with. */
export async function GET(request: Request) {
  const authorization = await requireAuthorApi();
  if (authorization.response) return authorization.response;
  const searchParams = new URL(request.url).searchParams;
  const query = QuerySchema.safeParse({ currency: searchParams.get('currency'), date: searchParams.get('date') });
  if (!query.success) return apiError('FX_QUERY_INVALID', 'Provide a supported currency and a YYYY-MM-DD date', 400);
  const { currency, date } = query.data;
  if (currency === SETTLEMENT_CURRENCY) return NextResponse.json({ rate: 1, rateDate: date });
  try {
    return NextResponse.json(await getYenReferenceRate(currency, date));
  } catch (error) {
    return tripErrorResponse(error, 'look up the exchange rate');
  }
}
