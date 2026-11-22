import { minorToMajor, type CurrencyCode } from '@/lib/trips/currencies';
import type { Participant, YenConversion } from '@/lib/trips/schemas';

export function conversionRate(conversion: YenConversion): number {
  switch (conversion.kind) {
    case 'same-currency': return 1;
    case 'reference':
    case 'manual': return conversion.rate;
    default: {
      const _exhaustive: never = conversion;
      return _exhaustive;
    }
  }
}

export function toYen({ amountMinor, currency, conversion }: { amountMinor: number; currency: CurrencyCode; conversion: YenConversion }): number {
  // toPrecision drops binary noise such as 1.13 * 150 = 169.49999999999997 so halves round up.
  return Math.round(Number((minorToMajor(amountMinor, currency) * conversionRate(conversion)).toPrecision(12)));
}

/**
 * Splits whole yen so the shares add up exactly; the leftover yen go to the
 * first people in trip order.
 */
export function splitEqually(amountJpy: number, people: readonly string[]): Map<string, number> {
  const base = Math.floor(amountJpy / people.length);
  let remainder = amountJpy - base * people.length;
  const shares = new Map<string, number>();
  for (const person of people) {
    shares.set(person, base + (remainder > 0 ? 1 : 0));
    remainder -= 1;
  }
  return shares;
}

type LedgerExpense = { paidBy: string; splitAmong: readonly string[]; amountJpy: number };

export type PersonBalance = Participant & { paidJpy: number; shareJpy: number; balanceJpy: number };
export type Settlement = { from: Participant; to: Participant; amountJpy: number };

export function summarizeLedger(participants: readonly Participant[], expenses: readonly LedgerExpense[]) {
  const order = new Map(participants.map((person, index) => [person.id, index]));
  const paid = new Map(participants.map((person) => [person.id, 0]));
  const owed = new Map(participants.map((person) => [person.id, 0]));
  for (const expense of expenses) {
    paid.set(expense.paidBy, (paid.get(expense.paidBy) ?? 0) + expense.amountJpy);
    const people = [...expense.splitAmong].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
    splitEqually(expense.amountJpy, people).forEach((share, person) => owed.set(person, (owed.get(person) ?? 0) + share));
  }
  const balances: PersonBalance[] = participants.map((person) => {
    const paidJpy = paid.get(person.id) ?? 0;
    const shareJpy = owed.get(person.id) ?? 0;
    return { ...person, paidJpy, shareJpy, balanceJpy: paidJpy - shareJpy };
  });
  return {
    totalJpy: expenses.reduce((sum, expense) => sum + expense.amountJpy, 0),
    balances,
    settlements: settleUp(balances),
  };
}

/** Largest debtor pays largest creditor until everyone is even; at most people − 1 payments. */
export function settleUp(balances: readonly PersonBalance[]): Settlement[] {
  const byAmount = (a: { left: number }, b: { left: number }) => b.left - a.left;
  const creditors = balances.filter((person) => person.balanceJpy > 0).map((person) => ({ person, left: person.balanceJpy })).sort(byAmount);
  const debtors = balances.filter((person) => person.balanceJpy < 0).map((person) => ({ person, left: -person.balanceJpy })).sort(byAmount);
  const settlements: Settlement[] = [];
  let creditorIndex = 0;
  let debtorIndex = 0;
  while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
    const creditor = creditors[creditorIndex];
    const debtor = debtors[debtorIndex];
    const amountJpy = Math.min(creditor.left, debtor.left);
    settlements.push({
      from: { id: debtor.person.id, name: debtor.person.name },
      to: { id: creditor.person.id, name: creditor.person.name },
      amountJpy,
    });
    creditor.left -= amountJpy;
    debtor.left -= amountJpy;
    if (creditor.left === 0) creditorIndex += 1;
    if (debtor.left === 0) debtorIndex += 1;
  }
  return settlements;
}
