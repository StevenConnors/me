'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import styles from '@/app/admin/admin.module.css';

type CreateResponse = { journey?: { _id?: string }; error?: { message?: string } };

export function NewJourneyButton() {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'creating' | 'error'>('idle');

  async function createJourney() {
    setState('creating');
    try {
      const response = await fetch('/api/admin/journeys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const payload = (await response.json()) as CreateResponse;
      if (!response.ok || !payload.journey?._id) {
        throw new Error(payload.error?.message ?? 'Unable to create a journey');
      }
      router.push(`/admin/journeys/${payload.journey._id}/edit`);
    } catch (error) {
      console.error(error);
      setState('error');
    }
  }

  return (
    <div>
      <button className={styles.button} type="button" onClick={createJourney} disabled={state === 'creating'}>
        {state === 'creating' ? 'Creating…' : 'New journey'}
      </button>
      {state === 'error' && <p className={styles.status} data-state="error">Could not create a journey. Try again.</p>}
    </div>
  );
}
