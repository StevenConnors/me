'use client';

import type { KeyboardEvent } from 'react';

import { TRAVEL_PLACES, TRAVEL_REGION_LABELS, type TravelRegion } from '@/lib/travel/catalog';
import countryMarkers from '@/lib/travel/country-markers.json';
import styles from './TravelMap.module.css';

const MAPS: Record<TravelRegion, { href: string; viewBox: string }> = {
  countries: { href: '/travel/maps/countries.svg', viewBox: '0 0 360 180' },
  usStates: { href: '/travel/maps/us-states.svg', viewBox: '0 0 1000 720' },
  japanPrefectures: { href: '/travel/maps/japan-prefectures.svg', viewBox: '0 0 900 680' },
};

const markers: Record<string, number[]> = countryMarkers;

export function TravelMap({
  region,
  selected,
  onToggle,
  className,
}: {
  region: TravelRegion;
  selected: string[];
  onToggle?: (code: string) => void;
  className?: string;
}) {
  const places = TRAVEL_PLACES[region];
  const visited = new Set(selected);
  const editable = Boolean(onToggle);
  const asset = MAPS[region];
  const titleId = `travel-map-${region}-title`;

  const handleKeyDown = (event: KeyboardEvent<SVGGElement>, code: string) => {
    if (!onToggle || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    onToggle(code);
  };

  return (
    <figure className={`${styles.figure} ${className ?? ''}`.trim()}>
      <svg
        aria-labelledby={titleId}
        className={`${styles.map} ${styles[region]}`}
        data-travel-map
        data-travel-region={region}
        role={editable ? 'group' : 'img'}
        viewBox={asset.viewBox}
        xmlns="http://www.w3.org/2000/svg"
      >
        <title id={titleId}>{`Map of ${TRAVEL_REGION_LABELS[region].toLowerCase()}`}</title>
        <use className={styles.mapBase} href={`${asset.href}#map-base`} />
        {places.map((place) => {
          const isVisited = visited.has(place.code);
          const marker = region === 'countries' ? markers[place.code] : undefined;
          return (
            <g
              aria-hidden={editable ? undefined : 'true'}
              aria-label={editable ? `${place.name}, ${isVisited ? 'visited' : 'not visited'}` : undefined}
              aria-pressed={editable ? isVisited : undefined}
              className={styles.place}
              data-region-code={place.code}
              data-visited={isVisited ? 'true' : 'false'}
              key={place.code}
              onClick={onToggle ? () => onToggle(place.code) : undefined}
              onKeyDown={editable ? (event) => handleKeyDown(event, place.code) : undefined}
              role={editable ? 'button' : undefined}
              tabIndex={editable ? 0 : undefined}
            >
              <use href={`${asset.href}#${place.code}`} />
              {marker ? <circle cx={marker[0]} cy={marker[1]} r="0.76" /> : null}
            </g>
          );
        })}
      </svg>
      <figcaption aria-label="Map legend" className={styles.legend}>
        <span><i className={styles.visitedSwatch} />Visited</span>
        <span><i className={styles.unvisitedSwatch} />Not yet visited</span>
        {region === 'countries' ? <span><i className={styles.dotSwatch} />Small places shown as dots</span> : null}
      </figcaption>
    </figure>
  );
}
