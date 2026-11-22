import { describe, expect, it } from 'vitest';

import { formatMoney, parseAmountToMinor } from '@/lib/trips/currencies';
import { CreateTripInputSchema } from '@/lib/trips/schemas';

describe('parseAmountToMinor', () => {
  it('stores exact integer minor units', () => {
    expect(parseAmountToMinor('1,250.50', 'INR')).toBe(125_050);
    expect(parseAmountToMinor('0.10', 'USD')).toBe(10);
    expect(parseAmountToMinor('0.3', 'USD')).toBe(30);
    expect(parseAmountToMinor('1200', 'JPY')).toBe(1200);
  });

  it('rejects extra decimals, zero, negatives and junk instead of rounding', () => {
    for (const [text, currency] of [['10.005', 'INR'], ['10.5', 'JPY'], ['0', 'INR'], ['0.00', 'INR'], ['-5', 'INR'], ['abc', 'INR'], ['', 'INR'], ['1e5', 'INR']] as const) {
      expect(() => parseAmountToMinor(text, currency), `${text} ${currency}`).toThrow();
    }
  });
});

describe('formatMoney', () => {
  it('shows the currency precision', () => {
    expect(formatMoney(125_050, 'INR')).toBe('₹1,250.50');
    expect(formatMoney(123_456, 'JPY')).toBe('¥123,456');
  });
});

describe('trips', () => {
  it('rejects trips with duplicate names', () => {
    const result = CreateTripInputSchema.safeParse({ name: 'India', defaultCurrency: 'INR', participants: ['Yuji', 'yuji '] });
    expect(result.success).toBe(false);
  });
});
