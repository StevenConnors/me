'use client';

import { useEffect, useState } from 'react';

import styles from '@/app/admin/admin.module.css';
import workspace from './trip-workspace.module.css';

export const tripPath = (tripId: string) => `/trips/${tripId}`;

export function ShareLink({ tripId, compact = false }: { tripId: string; compact?: boolean }) {
  const path = tripPath(tripId);
  const [url, setUrl] = useState(path);
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle');
  useEffect(() => setUrl(`${window.location.origin}${path}`), [path]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopy('copied');
    } catch {
      setCopy('failed');
    }
  }

  const row = (
    <div className={workspace.shareRow}>
      <a className={workspace.shareUrl} href={path} target="_blank" rel="noreferrer">{url}</a>
      <button className={styles.quietButton} type="button" onClick={() => void copyLink()}>Copy link</button>
      <span role="status" className={styles.fieldHint}>{copy === 'copied' ? 'Copied' : copy === 'failed' ? 'Could not copy. Select the link instead.' : ''}</span>
    </div>
  );
  if (compact) return row;
  return (
    <section aria-label="Share link" className={`${styles.panel} ${workspace.share}`}>
      <p className={styles.fieldHint}>Anyone with this link can see the trip and add, edit or delete expenses. It is not linked anywhere on the site.</p>
      {row}
    </section>
  );
}
