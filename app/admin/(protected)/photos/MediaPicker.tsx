'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';

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
  resourceType: 'image' | 'video';
};

function queryUrl(query: string, cursor: string | null) {
  const params = new URLSearchParams({ limit: '24', paged: 'true' });
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
  const loadingRef = useRef(false);
  const queryRef = useRef(query);
  const itemsRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (cursor: string | null, reset = false) => {
    if (loadingRef.current && !reset) return;
    if (reset) controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    loadingRef.current = true;
    setState('loading');
    try {
      const response = await fetch(queryUrl(queryRef.current, cursor), { signal: controller.signal });
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
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        loadingRef.current = false;
      }
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setSelected(new Map());
    void load(null, true);
    return () => {
      controllerRef.current?.abort();
      controllerRef.current = null;
      loadingRef.current = false;
    };
  }, [load, open]);

  useEffect(() => {
    if (!open || !nextCursor || !itemsRef.current || !sentinelRef.current || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void load(nextCursor);
    }, { root: itemsRef.current, rootMargin: '400px 0px' });
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [load, nextCursor, open]);

  if (!open) return null;
  return <div aria-label="Add media from library" aria-modal="true" className={styles.dialogBackdrop} role="dialog">
    <section className={styles.pickerDialog}>
      <header><div><p className={styles.inspectorEyebrow}>Media library</p><h2>Add media</h2></div><button aria-label="Close media library" onClick={onClose} type="button">×</button></header>
      <form className={styles.pickerSearch} onSubmit={(event) => { event.preventDefault(); void load(null, true); }}>
        <input aria-label="Search media uploads" onChange={(event) => { queryRef.current = event.target.value; setQuery(event.target.value); }} placeholder="Search filename, title, caption, or tag" value={query} />
        <button disabled={state === 'loading'} type="submit">Search</button>
        <label className={styles.uploadLabel}>Upload new<input accept="image/jpeg,image/png,image/webp,image/heic,image/heif,video/mp4,video/quicktime,video/webm" hidden multiple onChange={(event) => { const files = Array.from(event.target.files ?? []); if (files.length) onUpload(files); event.currentTarget.value = ''; }} type="file" /></label>
      </form>
      {state === 'error' ? <p className={styles.fieldError}>The media library could not load. <button onClick={() => void load(items.length ? nextCursor : null, !items.length)} type="button">Try again</button></p> : null}
      <div className={styles.pickerItems} ref={itemsRef}>
        {items.map((item) => {
          const placed = placedMediaIds.has(item._id);
          const checked = selected.has(item._id);
          return <label className={styles.pickerItem} data-disabled={placed || undefined} key={item._id}>
            <input checked={checked} disabled={placed} onChange={() => setSelected((current) => {
              const next = new Map(current);
              if (next.has(item._id)) next.delete(item._id); else next.set(item._id, item);
              return next;
            })} type="checkbox" />
            <span><strong>{item.originalFilename}</strong><small>{item.resourceType === 'video' ? 'Video · ' : ''}{item.width}×{item.height}{item.captureDate ? ` · ${item.captureDate}` : ''}{placed ? ' · Already on this page' : ''}</small></span>
          </label>;
        })}
        {!items.length && state !== 'loading' ? <p className={styles.emptyPicker}>No matching uploads.</p> : null}
        {nextCursor ? <div aria-hidden="true" className={styles.pickerSentinel} ref={sentinelRef} /> : null}
      </div>
      <footer>
        {nextCursor ? <button disabled={state === 'loading'} onClick={() => void load(nextCursor)} type="button">{state === 'loading' ? 'Loading…' : 'Load more'}</button> : <span />}
        <span>{selected.size} selected</span>
        <button disabled={!selected.size} onClick={() => onInsert(Array.from(selected.values()))} type="button">Insert selected</button>
      </footer>
    </section>
  </div>;
}
