import { currencyDecimals, type CurrencyCode } from '@/lib/trips/currencies';
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

/** The exact decimal a rate prints as, e.g. 150.12345 -> 15012345 x 10^-5. */
function toDecimal(value: number): { digits: bigint; scale: number } {
  const [mantissa = '0', exponent = '0'] = String(value).toLowerCase().split('e');
  const [whole = '0', fraction = ''] = mantissa.split('.');
  return { digits: BigInt(whole + fraction), scale: fraction.length - Number(exponent) };
}

const pow10 = (exponent: number) => BigInt(`1${'0'.repeat(exponent)}`);

/** Exact integer maths so halves round up and nothing just below a half does. */
export function toYen({ amountMinor, currency, conversion }: { amountMinor: number; currency: CurrencyCode; conversion: YenConversion }): number {
  const rate = toDecimal(conversionRate(conversion));
  const scale = rate.scale + currencyDecimals(currency);
  const product = BigInt(amountMinor) * rate.digits;
  if (scale <= 0) return Number(product * pow10(-scale));
  const divisor = pow10(scale);
  return Number((product * BigInt(2) + divisor) / (divisor * BigInt(2)));
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
