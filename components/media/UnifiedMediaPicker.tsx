'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';

import styles from './UnifiedMediaPicker.module.css';

export type UnifiedMedia = {
  _id: string;
  title?: string;
  originalFilename: string;
  width: number;
  height: number;
  captureDate?: string;
  caption?: string;
  altText?: string;
  previewUrl?: string;
  playbackUrl?: string;
  status: string;
  resourceType: 'image' | 'video';
};

type UnifiedMediaPickerProps = {
  variant: 'dialog' | 'region';
  placedMediaIds: Set<string>;
  onClose: () => void;
  onInsert: (media: UnifiedMedia[]) => void;
  onUpload?: (files: File[]) => void;
  resourceType?: 'image' | 'video';
};

export function UnifiedMediaPicker({ variant, placedMediaIds, onClose, onInsert, onUpload, resourceType }: UnifiedMediaPickerProps) {
  const [query, setQuery] = useState('');
  const [collectionId, setCollectionId] = useState('');
  const [collections, setCollections] = useState<Array<{ _id: string; name: string }>>([]);
  const [items, setItems] = useState<UnifiedMedia[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<Map<string, UnifiedMedia>>(new Map());
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('loading');
  const controllerRef = useRef<AbortController | null>(null);
  const loadingRef = useRef(false);
  const queryRef = useRef('');
  const itemsRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const collectionsLoadedRef = useRef(false);

  const load = useCallback(async (cursor: string | null, reset = false) => {
    if (loadingRef.current && !reset) return;
    if (reset) controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    loadingRef.current = true;
    setState('loading');
    const params = new URLSearchParams({ limit: '24', paged: 'true' });
    if (resourceType) params.set('resourceType', resourceType);
    if (collectionId) params.set('collectionId', collectionId);
    if (queryRef.current.trim()) params.set('q', queryRef.current.trim());
    if (cursor) params.set('cursor', cursor);
    try {
      const response = await fetch(`/api/admin/media?${params.toString()}`, { signal: controller.signal });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? 'Unable to load the media library');
      const media = payload.media as UnifiedMedia[];
      if (controller.signal.aborted) return;
      setItems((current) => reset ? media : [...current, ...media.filter((item) => !current.some((known) => known._id === item._id))]);
      setNextCursor((payload.nextCursor as string | null) ?? null);
      setState('idle');
    } catch (error) {
      if ((error as DOMException).name !== 'AbortError') setState('error');
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        loadingRef.current = false;
      }
    }
  }, [resourceType, collectionId]);

  const loadCollections = useCallback(async () => {
    if (collectionsLoadedRef.current) return;
    collectionsLoadedRef.current = true;
    try {
      const response = await fetch('/api/admin/collections');
      if (!response.ok) throw new Error('Collections unavailable');
      const payload = await response.json();
      setCollections(payload.collections ?? []);
    } catch {
      collectionsLoadedRef.current = false;
    }
  }, []);

  useEffect(() => {
    setSelected(new Map());
    void load(null, true);
    return () => {
      controllerRef.current?.abort();
      controllerRef.current = null;
      loadingRef.current = false;
    };
  }, [load]);

  useEffect(() => {
    if (!nextCursor || !itemsRef.current || !sentinelRef.current || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void load(nextCursor);
    }, { root: itemsRef.current, rootMargin: '400px 0px' });
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [load, nextCursor]);

  const isDialog = variant === 'dialog';
  const searchLabel = isDialog ? 'Search media uploads' : 'Search library media';
  const addLabel = isDialog ? 'Insert selected' : 'Add selected';
  const moreLabel = isDialog ? 'Load more' : 'Load more media';
  const content = <>
    <form className={styles.search} onSubmit={(event) => { event.preventDefault(); void load(null, true); }}>
      <input aria-label={searchLabel} autoFocus={!isDialog} onChange={(event) => { queryRef.current = event.target.value; setQuery(event.target.value); }} placeholder="Search filenames, titles, captions, or tags" type="search" value={query} />
      <select aria-label="Collection" onFocus={() => void loadCollections()} onChange={(event) => setCollectionId(event.target.value)} value={collectionId}>
        <option value="">All collections</option>
        {collections.map((collection) => <option key={collection._id} value={collection._id}>{collection.name}</option>)}
      </select>
      <button disabled={state === 'loading'} type="submit">Search</button>
      {isDialog && onUpload ? <label className={styles.uploadLabel}>Upload new<input accept="image/jpeg,image/png,image/webp,image/heic,image/heif,video/mp4,video/quicktime,video/webm" hidden multiple onChange={(event) => { const files = Array.from(event.target.files ?? []); if (files.length) onUpload(files); event.currentTarget.value = ''; }} type="file" /></label> : null}
      {!isDialog ? <button onClick={onClose} type="button">Close library</button> : null}
    </form>
    {!isDialog ? <p className={styles.help}>Select media to add them in the order you choose.</p> : null}
    {state === 'error' ? <p role="alert">The media library could not load. <button onClick={() => void load(items.length ? nextCursor : null, !items.length)} type="button">Try again</button></p> : null}
    <div className={isDialog ? styles.pickerItems : styles.grid} ref={itemsRef}>
      {items.map((item) => {
        const title = item.title || item.originalFilename;
        const placed = placedMediaIds.has(item._id);
        const unavailable = item.status !== 'ready';
        const checked = selected.has(item._id);
        return <label className={isDialog ? styles.pickerItem : styles.tile} data-selected={checked || undefined} data-disabled={placed || unavailable || undefined} key={item._id}>
          {isDialog ? <input checked={checked} disabled={placed || unavailable} onChange={() => setSelected((current) => toggleSelection(current, item))} type="checkbox" value={item._id} /> : null}
          <span className={isDialog ? styles.dialogPreview : styles.preview}>
            {item.previewUrl ? <Image alt="" draggable={false} height={240} src={item.previewUrl} unoptimized width={320} /> : <span>Preview unavailable</span>}
            {!isDialog ? <input aria-label={title} checked={checked} disabled={placed || unavailable} onChange={() => setSelected((current) => toggleSelection(current, item))} type="checkbox" value={item._id} /> : null}
          </span>
          <span className={styles.metadata}><strong>{title}</strong><small>{item.resourceType === 'video' ? 'Video · ' : ''}{item.width} × {item.height}{item.captureDate ? ` · ${item.captureDate}` : ''}</small><small>{placed ? (isDialog ? 'Already on this page' : 'Already in this chapter') : unavailable ? 'Not ready' : item.status}</small></span>
        </label>;
      })}
      {!items.length && state !== 'loading' ? <p>No matching uploads.</p> : null}
      {nextCursor ? <div aria-hidden="true" className={styles.pickerSentinel} ref={sentinelRef} /> : null}
    </div>
    {state === 'loading' ? <p role="status">Loading media…</p> : null}
    <footer className={styles.footer}>
      {nextCursor ? <button disabled={state === 'loading'} onClick={() => void load(nextCursor)} type="button">{state === 'loading' ? 'Loading…' : moreLabel}</button> : <span />}
      <span>{selected.size} selected</span>
      <button disabled={!selected.size} onClick={() => onInsert(Array.from(selected.values()))} type="button">{addLabel}</button>
    </footer>
  </>;

  if (!isDialog) return <section aria-label="Media library" className={styles.picker} role="region">{content}</section>;
  return <div aria-label="Add media from library" aria-modal="true" className={styles.dialogBackdrop} role="dialog"><section className={styles.pickerDialog}>
    <header><div><p className={styles.eyebrow}>Media library</p><h2>Add media</h2></div><button aria-label="Close media library" onClick={onClose} type="button">×</button></header>
    {content}
  </section></div>;
}

function toggleSelection(current: Map<string, UnifiedMedia>, item: UnifiedMedia) {
  const next = new Map(current);
  if (next.has(item._id)) next.delete(item._id); else next.set(item._id, item);
  return next;
}
