'use client';

import { useEffect, useRef, useState } from 'react';

import styles from './photos-workspace.module.css';

export type PickerMedia = {
  _id: string;
  originalFilename: string;
  width: number;
  height: number;
  captureDate?: string;
  caption?: string;
  altText?: string;
  status: string;
};

function queryUrl(query: string, cursor: string | null) {
  const params = new URLSearchParams({ limit: '24', resourceType: 'image' });
  if (query.trim()) params.set('q', query.trim());
  if (cursor) params.set('cursor', cursor);
  return `/api/admin/media?${params.toString()}`;
}

export function MediaPicker({
  open,
  placedMediaIds,
  onClose,
  onInsert,
  onUpload,
}: {
  open: boolean;
  placedMediaIds: Set<string>;
  onClose: () => void;
  onInsert: (media: PickerMedia[]) => void;
  onUpload: (files: File[]) => void;
}) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<PickerMedia[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<Map<string, PickerMedia>>(new Map());
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const controllerRef = useRef<AbortController | null>(null);

  async function load(cursor: string | null, reset = false) {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState('loading');
    try {
      const response = await fetch(queryUrl(query, cursor), { signal: controller.signal });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? 'Unable to load the media library');
      const media = payload.media as PickerMedia[];
      setItems((current) => reset ? media : [...current, ...media.filter((item) => !current.some((known) => known._id === item._id))]);
      setNextCursor((payload.nextCursor as string | null) ?? null);
      setState('idle');
    } catch (error) {
      if ((error as DOMException).name === 'AbortError') return;
      console.error(error);
      setState('error');
    }
  }

  useEffect(() => {
    if (!open) return;
    setSelected(new Map());
    void load(null, true);
    return () => controllerRef.current?.abort();
  // Open is the intentional picker lifecycle boundary.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;
  return <div aria-label="Add photos from media library" aria-modal="true" className={styles.dialogBackdrop} role="dialog">
    <section className={styles.pickerDialog}>
      <header><div><p className={styles.inspectorEyebrow}>Media library</p><h2>Add photos</h2></div><button aria-label="Close media library" onClick={onClose} type="button">×</button></header>
      <form className={styles.pickerSearch} onSubmit={(event) => { event.preventDefault(); void load(null, true); }}>
        <input aria-label="Search image uploads" onChange={(event) => setQuery(event.target.value)} placeholder="Search filename, title, caption, or tag" value={query} />
        <button disabled={state === 'loading'} type="submit">Search</button>
        <label className={styles.uploadLabel}>Upload new<input accept="image/jpeg,image/png,image/webp,image/heic,image/heif" hidden multiple onChange={(event) => { const files = Array.from(event.target.files ?? []); if (files.length) onUpload(files); event.currentTarget.value = ''; }} type="file" /></label>
      </form>
      {state === 'error' ? <p className={styles.fieldError}>The media library could not load. <button onClick={() => void load(items.length ? nextCursor : null, !items.length)} type="button">Try again</button></p> : null}
      <div className={styles.pickerItems}>
        {items.map((item) => {
          const placed = placedMediaIds.has(item._id);
          const checked = selected.has(item._id);
          return <label className={styles.pickerItem} data-disabled={placed || undefined} key={item._id}>
            <input checked={checked} disabled={placed} onChange={() => setSelected((current) => {
              const next = new Map(current);
              if (next.has(item._id)) next.delete(item._id); else next.set(item._id, item);
              return next;
            })} type="checkbox" />
            <span><strong>{item.originalFilename}</strong><small>{item.width}×{item.height}{item.captureDate ? ` · ${item.captureDate}` : ''}{placed ? ' · Already on this page' : ''}</small></span>
          </label>;
        })}
        {!items.length && state !== 'loading' ? <p className={styles.emptyPicker}>No matching image uploads.</p> : null}
      </div>
      <footer>
        {nextCursor ? <button disabled={state === 'loading'} onClick={() => void load(nextCursor)} type="button">{state === 'loading' ? 'Loading…' : 'Load more'}</button> : <span />}
        <span>{selected.size} selected</span>
        <button disabled={!selected.size} onClick={() => onInsert(Array.from(selected.values()))} type="button">Insert selected</button>
      </footer>
    </section>
  </div>;
}
