'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import styles from '@/app/admin/admin.module.css';
import { CURRENCY_CODES, type CurrencyCode } from '@/lib/trips/currencies';
import { readApiError } from './api-client';

export function NewTripForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [defaultCurrency, setDefaultCurrency] = useState<CurrencyCode>('INR');
  const [people, setPeople] = useState('');
  const [status, setStatus] = useState<{ state: 'idle' | 'saving' } | { state: 'error'; message: string }>({ state: 'idle' });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus({ state: 'saving' });
    const participants = people.split(/[\n,]/).map((person) => person.trim()).filter(Boolean);
    const response = await fetch('/api/admin/trips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, slug, defaultCurrency, participants }),
    }).catch(() => null);
    if (!response?.ok) {
      setStatus({ state: 'error', message: await readApiError(response, 'Could not create the trip. Try again.') });
      return;
    }
    router.push(`/admin/trips/${slug}`);
  }

  return (
    <form aria-label="New trip" className={styles.form} onSubmit={submit}>
      <div className={styles.field}>
        <label htmlFor="trip-name">Trip name</label>
        <input id="trip-name" required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="India 2026" />
      </div>
      <div className={styles.field}>
        <label htmlFor="trip-slug">Address</label>
        <input id="trip-slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" minLength={3} maxLength={60} value={slug} onChange={(event) => setSlug(event.target.value.toLowerCase())} placeholder="india-2026" />
        <span className={styles.fieldHint}>The public page lives at /{slug || 'india-2026'}. It is not linked anywhere on the site.</span>
      </div>
      <div className={styles.field}>
        <label htmlFor="trip-currency">Usual currency</label>
        <select id="trip-currency" value={defaultCurrency} onChange={(event) => setDefaultCurrency(CURRENCY_CODES.find((code) => code === event.target.value) ?? 'INR')}>
          {CURRENCY_CODES.map((code) => <option key={code} value={code}>{code}</option>)}
        </select>
      </div>
      <div className={styles.field}>
        <label htmlFor="trip-people">People</label>
        <textarea id="trip-people" required value={people} onChange={(event) => setPeople(event.target.value)} placeholder={'Yuji\nFriend one\nFriend two'} />
        <span className={styles.fieldHint}>One name per line. You can rename people or add more later.</span>
      </div>
      <div className={styles.formFooter}>
        <p className={styles.status} data-state={status.state} role="status">{status.state === 'error' ? status.message : ''}</p>
        <button className={styles.button} type="submit" disabled={status.state === 'saving'}>{status.state === 'saving' ? 'Creating…' : 'Create trip'}</button>
      </div>
    </form>
  );
}
