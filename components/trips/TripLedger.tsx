import type { ReactNode } from 'react';

import { formatMoney, formatYen, SETTLEMENT_CURRENCY } from '@/lib/trips/currencies';
import { summarizeLedger } from '@/lib/trips/ledger';
import type { ExpenseView, Participant, YenConversion } from '@/lib/trips/schemas';
import styles from './trip-ledger.module.css';

const shortDate = (isoDate: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${isoDate}T00:00:00Z`));

function rateNote(currency: ExpenseView['currency'], conversion: YenConversion) {
  switch (conversion.kind) {
    case 'same-currency': return null;
    case 'reference': return `1 ${currency} = ¥${conversion.rate} · ECB ${shortDate(conversion.rateDate)}`;
    case 'manual': return `1 ${currency} = ¥${conversion.rate} · manual rate`;
    default: {
      const _exhaustive: never = conversion;
      return _exhaustive;
    }
  }
}

export function TripSummary({ participants, expenses }: { participants: Participant[]; expenses: ExpenseView[] }) {
  const summary = summarizeLedger(participants, expenses);
  return (
    <div className={styles.summary}>
      <section aria-labelledby="settle-up-heading" className={styles.card}>
        <h2 id="settle-up-heading" className={styles.cardTitle}>Settle up</h2>
        {summary.settlements.length ? (
          <ul className={styles.settlements}>
            {summary.settlements.map((settlement) => (
              <li key={`${settlement.from.id}-${settlement.to.id}`}>
                <span>{settlement.from.name} pays {settlement.to.name}</span> <strong>{formatYen(settlement.amountJpy)}</strong>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.muted}>{expenses.length ? 'Everyone is even.' : 'No expenses yet.'}</p>
        )}
        <p className={styles.total}>Trip total <strong>{formatYen(summary.totalJpy)}</strong></p>
      </section>
      <section aria-labelledby="balances-heading" className={styles.card}>
        <h2 id="balances-heading" className={styles.cardTitle}>Balances</h2>
        <table className={styles.balances}>
          <thead>
            <tr><th scope="col">Person</th><th scope="col">Paid</th><th scope="col">Share</th><th scope="col">Net</th></tr>
          </thead>
          <tbody>
            {summary.balances.map((person) => (
              <tr key={person.id}>
                <th scope="row">{person.name}</th>
                <td>{formatYen(person.paidJpy)}</td>
                <td>{formatYen(person.shareJpy)}</td>
                <td data-sign={Math.sign(person.balanceJpy)}>{person.balanceJpy > 0 ? '+' : ''}{formatYen(person.balanceJpy)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

export function ExpenseList({ participants, expenses, renderActions }: {
  participants: Participant[];
  expenses: ExpenseView[];
  renderActions?: (expense: ExpenseView) => ReactNode;
}) {
  const names = new Map(participants.map((person) => [person.id, person.name]));
  if (!expenses.length) return <p className={styles.muted}>No expenses yet.</p>;
  return (
    <ul aria-label="Expenses" className={styles.expenses}>
      {expenses.map((expense) => {
        const note = rateNote(expense.currency, expense.conversion);
        const everyone = expense.splitAmong.length === participants.length;
        return (
          <li key={expense.id} className={styles.expense}>
            <time className={styles.date} dateTime={expense.spentOn}>{shortDate(expense.spentOn)}</time>
            <div className={styles.expenseMain}>
              <span className={styles.description}>{expense.description}</span>
              <span className={styles.muted}>
                {names.get(expense.paidBy) ?? 'Unknown'} paid · {everyone ? 'split by everyone' : `split by ${expense.splitAmong.map((id) => names.get(id) ?? 'Unknown').join(', ')}`}
              </span>
            </div>
            <div className={styles.amounts}>
              <strong>{formatYen(expense.amountJpy)}</strong>
              {expense.currency !== SETTLEMENT_CURRENCY ? <span>{formatMoney(expense.amountMinor, expense.currency)}</span> : null}
              {note ? <span className={styles.muted}>{note}</span> : null}
            </div>
            {renderActions ? <div className={styles.actions}>{renderActions(expense)}</div> : null}
          </li>
        );
      })}
    </ul>
  );
}
