'use client';

import { useEffect, useRef, useState } from 'react';

import { JourneyVisualEditor, type EditorMedia } from '@/components/editor/JourneyVisualEditor';
import styles from '@/app/admin/admin.module.css';
import type { JourneyDocument } from '@/lib/journeys/schemas';

type EditableJourney = {
  _id: string;
  title: string;
  slug: string;
  summary?: string;
  editVersion: number;
  draftDocument: JourneyDocument;
};

type SaveState = 'idle' | 'saving' | 'saved' | 'error' | 'conflict';
type SaveResponse = { journey?: EditableJourney; error?: { code?: string; message?: string } };

export function JourneyWorkspace({ initialJourney, media }: { initialJourney: EditableJourney; media: EditorMedia[] }) {
  const [journey, setJourney] = useState(initialJourney);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const current = useRef(journey);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { current.current = journey; }, [journey]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function scheduleSave(next: EditableJourney) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(next), 1_000);
  }

  function change<K extends keyof Pick<EditableJourney, 'title' | 'slug' | 'summary' | 'draftDocument'>>(key: K, value: EditableJourney[K]) {
    const next = { ...current.current, [key]: value };
    setJourney(next);
    setSaveState('idle');
    scheduleSave(next);
  }

  async function save(next = current.current) {
    if (saveState === 'conflict') return;
    setSaveState('saving');
    try {
      const response = await fetch(`/api/admin/journeys/${next._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedEditVersion: next.editVersion,
          title: next.title,
          slug: next.slug,
          summary: next.summary || null,
          draftDocument: next.draftDocument,
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

  const saveLabel: Record<SaveState, string> = {
    idle: 'Changes save automatically',
    saving: 'Saving…',
    saved: 'Saved',
    error: 'Save failed; try again',
    conflict: 'Another tab changed this journey. Reload before saving again.',
  };

  return (
    <>
      <form className={styles.form} onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <div className={styles.field}>
          <label htmlFor="journey-title">Title</label>
          <input id="journey-title" value={journey.title} onChange={(event) => change('title', event.target.value)} placeholder="A journey title" maxLength={200} autoFocus />
        </div>
        <div className={styles.field}>
          <label htmlFor="journey-slug">Public slug</label>
          <input id="journey-slug" value={journey.slug} onChange={(event) => change('slug', event.target.value)} placeholder="journey-slug" maxLength={120} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" />
        </div>
        <div className={styles.field}>
          <label htmlFor="journey-summary">Summary <span aria-hidden="true">(optional)</span></label>
          <textarea id="journey-summary" value={journey.summary ?? ''} onChange={(event) => change('summary', event.target.value)} placeholder="A short invitation into the journey." maxLength={500} />
        </div>
        <div className={styles.formFooter}>
          <span className={styles.status} data-state={saveState}>{saveLabel[saveState]}</span>
          <button className={styles.button} type="submit" disabled={saveState === 'saving' || saveState === 'conflict'}>Save now</button>
        </div>
      </form>
      <p className={styles.eyebrow} style={{ marginTop: 48 }}>Visual canvas</p>
      <h2 className={styles.title} style={{ fontSize: 'clamp(32px, 4vw, 48px)' }}>Write, then place the frame.</h2>
      <p className={styles.lede}>Drag an image into the canvas to upload it directly, or choose an asset from the library and insert it as a photograph or gallery.</p>
      <JourneyVisualEditor
        document={journey.draftDocument}
        media={media}
        journeyId={journey._id}
        onChange={(draftDocument) => change('draftDocument', draftDocument)}
      />
      {saveState === 'conflict' && <p className={styles.notice}>Your local document is still in this browser. Copy it before reloading if you need to preserve the unsaved version.</p>}
    </>
  );
}
