'use client';

import { useMemo, useState, type KeyboardEvent } from 'react';
import { TRAVEL_PLACES, TRAVEL_REGION_LABELS, type TravelRegion, type TravelSelections } from '@/lib/travel/catalog';
import { TravelMap } from '@/components/travel/TravelMap';
import styles from './travel-overview.module.css';

const REGIONS: TravelRegion[] = ['countries', 'usStates', 'japanPrefectures'];
const LIMITS: Record<TravelRegion, number> = { countries: 249, usStates: 50, japanPrefectures: 47 };

export function TravelOverview({ selections, updatedAt, failed = false }: {
  selections: TravelSelections;
  updatedAt: string | null;
  failed?: boolean;
}) {
  const [activeRegion, setActiveRegion] = useState<TravelRegion>('countries');
  const visited = useMemo(() => Object.fromEntries(REGIONS.map((region) => {
    const known = new Set(TRAVEL_PLACES[region].map((place) => place.code));
    const selected = new Set(selections[region]);
    return [region, TRAVEL_PLACES[region].filter((place) => known.has(place.code) && selected.has(place.code))];
  })) as Record<TravelRegion, typeof TRAVEL_PLACES[TravelRegion]>, [selections]);
  const activeCount = visited[activeRegion].length;
  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, current: TravelRegion) => {
    const currentIndex = REGIONS.indexOf(current);
    const nextIndex = event.key === 'ArrowRight' ? (currentIndex + 1) % REGIONS.length
      : event.key === 'ArrowLeft' ? (currentIndex + REGIONS.length - 1) % REGIONS.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? REGIONS.length - 1 : -1;
    if (nextIndex < 0) return;
    event.preventDefault();
    const next = REGIONS[nextIndex];
    setActiveRegion(next);
    document.getElementById(`travel-tab-${next}`)?.focus();
  };

  return (
    <article className={styles.page}>
      <header className={styles.intro}>
        <p className={styles.kicker}>A personal atlas</p>
        <h1>Travel</h1>
        <p className={styles.description}>Places I’ve had the chance to visit.</p>
      </header>
      {failed ? <p className={styles.notice} role="status">Visited places are temporarily unavailable. Please try again later.</p> : activeCount === 0 ? <p className={styles.notice} role="status">No places visited yet.</p> : null}
      {!failed ? <>
      <section className={styles.summary} aria-label="Visited place totals">
        <p className={styles.total}><strong data-travel-count>{activeCount}</strong><span>{TRAVEL_REGION_LABELS[activeRegion]} visited</span></p>
        <div className={styles.breakdown}>{REGIONS.map((region) => <p key={region}><span>{TRAVEL_REGION_LABELS[region]}</span><strong>{visited[region].length}<small> / {LIMITS[region]}</small></strong></p>)}</div>
      </section>
      <div className={styles.tabs} role="tablist" aria-label="Travel map region">
        {REGIONS.map((region) => <button key={region} type="button" role="tab" id={`travel-tab-${region}`} aria-label={TRAVEL_REGION_LABELS[region]} aria-selected={activeRegion === region} aria-controls="travel-map-panel" tabIndex={activeRegion === region ? 0 : -1} className={styles.tab} onKeyDown={(event) => handleTabKeyDown(event, region)} onClick={() => setActiveRegion(region)}>{TRAVEL_REGION_LABELS[region]}</button>)}
      </div>
      <section className={styles.mapSection} role="tabpanel" id="travel-map-panel" aria-labelledby={`travel-tab-${activeRegion}`}>
        <div className={styles.map}><TravelMap key={activeRegion} region={activeRegion} selected={visited[activeRegion].map((place) => place.code)} /></div>
      </section>
      <section className={styles.visited} aria-labelledby="visited-places-heading">
        <div className={styles.visitedHeading}><h2 id="visited-places-heading">Visited places</h2><span>{visited[activeRegion].length}</span></div>
        <ul aria-label="Visited places" className={styles.placeList}>
          {visited[activeRegion].map((place) => <li key={place.code}><span>{place.name}</span><span aria-hidden="true">{place.code}</span></li>)}
          {!failed && visited[activeRegion].length === 0 ? <li className={styles.listEmpty}>No places visited yet.</li> : null}
        </ul>
        {updatedAt && !failed ? <p className={styles.updated}>Updated {new Date(updatedAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</p> : null}
      </section>
      </> : null}
    </article>
  );
}
