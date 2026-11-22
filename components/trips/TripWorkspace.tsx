'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { z } from 'zod';

import styles from '@/app/admin/admin.module.css';
import { ExpenseList, TripSummary } from '@/components/trips/TripLedger';
import { CURRENCY_CODES, formatYen, minorToInput, parseAmountToMinor, SETTLEMENT_CURRENCY, type CurrencyCode } from '@/lib/trips/currencies';
import { toYen } from '@/lib/trips/ledger';
import { ExpenseViewSchema, TripViewSchema, type ExpenseView, type TripView, type YenConversion } from '@/lib/trips/schemas';
import { readApiError } from './api-client';
import { ShareLink } from './ShareLink';
import workspace from './trip-workspace.module.css';

type Draft = {
  description: string;
  amount: string;
  currency: CurrencyCode;
  spentOn: string;
  paidBy: string;
  splitAmong: string[];
  useManualRate: boolean;
  manualRate: string;
};
type RatePreview = { state: 'idle' | 'loading' } | { state: 'ready'; rate: number; rateDate: string } | { state: 'error'; message: string };
type Status = { state: 'idle' | 'saving' } | { state: 'saved' | 'error'; message: string };

const ExpenseResponseSchema = z.object({ expense: ExpenseViewSchema });
const TripResponseSchema = z.object({ trip: TripViewSchema });
const RateResponseSchema = z.object({ rate: z.number().positive(), rateDate: z.string() });
const localToday = () => new Date().toLocaleDateString('en-CA');
const sortExpenses = (expenses: ExpenseView[]) => [...expenses].sort((a, b) => b.spentOn.localeCompare(a.spentOn));

function blankDraft(trip: TripView, previous?: Draft): Draft {
  return {
    description: '',
    amount: '',
    currency: trip.defaultCurrency,
    spentOn: previous?.spentOn ?? '',
    paidBy: previous?.paidBy ?? trip.participants[0]?.id ?? '',
    splitAmong: trip.participants.map((person) => person.id),
    useManualRate: false,
    manualRate: '',
  };
}

function draftFromExpense(expense: ExpenseView): Draft {
  return {
    description: expense.description,
    amount: minorToInput(expense.amountMinor, expense.currency),
    currency: expense.currency,
    spentOn: expense.spentOn,
    paidBy: expense.paidBy,
    splitAmong: expense.splitAmong,
    useManualRate: expense.conversion.kind === 'manual',
    manualRate: expense.conversion.kind === 'manual' ? String(expense.conversion.rate) : '',
  };
}

function previewYen(draft: Draft, rate: RatePreview): string {
  let amountMinor: number;
  try {
    amountMinor = parseAmountToMinor(draft.amount, draft.currency);
  } catch (error) {
    return draft.amount ? (error instanceof Error ? error.message : 'Check the amount') : 'Enter an amount to see it in yen';
  }
  let conversion: YenConversion;
  let source: string;
  if (draft.currency === SETTLEMENT_CURRENCY) {
    conversion = { kind: 'same-currency' };
    source = 'Already in yen';
  } else if (draft.useManualRate) {
    const manual = Number(draft.manualRate);
    if (!(manual > 0)) return 'Enter the yen rate';
    conversion = { kind: 'manual', rate: manual };
    source = `1 ${draft.currency} = ¥${manual} (your rate)`;
  } else if (rate.state === 'ready') {
    conversion = { kind: 'manual', rate: rate.rate };
    source = `1 ${draft.currency} = ¥${rate.rate} (ECB reference, ${rate.rateDate})`;
  } else {
    return rate.state === 'error' ? rate.message : 'Looking up the rate…';
  }
  return `≈ ${formatYen(toYen({ amountMinor, currency: draft.currency, conversion }))} · ${source}`;
}

/**
 * `shared` is the public trip link anyone can add expenses from; `admin` also
 * shows the link to share and lets the author rename or add people.
 */
