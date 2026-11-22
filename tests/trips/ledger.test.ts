import { describe, expect, it } from 'vitest';

import { splitEqually, summarizeLedger, toYen } from '@/lib/trips/ledger';

const yuji = { id: 'yuji', name: 'Yuji' };
const asha = { id: 'asha', name: 'Asha' };
const ken = { id: 'ken', name: 'Ken' };
const trip = [yuji, asha, ken];

describe('toYen', () => {
  it('converts minor units with the stored rate and rounds to whole yen', () => {
    expect(toYen({ amountMinor: 300_000, currency: 'INR', conversion: { kind: 'reference', provider: 'ecb', rate: 1.7118, rateDate: '2026-11-20' } })).toBe(5135);
    expect(toYen({ amountMinor: 1001, currency: 'USD', conversion: { kind: 'manual', rate: 150 } })).toBe(1502);
    expect(toYen({ amountMinor: 1000, currency: 'JPY', conversion: { kind: 'same-currency' } })).toBe(1000);
    expect(toYen({ amountMinor: 113, currency: 'USD', conversion: { kind: 'manual', rate: 150 } })).toBe(170);
    expect(toYen({ amountMinor: 1, currency: 'USD', conversion: { kind: 'manual', rate: 50 } })).toBe(1);
    expect(toYen({ amountMinor: 672_742, currency: 'USD', conversion: { kind: 'manual', rate: 150.12345 } })).toBe(1_009_943);
    expect(toYen({ amountMinor: 1, currency: 'IDR', conversion: { kind: 'manual', rate: 0.0000005 } })).toBe(0);
    expect(toYen({ amountMinor: 2_000_000, currency: 'IDR', conversion: { kind: 'manual', rate: 0.00925 } })).toBe(185);
    expect(toYen({ amountMinor: 5, currency: 'KRW', conversion: { kind: 'manual', rate: 1e21 } })).toBe(5e21);
  });
});

describe('splitEqually', () => {
  it('never loses or invents a yen and gives leftovers to the first people', () => {
    expect(Array.from(splitEqually(1502, ['yuji', 'asha', 'ken']))).toEqual([['yuji', 501], ['asha', 501], ['ken', 500]]);
    expect(Array.from(splitEqually(1000, ['yuji', 'asha']))).toEqual([['yuji', 500], ['asha', 500]]);
    expect(Array.from(splitEqually(2, ['yuji', 'asha', 'ken']))).toEqual([['yuji', 1], ['asha', 1], ['ken', 0]]);
  });
});

describe('summarizeLedger', () => {
  it('balances sum to zero and settle-up pays only creditors with no zero payments', () => {
    const summary = summarizeLedger(trip, [
      { paidBy: 'yuji', splitAmong: ['yuji', 'asha', 'ken'], amountJpy: 5400 },
      { paidBy: 'asha', splitAmong: ['yuji', 'asha'], amountJpy: 1000 },
      { paidBy: 'ken', splitAmong: ['ken', 'asha', 'yuji'], amountJpy: 1502 },
    ]);
    expect(summary.totalJpy).toBe(7902);
    expect(summary.balances.map(({ name, paidJpy, shareJpy, balanceJpy }) => ({ name, paidJpy, shareJpy, balanceJpy }))).toEqual([
      { name: 'Yuji', paidJpy: 5400, shareJpy: 2801, balanceJpy: 2599 },
      { name: 'Asha', paidJpy: 1000, shareJpy: 2801, balanceJpy: -1801 },
      { name: 'Ken', paidJpy: 1502, shareJpy: 2300, balanceJpy: -798 },
    ]);
    expect(summary.balances.reduce((sum, person) => sum + person.balanceJpy, 0)).toBe(0);
    expect(summary.settlements.map(({ from, to, amountJpy }) => `${from.name}→${to.name} ${amountJpy}`)).toEqual(['Asha→Yuji 1801', 'Ken→Yuji 798']);
  });

  it('needs no payments when everyone is even', () => {
    const summary = summarizeLedger(trip, [
      { paidBy: 'yuji', splitAmong: ['yuji', 'asha'], amountJpy: 600 },
      { paidBy: 'asha', splitAmong: ['yuji', 'asha'], amountJpy: 600 },
    ]);
    expect(summary.settlements).toEqual([]);
    expect(summarizeLedger(trip, []).settlements).toEqual([]);
  });

  it('uses at most people − 1 payments when one person owes two others', () => {
    const summary = summarizeLedger(trip, [
      { paidBy: 'yuji', splitAmong: ['ken'], amountJpy: 3000 },
      { paidBy: 'asha', splitAmong: ['ken'], amountJpy: 1000 },
    ]);
    expect(summary.settlements.map(({ from, to, amountJpy }) => `${from.name}→${to.name} ${amountJpy}`)).toEqual(['Ken→Yuji 3000', 'Ken→Asha 1000']);
  });
});
