import { z } from 'zod';

/** Currencies with ECB reference rates (served by Frankfurter), so each can convert to yen. */
export const CURRENCY_CODES = [
  'INR', 'JPY', 'USD', 'EUR', 'GBP', 'AUD', 'BRL', 'CAD', 'CHF', 'CNY', 'CZK', 'DKK', 'HKD', 'HUF', 'IDR',
  'ILS', 'ISK', 'KRW', 'MXN', 'MYR', 'NOK', 'NZD', 'PHP', 'PLN', 'RON', 'SEK', 'SGD', 'THB', 'TRY', 'ZAR',
] as const;

export const CurrencyCodeSchema = z.enum(CURRENCY_CODES);
export type CurrencyCode = z.infer<typeof CurrencyCodeSchema>;

export const SETTLEMENT_CURRENCY = 'JPY' satisfies CurrencyCode;

const ZERO_DECIMAL_CURRENCIES: ReadonlySet<CurrencyCode> = new Set<CurrencyCode>(['JPY', 'KRW', 'ISK']);
const MAX_AMOUNT_MAJOR = 1_000_000_000;

export function currencyDecimals(currency: CurrencyCode): number {
  return ZERO_DECIMAL_CURRENCIES.has(currency) ? 0 : 2;
}

export class InvalidAmountError extends Error {
  readonly code = 'EXPENSE_AMOUNT_INVALID';
}

/** Parses author-typed text like "1,234.50" into integer minor units without floating-point rounding. */
export function parseAmountToMinor(text: string, currency: CurrencyCode): number {
  const decimals = currencyDecimals(currency);
  const match = /^(\d{1,10})(?:\.(\d+))?$/.exec(text.trim().replace(/,/g, ''));
  if (!match) throw new InvalidAmountError('Enter an amount like 1250 or 1250.50');
  const [, whole, fraction = ''] = match;
  if (fraction.length > decimals) {
    throw new InvalidAmountError(decimals === 0 ? `${currency} amounts cannot have decimals` : `${currency} amounts can have at most ${decimals} decimals`);
  }
  if (Number(whole) > MAX_AMOUNT_MAJOR) throw new InvalidAmountError('That amount is too large');
  const minor = Number(whole) * 10 ** decimals + Number(fraction.padEnd(decimals, '0') || '0');
  if (minor <= 0) throw new InvalidAmountError('Amount must be greater than zero');
  return minor;
}

export function minorToMajor(amountMinor: number, currency: CurrencyCode): number {
  return amountMinor / 10 ** currencyDecimals(currency);
}

export function minorToInput(amountMinor: number, currency: CurrencyCode): string {
  return minorToMajor(amountMinor, currency).toFixed(currencyDecimals(currency));
}

export function formatMoney(amountMinor: number, currency: CurrencyCode): string {
  const decimals = currencyDecimals(currency);
  return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(minorToMajor(amountMinor, currency));
}

export function formatYen(amount: number): string {
  return formatMoney(amount, SETTLEMENT_CURRENCY);
}
