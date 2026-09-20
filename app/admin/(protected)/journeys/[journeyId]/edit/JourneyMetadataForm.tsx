'use client';

import { useEffect, useRef, useState } from 'react';

import styles from '@/app/admin/admin.module.css';

type EditableJourney = {
  _id: string;
  title: string;
  slug: string;
  summary?: string;
  editVersion: number;
};

type SaveState = 'idle' | 'saving' | 'saved' | 'error' | 'conflict';

type SaveResponse = {
  journey?: EditableJourney;
  error?: { code?: string; message?: string };
};

export function JourneyMetadataForm({ initialJourney }: { initialJourney: EditableJourney }) {
  const [journey, setJourney] = useState(initialJourney);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestJourney = useRef(journey);

  useEffect(() => {
    latestJourney.current = journey;
  }, [journey]);

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  function scheduleSave(nextJourney: EditableJourney) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void save(nextJourney), 800);
  }

  async function save(nextJourney = latestJourney.current) {
    setSaveState('saving');
    try {
      const response = await fetch(`/api/admin/journeys/${nextJourney._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedEditVersion: nextJourney.editVersion,
          title: nextJourney.title,
          slug: nextJourney.slug,
          summary: nextJourney.summary || null,
        }),
      });
      const payload = (await response.json()) as SaveResponse;
      if (response.status === 409) {
        setSaveState('conflict');
        return;
      }
      if (!response.ok || !payload.journey) throw new Error(payload.error?.message ?? 'Save failed');
      setJourney(payload.journey);
      setSaveState('saved');
    } catch (error) {
      console.error(error);
      setSaveState('error');
    }
  }

  function update<K extends keyof Pick<EditableJourney, 'title' | 'slug' | 'summary'>>(key: K, value: EditableJourney[K]) {
    const next = { ...latestJourney.current, [key]: value };
    setJourney(next);
    setSaveState('idle');
    scheduleSave(next);
  }

  const statusText: Record<SaveState, string> = {
    idle: 'Changes save automatically',
    saving: 'Saving…',
    saved: 'Saved',
    error: 'Save failed; try again',
    conflict: 'Another session changed this journey; reload before saving again',
  };

  return (
    <form className={styles.form} onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <div className={styles.field}>
        <label htmlFor="journey-title">Title</label>
        <input id="journey-title" value={journey.title} onChange={(event) => update('title', event.target.value)} placeholder="A journey title" maxLength={200} autoFocus />
      </div>
      <div className={styles.field}>
        <label htmlFor="journey-slug">Public slug</label>
        <input id="journey-slug" value={journey.slug} onChange={(event) => update('slug', event.target.value)} placeholder="journey-slug" maxLength={120} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" />
      </div>
      <div className={styles.field}>
        <label htmlFor="journey-summary">Summary <span aria-hidden="true">(optional)</span></label>
        <textarea id="journey-summary" value={journey.summary ?? ''} onChange={(event) => update('summary', event.target.value)} placeholder="A short invitation into the journey." maxLength={500} />
      </div>
      <div className={styles.formFooter}>
        <span className={styles.status} data-state={saveState}>{statusText[saveState]}</span>
        <button className={styles.button} type="submit" disabled={saveState === 'saving' || saveState === 'conflict'}>Save now</button>
      </div>
    </form>
  );
}
