'use client';

import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { TRAVEL_PLACES, type TravelPlace, type TravelRegion, type TravelSelections } from '@/lib/travel/catalog';
import { TravelMap } from '@/components/travel/TravelMap';
import styles from './travel.module.css';

type TravelRecord = { selections: TravelSelections; version: number; updatedAt: string | null };
const TABS: { region: TravelRegion; label: string }[] = [
  { region: 'countries', label: 'Countries' },
  { region: 'usStates', label: 'US states' },
  { region: 'japanPrefectures', label: 'Japan prefectures' },
];
const EMPTY: TravelSelections = { countries: [], usStates: [], japanPrefectures: [] };
const searchKey = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();

export default function TravelEditor() {
  const [region, setRegion] = useState<TravelRegion>('countries');
  const [selections, setSelections] = useState<TravelSelections>(EMPTY);
  const [version, setVersion] = useState<number | null>(null);
  const [initialSelections, setInitialSelections] = useState<TravelSelections | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<{ state: 'loading' | 'ready' | 'saving' | 'saved' | 'error'; message: string }>({ state: 'loading', message: 'Loading visited locations…' });

  const load = useCallback(async () => {
    setStatus({ state: 'loading', message: 'Loading visited locations…' });
    try {
      const response = await fetch('/api/admin/travel', { cache: 'no-store' });
      if (!response.ok) throw new Error('Unable to load visited locations. Try again.');
      const record = await response.json() as TravelRecord;
      setSelections(record.selections);
      setInitialSelections(record.selections);
      setVersion(record.version);
      setStatus({ state: 'ready', message: 'Select places you have visited, then save to update the public map.' });
    } catch (error) {
      setStatus({ state: 'error', message: error instanceof Error ? error.message : 'Unable to load visited locations. Try again.' });
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const selectedCount = useMemo(() => Object.values(selections).reduce((sum, places) => sum + places.length, 0), [selections]);
  const dirty = initialSelections !== null && JSON.stringify(selections) !== JSON.stringify(initialSelections);
  const places = useMemo(() => {
    const term = searchKey(query.trim());
    return TRAVEL_PLACES[region].filter((place: TravelPlace) => !term || [place.name, place.code, ...(place.aliases ?? [])].some((value) => searchKey(value).includes(term)));
  }, [query, region]);

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, current: TravelRegion) => {
    const regions = TABS.map((tab) => tab.region);
    const currentIndex = regions.indexOf(current);
    const nextIndex = event.key === 'ArrowRight' ? (currentIndex + 1) % regions.length
      : event.key === 'ArrowLeft' ? (currentIndex + regions.length - 1) % regions.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? regions.length - 1 : -1;
    if (nextIndex < 0) return;
    event.preventDefault();
    const next = regions[nextIndex];
    setRegion(next);
    setQuery('');
    document.getElementById(`tab-${next}`)?.focus();
  };

  const toggle = (code: string) => {
    setSelections((current) => {
      const selected = current[region];
      return { ...current, [region]: selected.includes(code) ? selected.filter((item) => item !== code) : [...selected, code] };
    });
    setStatus({ state: 'ready', message: 'Unsaved changes' });
  };

  const save = async () => {
    if (version === null || !dirty || status.state === 'saving') return;
    const snapshot = selections;
    setStatus({ state: 'saving', message: 'Saving travel…' });
    try {
      const response = await fetch('/api/admin/travel', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selections: snapshot, expectedVersion: version }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        if (response.status === 409) throw new Error('These locations changed in another session. Reload the latest list before saving. Your edits are still here.');
        throw new Error(payload?.error?.message ?? 'Unable to save. Your edits are still here. Try again.');
      }
      const saved = await response.json() as TravelRecord;
      setSelections(saved.selections);
      setInitialSelections(saved.selections);
      setVersion(saved.version);
      setStatus({ state: 'saved', message: 'Travel saved' });
    } catch (error) {
      setStatus({ state: 'error', message: error instanceof Error ? error.message : 'Unable to save. Your edits are still here.' });
    }
  };

  const clearAll = () => {
    setSelections(EMPTY);
    setStatus({ state: 'ready', message: 'Unsaved changes' });
  };

  return (
    <section className={styles.editor}>
      <p className={styles.eyebrow}>Map settings</p>
      <div className={styles.headingRow}><div><h1 className={styles.title}>Visited places</h1><p className={styles.lede}>Choose the countries, US states, and Japanese prefectures you’ve visited. Saving updates the public map right away.</p></div><div className={styles.count} aria-label={`${selectedCount} places selected`}><strong>{selectedCount}</strong><span>selected</span></div></div>
      <div className={styles.toolbar}>
        <div className={styles.tabs} role="tablist" aria-label="Place type">
          {TABS.map((tab) => <button key={tab.region} type="button" role="tab" id={`tab-${tab.region}`} aria-selected={region === tab.region} aria-label={tab.label} aria-controls="travel-panel" tabIndex={region === tab.region ? 0 : -1} className={styles.tab} onKeyDown={(event) => handleTabKeyDown(event, tab.region)} onClick={() => { setRegion(tab.region); setQuery(''); }}>{tab.label}<span>{selections[tab.region].length}</span></button>)}
        </div>
        <button type="button" className={styles.clearButton} disabled={selectedCount === 0 || version === null || status.state === 'saving'} onClick={clearAll}>Clear all</button>
      </div>
      <div className={styles.columns}>
        <section id="travel-panel" role="tabpanel" aria-labelledby={`tab-${region}`} className={styles.placePanel}>
          <label className={styles.searchLabel} htmlFor="travel-search">Search places</label>
          <input id="travel-search" className={styles.search} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Type a place name" disabled={version === null || status.state === 'saving'} />
          <p className={styles.help}>Select places from the list or tap them on the map. Changes stay here until you save.</p>
          <div className={styles.placeList}>
            {places.length ? places.map((place) => <label className={styles.place} key={place.code}><input type="checkbox" checked={selections[region].includes(place.code)} onChange={() => toggle(place.code)} disabled={version === null || status.state === 'saving'} /><span>{place.name}</span></label>) : <p className={styles.empty}>No places match “{query}”.</p>}
          </div>
        </section>
        <section className={styles.mapPanel} aria-label={`${TABS.find((tab) => tab.region === region)?.label} map`}>
          <TravelMap key={region} region={region} selected={selections[region]} onToggle={version !== null && status.state !== 'saving' ? toggle : undefined} className={styles.map} />
          <p className={styles.mapHint}>Tap a place on the map to mark it visited.</p>
        </section>
      </div>
      <footer className={styles.footer}>
        <p className={styles.status} data-state={status.state} role="status" aria-live="polite">{status.message}{dirty && status.state === 'error' ? ' · Unsaved changes' : ''}</p>
        <div className={styles.actions}>{status.state === 'error' && version === null ? <button type="button" className={styles.secondaryButton} onClick={() => void load()}>Try again</button> : null}{status.state === 'error' && version !== null ? <button type="button" className={styles.secondaryButton} onClick={() => void load()}>Reload latest</button> : null}<button type="button" className={styles.saveButton} onClick={() => void save()} disabled={!dirty || version === null || status.state === 'saving'}>Save travel</button></div>
      </footer>
    </section>
  );
}
