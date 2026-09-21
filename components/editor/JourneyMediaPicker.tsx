'use client';

import Image from 'next/image';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import type { EditorMedia } from './JourneyVisualEditor';
import styles from './JourneyMediaPicker.module.css';

type LibraryMedia = {
  _id: string;
  title?: string;
  originalFilename: string;
  width: number;
  height: number;
  altText?: string;
  previewUrl?: string;
  status: string;
};

export function JourneyMediaPicker({
  placedMediaIds,
  onInsert,
  onClose,
}: {
  placedMediaIds: Set<string>;
  onInsert: (media: EditorMedia[]) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<LibraryMedia[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<Map<string, LibraryMedia>>(new Map());
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const activeRequest = useRef<AbortController | null>(null);
  const activeQuery = useRef('');

  const load = useCallback(async (cursor: string | null, search: string, reset = false) => {
    if (activeRequest.current && !reset) return;
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setState('loading');
    if (reset) {
      setItems([]);
      setNextCursor(null);
      activeQuery.current = search;
    }
    const params = new URLSearchParams({ resourceType: 'image', limit: '24', paged: 'true' });
    if (search.trim()) params.set('q', search.trim());
    if (cursor) params.set('cursor', cursor);
    try {
      const response = await fetch(`/api/admin/media?${params}`, { signal: controller.signal });
      if (!response.ok) throw new Error('Unable to load photographs');
      const payload = await response.json() as { media: LibraryMedia[]; nextCursor?: string | null };
      if (controller.signal.aborted) return;
      setItems((current) => reset ? payload.media : Array.from(new Map([...current, ...payload.media].map((asset) => [asset._id, asset])).values()));
      setNextCursor(payload.nextCursor ?? null);
      setState('ready');
    } catch {
      if (!controller.signal.aborted) setState('error');
    } finally {
      if (activeRequest.current === controller) activeRequest.current = null;
    }
  }, []);

  useEffect(() => {
    void load(null, '', true);
    return () => {
      activeRequest.current?.abort();
      activeRequest.current = null;
    };
  }, [load]);

  return (
    <section aria-label="Photograph library" className={styles.picker}>
      <form className={styles.search} onSubmit={(event) => { event.preventDefault(); void load(null, query, true); }}>
        <input aria-label="Search library photographs" autoFocus onChange={(event) => setQuery(event.target.value)} placeholder="Search titles, filenames, or tags" type="search" value={query} />
        <button type="submit">Search</button>
        <button onClick={onClose} type="button">Close library</button>
      </form>
      <p className={styles.help}>Select photographs to add them in the order you choose.</p>
      <div className={styles.grid}>
        {items.map((asset) => {
          const title = asset.title || asset.originalFilename;
          const placed = placedMediaIds.has(asset._id);
          const unavailable = asset.status !== 'ready';
          const checked = selected.has(asset._id);
          return (
            <label className={styles.tile} data-selected={checked || undefined} data-disabled={placed || unavailable || undefined} key={asset._id}>
              <span className={styles.preview}>
                {asset.previewUrl ? <Image alt="" draggable={false} fill sizes="(max-width: 720px) 40vw, 200px" src={asset.previewUrl} unoptimized /> : <span>Image unavailable</span>}
                <input aria-label={title} checked={checked} disabled={placed || unavailable} onChange={() => setSelected((current) => {
                  const next = new Map(current);
                  if (next.has(asset._id)) next.delete(asset._id); else next.set(asset._id, asset);
                  return next;
                })} type="checkbox" value={asset._id} />
              </span>
              <strong>{title}</strong>
              <small>{placed ? 'Already in this chapter' : unavailable ? 'Not ready' : `${asset.width} × ${asset.height}`}</small>
            </label>
          );
        })}
      </div>
      {state === 'loading' ? <p role="status">Loading photographs…</p> : null}
      {state === 'error' ? <p role="alert">The library could not load. <button onClick={() => void load(nextCursor, activeQuery.current, !items.length)} type="button">Try again</button></p> : null}
      {!items.length && state === 'ready' ? <p>No matching photographs.</p> : null}
      <footer className={styles.footer}>
        {nextCursor ? <button disabled={state === 'loading'} onClick={() => void load(nextCursor, activeQuery.current)} type="button">Load more photographs</button> : <span />}
        <span>{selected.size} selected</span>
        <button disabled={!selected.size} onClick={() => onInsert(Array.from(selected.values()).map((asset) => ({
          id: asset._id,
          title: asset.title || asset.originalFilename,
          width: asset.width,
          height: asset.height,
          altText: asset.altText,
          previewUrl: asset.previewUrl,
        })))} type="button">Add selected</button>
      </footer>
    </section>
  );
}
