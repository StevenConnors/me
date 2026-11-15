'use client';

import { useRef, useState, type KeyboardEvent } from 'react';

import { TRAVEL_PLACES, TRAVEL_REGION_LABELS, type TravelRegion } from '@/lib/travel/catalog';
import countryMarkers from '@/lib/travel/country-markers.json';
import { MapViewport } from './MapViewport';
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
  const labelId = `${titleId}-label`;
  const figureRef = useRef<HTMLElement>(null);
  const [active, setActive] = useState<{ region: TravelRegion; code: string; x: number; y: number } | null>(null);
  const activePlace = active?.region === region ? places.find((place) => place.code === active.code) : undefined;

  const showLabel = (code: string, target: SVGGElement, pointer?: { clientX: number; clientY: number }) => {
    const frame = figureRef.current?.getBoundingClientRect();
    if (!frame) return;
    const bounds = target.getBoundingClientRect();
    const x = pointer?.clientX ?? bounds.left + bounds.width / 2;
    const y = pointer?.clientY ?? bounds.top;
    setActive({ region, code, x: Math.max(12, Math.min(x - frame.left + 12, frame.width - 232)), y: Math.max(0, y - frame.top - 44) });
  };

  const handleKeyDown = (event: KeyboardEvent<SVGGElement>, code: string) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setActive(null);
      return;
    }
    if (!onToggle || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    onToggle(code);
  };

  return (
    <figure ref={figureRef} className={`${styles.figure} ${className ?? ''}`.trim()}>
      <MapViewport
        key={region}
        region={region}
        titleId={titleId}
        viewBox={asset.viewBox}
        onInteract={() => setActive(null)}
      >
        <title id={titleId}>{`Map of ${TRAVEL_REGION_LABELS[region].toLowerCase()}`}</title>
        <use className={styles.mapBase} href={`${asset.href}#map-base`} />
        {places.map((place) => {
          const isVisited = visited.has(place.code);
          const marker = region === 'countries' ? markers[place.code] : undefined;
          return (
            <g
              aria-label={`${place.name}, ${isVisited ? 'visited' : 'not visited'}`}
              aria-describedby={activePlace?.code === place.code ? labelId : undefined}
              aria-pressed={editable ? isVisited : undefined}
              className={styles.place}
              data-region-code={place.code}
              data-visited={isVisited ? 'true' : 'false'}
              key={place.code}
              onClick={(event) => { if (onToggle) onToggle(place.code); else showLabel(place.code, event.currentTarget, event); }}
              onKeyDown={(event) => handleKeyDown(event, place.code)}
              onPointerEnter={(event) => showLabel(place.code, event.currentTarget, event)}
              onPointerDown={(event) => showLabel(place.code, event.currentTarget, event)}
              onPointerLeave={(event) => { if (document.activeElement !== event.currentTarget) setActive(null); }}
              onFocus={(event) => showLabel(place.code, event.currentTarget)}
              onBlur={() => setActive(null)}
              role={editable ? 'button' : 'img'}
              tabIndex={0}
            >
              <use href={`${asset.href}#${place.code}`} />
              {marker ? <circle className={styles.marker} cx={marker[0]} cy={marker[1]} r="0.76" /> : null}
            </g>
          );
        })}
      </MapViewport>
      {activePlace && active ? <div id={labelId} role="tooltip" className={styles.tooltip} style={{ left: active.x, top: active.y }}>{activePlace.name}</div> : null}
      <figcaption aria-label="Map legend" className={styles.legend}>
        <span><i className={styles.visitedSwatch} />Visited</span>
        <span><i className={styles.unvisitedSwatch} />Not yet visited</span>
        {region === 'countries' ? <span><i className={styles.dotSwatch} />Small places shown as dots</span> : null}
      </figcaption>
    </figure>
  );
}