export function TripWorkspace({ initialTrip, initialExpenses, mode }: { initialTrip: TripView; initialExpenses: ExpenseView[]; mode: 'admin' | 'shared' }) {
  const [trip, setTrip] = useState(initialTrip);
  const [expenses, setExpenses] = useState(initialExpenses);
  const [draft, setDraft] = useState<Draft>(() => blankDraft(initialTrip));
  const [editing, setEditing] = useState<ExpenseView | null>(null);
  const [rate, setRate] = useState<RatePreview>({ state: 'idle' });
  const [status, setStatus] = useState<Status>({ state: 'idle' });
  const [people, setPeople] = useState(initialTrip.participants.map((person): { id?: string; name: string } => person));
  const [peopleStatus, setPeopleStatus] = useState<Status>({ state: 'idle' });
  const apiBase = `/api/trips/${initialTrip.id}`;

  useEffect(() => {
    setDraft((current) => (current.spentOn ? current : { ...current, spentOn: localToday() }));
  }, []);

  const { currency, spentOn, useManualRate } = draft;
  useEffect(() => {
    if (currency === SETTLEMENT_CURRENCY || useManualRate || !spentOn) {
      setRate({ state: 'idle' });
      return;
    }
    const controller = new AbortController();
    setRate({ state: 'loading' });
    void (async () => {
      const response = await fetch(`${apiBase}/fx-rate?${new URLSearchParams({ currency, date: spentOn })}`, { signal: controller.signal }).catch(() => null);
      if (controller.signal.aborted) return;
      if (!response?.ok) {
        setRate({ state: 'error', message: await readApiError(response, 'No reference rate. Enter the rate yourself.') });
        return;
      }
      const parsed = RateResponseSchema.safeParse(await response.json().catch(() => null));
      setRate(parsed.success ? { state: 'ready', ...parsed.data } : { state: 'error', message: 'No reference rate. Enter the rate yourself.' });
    })();
    return () => controller.abort();
  }, [apiBase, currency, spentOn, useManualRate]);

  const preview = useMemo(() => previewYen(draft, rate), [draft, rate]);
  const update = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));

  function startEditing(expense: ExpenseView) {
    setEditing(expense);
    setDraft(draftFromExpense(expense));
    setStatus({ state: 'idle' });
    document.getElementById('expense-description')?.focus();
  }

  function stopEditing() {
    setEditing(null);
    setDraft((current) => blankDraft(trip, current));
  }

  async function submitExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus({ state: 'saving' });
    const body = {
      description: draft.description,
      spentOn: draft.spentOn,
      amount: draft.amount,
      currency: draft.currency,
      paidBy: draft.paidBy,
      splitAmong: draft.splitAmong,
      manualRate: draft.useManualRate && draft.currency !== SETTLEMENT_CURRENCY ? Number(draft.manualRate) : null,
      ...(editing ? { expectedVersion: editing.version } : {}),
    };
    const url = `${apiBase}/expenses${editing ? `/${editing.id}` : ''}`;
    const response = await fetch(url, {
      method: editing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => null);
    const parsed = response?.ok ? ExpenseResponseSchema.safeParse(await response.json().catch(() => null)) : null;
    if (!parsed?.success) {
      setStatus({ state: 'error', message: await readApiError(response, 'Could not save the expense. Try again.') });
      return;
    }
    const saved = parsed.data.expense;
    setExpenses((current) => sortExpenses([saved, ...current.filter((expense) => expense.id !== saved.id)]));
    setStatus({ state: 'saved', message: `${editing ? 'Updated' : 'Added'} “${saved.description}” · ${formatYen(saved.amountJpy)}` });
    setEditing(null);
    setDraft((current) => blankDraft(trip, current));
  }

  async function deleteExpense(expense: ExpenseView) {
    if (!window.confirm(`Delete “${expense.description}”?`)) return;
    const response = await fetch(`${apiBase}/expenses/${expense.id}?version=${expense.version}`, { method: 'DELETE' }).catch(() => null);
    if (!response?.ok && response?.status !== 404) {
      setStatus({ state: 'error', message: await readApiError(response, 'Could not delete the expense. Try again.') });
      return;
    }
    setExpenses((current) => current.filter((item) => item.id !== expense.id));
    if (editing?.id === expense.id) stopEditing();
    setStatus({ state: 'saved', message: `Deleted “${expense.description}”` });
  }

  async function savePeople() {
    setPeopleStatus({ state: 'saving' });
    const response = await fetch(`/api/admin/trips/${trip.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trip.name, defaultCurrency: trip.defaultCurrency, participants: people, expectedVersion: trip.version }),
    }).catch(() => null);
    const parsed = response?.ok ? TripResponseSchema.safeParse(await response.json().catch(() => null)) : null;
    if (!parsed?.success) {
      setPeopleStatus({ state: 'error', message: await readApiError(response, 'Could not save people. Try again.') });
      return;
    }
    const added = parsed.data.trip.participants.filter((person) => !trip.participants.some((known) => known.id === person.id));
    setTrip(parsed.data.trip);
    setPeople(parsed.data.trip.participants);
    setDraft((current) => ({ ...current, splitAmong: [...current.splitAmong, ...added.map((person) => person.id)] }));
    setPeopleStatus({ state: 'saved', message: 'People saved' });
  }

  const peopleDirty = people.length !== trip.participants.length || people.some((person, index) => person.name !== trip.participants[index]?.name);

  return (
    <div className={workspace.workspace}>
      <p className={styles.eyebrow}>{mode === 'admin' ? 'Trip expenses' : 'Shared expenses · settled in yen'}</p>
      <h1 className={`${styles.title} ${workspace.title}`}>{trip.name}</h1>
      <p className={workspace.peopleLine}>{trip.participants.map((person) => person.name).join(' · ')}</p>
      {mode === 'admin' ? <ShareLink tripId={trip.id} /> : null}

      <form aria-label="Add expense" className={`${styles.form} ${workspace.expenseForm}`} onSubmit={submitExpense}>
        <h2 className={workspace.formTitle}>{editing ? `Editing “${editing.description}”` : 'Add an expense'}</h2>
        <div className={`${styles.field} ${workspace.wide}`}>
          <label htmlFor="expense-description">What for</label>
          <input id="expense-description" required maxLength={120} value={draft.description} onChange={(event) => update({ description: event.target.value })} placeholder="Dinner at Bukhara" />
        </div>
        <div className={styles.field}>
          <label htmlFor="expense-amount">Amount</label>
          <input id="expense-amount" required inputMode="decimal" value={draft.amount} onChange={(event) => update({ amount: event.target.value })} placeholder="2400" />
        </div>
        <div className={styles.field}>
          <label htmlFor="expense-currency">Currency</label>
          <select id="expense-currency" value={draft.currency} onChange={(event) => update({ currency: CURRENCY_CODES.find((code) => code === event.target.value) ?? draft.currency })}>
            {CURRENCY_CODES.map((code) => <option key={code} value={code}>{code}</option>)}
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor="expense-date">Date</label>
          <input id="expense-date" type="date" required value={draft.spentOn} onChange={(event) => update({ spentOn: event.target.value })} />
        </div>
        <div className={styles.field}>
          <label htmlFor="expense-payer">Paid by</label>
          <select id="expense-payer" value={draft.paidBy} onChange={(event) => update({ paidBy: event.target.value })}>
            {trip.participants.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
          </select>
        </div>
        <fieldset className={`${workspace.split} ${workspace.wide}`}>
          <legend>Split equally between</legend>
          {trip.participants.map((person) => (
            <label key={person.id}>
              <input
                type="checkbox"
                checked={draft.splitAmong.includes(person.id)}
                onChange={(event) => update({ splitAmong: event.target.checked ? [...draft.splitAmong, person.id] : draft.splitAmong.filter((id) => id !== person.id) })}
              />
              {person.name}
            </label>
          ))}
        </fieldset>
        {draft.currency !== SETTLEMENT_CURRENCY ? (
          <div className={`${workspace.rate} ${workspace.wide}`}>
            <label className={workspace.inline}>
              <input type="checkbox" checked={draft.useManualRate} onChange={(event) => update({ useManualRate: event.target.checked })} />
              Enter the rate myself
            </label>
            {draft.useManualRate ? (
              <div className={styles.field}>
                <label htmlFor="expense-rate">Yen per 1 {draft.currency}</label>
                <input id="expense-rate" required type="number" min="0" step="any" value={draft.manualRate} onChange={(event) => update({ manualRate: event.target.value })} />
              </div>
            ) : null}
          </div>
        ) : null}
        <p className={`${workspace.preview} ${workspace.wide}`} data-testid="yen-preview" aria-live="polite">{preview}</p>
        <div className={`${styles.formFooter} ${workspace.wide}`}>
          <p className={styles.status} data-state={status.state} role="status">{'message' in status ? status.message : ''}</p>
          <div className={styles.actionGroup}>
            {editing ? <button className={styles.quietButton} type="button" onClick={stopEditing}>Cancel</button> : null}
            <button className={styles.button} type="submit" disabled={status.state === 'saving' || !draft.splitAmong.length}>
              {editing ? 'Save changes' : 'Add expense'}
            </button>
          </div>
        </div>
      </form>

      <div className={workspace.section}>
        <TripSummary participants={trip.participants} expenses={expenses} />
      </div>

      <h2 className={workspace.sectionTitle}>Expenses</h2>
      <ExpenseList
        participants={trip.participants}
        expenses={expenses}
        renderActions={(expense) => (
          <>
            <button className={styles.quietButton} type="button" onClick={() => startEditing(expense)}>Edit</button>
            <button className={styles.quietButton} type="button" onClick={() => void deleteExpense(expense)}>Delete</button>
          </>
        )}
      />

      {mode === 'admin' ? <section aria-labelledby="people-heading" className={`${styles.panel} ${workspace.section}`}>
        <h2 id="people-heading" className={workspace.formTitle}>People</h2>
        <p className={styles.fieldHint}>Rename or add people. People already on the trip stay so no expense loses its payer.</p>
        <div className={workspace.people}>
          {people.map((person, index) => (
            <input
              key={person.id ?? `new-${index}`}
              aria-label={`Person ${index + 1}`}
              maxLength={40}
              value={person.name}
              onChange={(event) => setPeople((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, name: event.target.value } : item)))}
            />
          ))}
        </div>
        <div className={styles.formFooter}>
          <p className={styles.status} data-state={peopleStatus.state} role="status">{'message' in peopleStatus ? peopleStatus.message : ''}</p>
          <div className={styles.actionGroup}>
            <button className={styles.quietButton} type="button" onClick={() => setPeople((current) => [...current, { name: '' }])}>Add person</button>
            <button className={styles.button} type="button" disabled={!peopleDirty || peopleStatus.state === 'saving'} onClick={() => void savePeople()}>Save people</button>
          </div>
        </div>
      </section> : null}
    </div>
  );
}
