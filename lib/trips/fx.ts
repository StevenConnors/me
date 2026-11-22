import 'server-only';

import { z } from 'zod';

import { isE2ETestMode } from '@/lib/e2e/test-mode';
import { SETTLEMENT_CURRENCY, type CurrencyCode } from '@/lib/trips/currencies';

export type ReferenceRate = { rate: number; rateDate: string };

export class YenRateUnavailableError extends Error {
  readonly code = 'FX_RATE_UNAVAILABLE';

  constructor(readonly currency: CurrencyCode, readonly date: string) {
    super(`No reference ${currency}→JPY rate is available for ${date}. Enter the rate yourself.`);
    this.name = 'YenRateUnavailableError';
  }
}

const FrankfurterResponseSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rates: z.object({ JPY: z.number().positive() }),
});

/** Fixed rates so browser tests never depend on the network. */
const E2E_RATES: Partial<Record<CurrencyCode, number>> = { INR: 1.8, USD: 150, EUR: 160, THB: 4.25 };

const isoDay = (value: Date) => value.toISOString().slice(0, 10);
const LATEST_TIMEZONE_OFFSET_MS = 14 * 60 * 60 * 1000;

/**
 * "Today" in India can still be yesterday in UTC, so a date up to the latest
 * time zone's today is valid and is looked up as the newest UTC day.
 */
function lookupDate(date: string, now: Date): string | null {
  if (date > isoDay(new Date(now.getTime() + LATEST_TIMEZONE_OFFSET_MS))) return null;
  const utcToday = isoDay(now);
  return date > utcToday ? utcToday : date;
}

/**
 * ECB reference rate for the day the money was spent. Weekends and holidays
 * resolve to the previous published day, which is returned as `rateDate`.
 */
export async function getYenReferenceRate(currency: Exclude<CurrencyCode, typeof SETTLEMENT_CURRENCY>, date: string, now = new Date()): Promise<ReferenceRate> {
  const requestDate = lookupDate(date, now);
  if (!requestDate) throw new YenRateUnavailableError(currency, date);
  if (isE2ETestMode()) {
    const rate = E2E_RATES[currency];
    if (!rate) throw new YenRateUnavailableError(currency, date);
    return { rate, rateDate: requestDate };
  }
  let response: Response;
  try {
    response = await fetch(`https://api.frankfurter.dev/v1/${requestDate}?base=${currency}&symbols=${SETTLEMENT_CURRENCY}`, {
      signal: AbortSignal.timeout(8_000),
      next: { revalidate: 6 * 60 * 60 },
    });
  } catch (error) {
    console.error('Unable to reach the exchange-rate provider', error);
    throw new YenRateUnavailableError(currency, date);
  }
  if (!response.ok) throw new YenRateUnavailableError(currency, date);
  const parsed = FrankfurterResponseSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new YenRateUnavailableError(currency, date);
  return { rate: parsed.data.rates.JPY, rateDate: parsed.data.date };
}
