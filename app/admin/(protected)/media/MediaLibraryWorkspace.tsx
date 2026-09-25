'use client';

import Image from 'next/image';
import React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { MediaMetadataForm } from './MediaMetadataForm';
import { MediaUploadPanel } from './MediaUploadPanel';
import styles from './media-library.module.css';

type Asset = {
  _id: string; title?: string; originalFilename: string; previewUrl?: string;
  resourceType: 'image' | 'video'; width: number; height: number; format: string;
  status: string; captureDate?: string; altText?: string; caption?: string; tags: string[];
};
type Collection = { _id: string; name: string; mediaCount: number; mediaAssetIds: string[] };

function errorMessage(payload: unknown, fallback: string) {
  const value = (payload as { error?: { message?: unknown } } | null)?.error?.message;
  return typeof value === 'string' && value ? value : fallback;
}

export function MediaLibraryWorkspace() {
  const [items, setItems] = useState<Asset[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('');
  const [collectionId, setCollectionId] = useState('');
  const [targetCollection, setTargetCollection] = useState('');
  const [newCollection, setNewCollection] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [cursor, setCursor] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [importing, setImporting] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingMoreRef = useRef(false);

  const loadCollections = useCallback(async () => {
    const response = await fetch('/api/admin/collections');
    const payload = await response.json();
    if (!response.ok) throw new Error(errorMessage(payload, 'Unable to load collections'));
    setCollections(payload.collections as Collection[]);
  }, []);

  const load = useCallback(async (next: string | null, append: boolean, signal?: AbortSignal) => {
    if (append && loadingMoreRef.current) return;
    if (append) loadingMoreRef.current = true;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ paged: 'true', limit: '24' });
      if (search.trim()) params.set('q', search.trim());
      if (kind) params.set('resourceType', kind);
      if (collectionId) params.set('collectionId', collectionId);
      if (next) params.set('cursor', next);
      const response = await fetch(`/api/admin/media?${params}`, { signal });
      const payload = await response.json();
      if (!response.ok) throw new Error(errorMessage(payload, 'Unable to load media'));
      if (signal?.aborted) return;
      const page = payload.media as Asset[];
      setItems((current) => append ? [...current, ...page.filter((asset) => !current.some((known) => known._id === asset._id))] : page);
      setCursor(payload.nextCursor ?? null);
      setTotal(typeof payload.total === 'number' ? payload.total : null);
    } catch (cause) {
      if ((cause as DOMException).name !== 'AbortError') setError(cause instanceof Error ? cause.message : 'Unable to load media');
    } finally {
      if (append) loadingMoreRef.current = false;
      if (!signal?.aborted) setLoading(false);
    }
  }, [search, kind, collectionId]);

  useEffect(() => {
    const controller = new AbortController();
    void load(null, false, controller.signal);
    setSelected(new Set());
    return () => controller.abort();
  }, [load, refresh]);
  useEffect(() => { void loadCollections().catch((cause) => setError(cause instanceof Error ? cause.message : 'Unable to load collections')); }, [loadCollections]);
  useEffect(() => {
    if (!cursor || !sentinelRef.current || typeof IntersectionObserver === 'undefined' || error) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void load(cursor, true);
    }, { rootMargin: '600px 0px' });
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [cursor, error, load]);

  async function createCollection(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newCollection.trim()) return;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/admin/collections', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newCollection.trim() }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(errorMessage(payload, 'Unable to create collection'));
      setNewCollection(''); setTargetCollection(payload.collection._id);
      await loadCollections();
      setNotice(`Created ${payload.collection.name}.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to create collection'); }
    finally { setBusy(false); }
  }

  async function addSelected() {
    if (!targetCollection || !selected.size) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/admin/collections/${targetCollection}/media`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mediaAssetIds: Array.from(selected) }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(errorMessage(payload, 'Unable to add media'));
      const count = selected.size;
      setSelected(new Set());
      await loadCollections();
      setNotice(`${count} asset${count === 1 ? '' : 's'} added to collection.`);
      if (collectionId) setRefresh((value) => value + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to add media'); }
    finally { setBusy(false); }
  }

  async function removeFromCollection(mediaId: string, source: Collection) {
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/admin/collections/${source._id}/media`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaAssetIds: [mediaId] }),
      });
      if (!response.ok) throw new Error(errorMessage(await response.json(), 'Unable to remove media'));
      await loadCollections();
      setRefresh((value) => value + 1);
      setNotice(`Removed from ${source.name}.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to remove media'); }
    finally { setBusy(false); }
  }

  async function importCloudinaryVideos() {
    setImporting(true); setError(''); setNotice('');
    let cursor: string | null = null;
    let imported = 0;
    let examined = 0;
    const seen = new Set<string>();
    try {
      do {
        const response = await fetch('/api/admin/media/import-cloudinary-videos', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cursor ? { cursor } : {}),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(errorMessage(payload, 'Unable to import Cloudinary videos'));
        imported += payload.imported as number;
        examined += payload.examined as number;
        cursor = payload.nextCursor as string | null;
        if (cursor && seen.has(cursor)) throw new Error('Cloudinary returned a repeated page');
        if (cursor) seen.add(cursor);
        setNotice(`Cloudinary videos: ${imported} imported from ${examined} checked…`);
      } while (cursor);
      setNotice(`Cloudinary videos: ${imported} imported from ${examined} checked.`);
      setRefresh((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to import Cloudinary videos');
    } finally { setImporting(false); }
  }

  return <div className={styles.workspace}>
    <MediaUploadPanel onUploaded={() => { setSearch(''); setQuery(''); setCollectionId(''); setRefresh((value) => value + 1); }} />
    <section className={styles.collections} aria-label="Cloudinary imports">
      <h2>Already in Cloudinary?</h2>
      <p>Register existing uploaded videos so they can be chosen for journeys. Existing library details are preserved.</p>
      <button disabled={importing} onClick={() => void importCloudinaryVideos()} type="button">{importing ? 'Importing videos…' : 'Import Cloudinary videos'}</button>
    </section>
    <section aria-label="Collections" className={styles.collections}>
      <h2>Collections</h2>
      <p>Group originals by trip, event, or subject. The same photo can belong to several collections.</p>
      <form onSubmit={(event) => void createCollection(event)}>
        <input aria-label="New collection name" maxLength={120} onChange={(event) => setNewCollection(event.target.value)} placeholder="e.g. Egypt, Ise, Glass" value={newCollection} />
        <button disabled={busy || !newCollection.trim()} type="submit">Create collection</button>
      </form>
      <div className={styles.chips}>{collections.map((collection) => <button aria-pressed={collectionId === collection._id} key={collection._id} onClick={() => setCollectionId(collectionId === collection._id ? '' : collection._id)} type="button">{collection.name} <span>{collection.mediaCount}</span></button>)}</div>
    </section>
    <section aria-label="Media library" className={styles.library}>
      <header className={styles.header}>
        <div><h2>Library</h2><p>{total === null ? 'Loading media…' : `${total} ${total === 1 ? 'asset' : 'assets'} in this view`}</p></div>
        <form role="search" onSubmit={(event) => { event.preventDefault(); setSearch(query); }}>
          <input aria-label="Search media" onChange={(event) => setQuery(event.target.value)} placeholder="Filename, title, caption, or tag" type="search" value={query} />
          <button type="submit">Search</button>
        </form>
      </header>
      <div className={styles.filters}>
        <label>Filter by type<select onChange={(event) => setKind(event.target.value)} value={kind}><option value="">Images and videos</option><option value="image">Images</option><option value="video">Videos</option></select></label>
        <label>Filter by collection<select aria-label="Filter by collection" onChange={(event) => setCollectionId(event.target.value)} value={collectionId}><option value="">All collections</option>{collections.map((collection) => <option key={collection._id} value={collection._id}>{collection.name}</option>)}</select></label>
        <span>{selected.size} selected</span>
      </div>
      {selected.size ? <div className={styles.batch}>
        <label>Add selected to collection<select aria-label="Add selected to collection" onChange={(event) => setTargetCollection(event.target.value)} value={targetCollection}><option value="">Choose collection</option>{collections.map((collection) => <option key={collection._id} value={collection._id}>{collection.name}</option>)}</select></label>
        <button disabled={busy || !targetCollection} onClick={() => void addSelected()} type="button">Add to collection</button>
        <button onClick={() => setSelected(new Set())} type="button">Clear selection</button>
      </div> : null}
      {notice ? <p className={styles.success} role="status">{notice}</p> : null}
      {error ? <p className={styles.error} role="alert">{error} <button onClick={() => setRefresh((value) => value + 1)} type="button">Retry</button></p> : null}
      <div className={styles.grid}>{items.map((asset) => <article aria-label={asset.originalFilename} className={styles.card} key={asset._id}>
        <div className={styles.image}>{asset.previewUrl ? <Image alt="" fill sizes="(max-width: 700px) 90vw, 260px" src={asset.previewUrl} unoptimized /> : <span>No preview</span>}</div>
        <div className={styles.cardBody}>
          <label className={styles.select}><input aria-label={`Select ${asset.originalFilename}`} checked={selected.has(asset._id)} onChange={() => setSelected((current) => { const next = new Set(current); if (next.has(asset._id)) next.delete(asset._id); else next.add(asset._id); return next; })} type="checkbox" /> Select</label>
          <strong>{asset.title || asset.originalFilename}</strong>
          <small>{asset.width} × {asset.height} · {asset.format.toUpperCase()} · {asset.status}</small>
          <div className={styles.assetCollections}>{collections.filter((collection) => collection.mediaAssetIds.includes(asset._id)).map((collection) => <span key={collection._id}>{collection.name}<button aria-label={`Remove from ${collection.name}`} disabled={busy} onClick={() => void removeFromCollection(asset._id, collection)} type="button">×</button></span>)}</div>
          <details className={styles.details}><summary>Edit details</summary><MediaMetadataForm media={{ id: asset._id, title: asset.title, caption: asset.caption, altText: asset.altText, captureDate: asset.captureDate, tags: asset.tags }} /></details>
        </div>
      </article>)}</div>
      {!items.length && !loading && !error ? <p className={styles.empty}>No matching media. Upload media or change your filters.</p> : null}
      {cursor ? <div className={styles.more} ref={sentinelRef}>
        {loading ? <span role="status">Loading more media…</span> : null}
        {error ? <button onClick={() => void load(cursor, true)} type="button">Try again</button> : <button disabled={loading} onClick={() => void load(cursor, true)} type="button">Load more</button>}
      </div> : null}
    </section>
  </div>;
}
