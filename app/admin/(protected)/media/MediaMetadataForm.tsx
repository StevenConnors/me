'use client';

import { useState } from 'react';

import styles from '@/app/admin/admin.module.css';

type EditableMedia = {
  id: string;
  title?: string;
  altText?: string;
  caption?: string;
  captureDate?: string;
  tags: string[];
};

export function MediaMetadataForm({ media }: { media: EditableMedia }) {
  const [title, setTitle] = useState(media.title ?? '');
  const [altText, setAltText] = useState(media.altText ?? '');
  const [caption, setCaption] = useState(media.caption ?? '');
  const [captureDate, setCaptureDate] = useState(media.captureDate ?? '');
  const [tags, setTags] = useState(media.tags.join(', '));
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [deleteState, setDeleteState] = useState<'idle' | 'deleting' | 'error'>('idle');
  const [deleteError, setDeleteError] = useState('');

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState('saving');
    try {
      const response = await fetch(`/api/admin/media/${media.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim() || null,
          altText: altText.trim() || null,
          caption: caption.trim() || null,
          captureDate: captureDate || null,
          tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        }),
      });
      if (!response.ok) throw new Error('Unable to save media details');
      setState('saved');
    } catch (error) {
      console.error(error);
      setState('error');
    }
  }

  async function remove() {
    if (!window.confirm('Delete this media permanently? It cannot be restored. Images used by a journey are protected.')) return;
    setDeleteState('deleting');
    setDeleteError('');
    try {
      const response = await fetch(`/api/admin/media/${media.id}`, { method: 'DELETE' });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error?.message ?? 'Unable to delete this media');
      }
      window.location.reload();
    } catch (error) {
      console.error(error);
      setDeleteState('error');
      setDeleteError(error instanceof Error ? error.message : 'Unable to delete this media');
    }
  }

  return (
    <form className={styles.mediaMetadata} onSubmit={(event) => void save(event)}>
      <div className={styles.field}>
        <label htmlFor={`media-title-${media.id}`}>Display title</label>
        <input id={`media-title-${media.id}`} value={title} onChange={(event) => setTitle(event.target.value)} maxLength={500} placeholder="Optional short name" />
      </div>
      <div className={styles.field}>
        <label htmlFor={`media-alt-${media.id}`}>Alt text</label>
        <input id={`media-alt-${media.id}`} value={altText} onChange={(event) => setAltText(event.target.value)} maxLength={1_000} placeholder="Describe the photograph for readers who cannot see it" />
      </div>
      <div className={styles.field}>
        <label htmlFor={`media-caption-${media.id}`}>Default caption</label>
        <textarea id={`media-caption-${media.id}`} value={caption} onChange={(event) => setCaption(event.target.value)} maxLength={2_000} placeholder="Optional caption for reused placements" />
      </div>
      <div className={styles.field}>
        <label htmlFor={`media-date-${media.id}`}>Date taken</label>
        <input id={`media-date-${media.id}`} type="date" value={captureDate} onChange={(event) => setCaptureDate(event.target.value)} />
        <span className={styles.fieldHint}>Imported dates may be upload dates. Verify this against the original photo before using it for chronology.</span>
      </div>
      <div className={styles.field}>
        <label htmlFor={`media-tags-${media.id}`}>Tags</label>
        <input id={`media-tags-${media.id}`} value={tags} onChange={(event) => setTags(event.target.value)} maxLength={1_000} placeholder="travel, portrait, architecture" />
      </div>
      <div className={styles.formFooter}>
        <span className={styles.status} data-state={state === 'error' ? 'error' : state === 'saved' ? 'saved' : undefined}>{state === 'saved' ? 'Saved' : state === 'error' ? 'Could not save' : 'Used by publishing validation'}</span>
        <span className={styles.actionGroup}>
          <button className={styles.quietButton} type="button" onClick={() => void remove()} disabled={deleteState === 'deleting'}>{deleteState === 'deleting' ? 'Deleting…' : 'Delete media'}</button>
          <button className={styles.button} type="submit" disabled={state === 'saving' || deleteState === 'deleting'}>{state === 'saving' ? 'Saving…' : 'Save media details'}</button>
        </span>
      </div>
      {deleteState === 'error' ? <p className={styles.deleteError} role="alert">{deleteError}</p> : null}
    </form>
  );
}
