'use client';

import { useState } from 'react';

import styles from '@/app/admin/admin.module.css';

type EditableMedia = {
  id: string;
  title?: string;
  altText?: string;
  caption?: string;
  tags: string[];
};

export function MediaMetadataForm({ media }: { media: EditableMedia }) {
  const [title, setTitle] = useState(media.title ?? '');
  const [altText, setAltText] = useState(media.altText ?? '');
  const [caption, setCaption] = useState(media.caption ?? '');
  const [tags, setTags] = useState(media.tags.join(', '));
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

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
        <label htmlFor={`media-tags-${media.id}`}>Tags</label>
        <input id={`media-tags-${media.id}`} value={tags} onChange={(event) => setTags(event.target.value)} maxLength={1_000} placeholder="travel, portrait, architecture" />
      </div>
      <div className={styles.formFooter}>
        <span className={styles.status} data-state={state === 'error' ? 'error' : state === 'saved' ? 'saved' : undefined}>{state === 'saved' ? 'Saved' : state === 'error' ? 'Could not save' : 'Used by publishing validation'}</span>
        <button className={styles.button} type="submit" disabled={state === 'saving'}>{state === 'saving' ? 'Saving…' : 'Save media details'}</button>
      </div>
    </form>
  );
}
