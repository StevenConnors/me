'use client';

import React, { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';

import { calculateMasonryLayout, type MasonryInput } from './masonry';
import styles from './photos-gallery.module.css';

const GAP = 8;
const ROW_UNIT = 8;

function columnCount(width: number) {
  if (width <= 700) return 2;
  if (width <= 1100) return 3;
  return 4;
}

export function MasonryGrid({
  items,
  renderItem,
}: {
  items: MasonryInput[];
  renderItem: (item: MasonryInput) => ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = rootRef.current;
    if (!element) return;
    const update = () => setWidth(element.clientWidth);
    update();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const positions = useMemo(() => {
    if (!width) return [];
    return calculateMasonryLayout(items, {
      columns: columnCount(width),
      containerWidth: width,
      gap: GAP,
      rowUnit: ROW_UNIT,
    });
  }, [items, width]);
  const positionsById = useMemo(() => new Map(positions.map((position) => [position.id, position])), [positions]);
  const columns = columnCount(width || 1101);

  return <div className={styles.masonryGrid} ref={rootRef} style={{ gridAutoRows: `${ROW_UNIT}px`, gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
    {items.map((item) => {
      const position = positionsById.get(item.id);
      return <div className={styles.masonryItem} key={item.id} style={position ? {
        gridColumn: position.column,
        gridRowStart: position.rowStart,
        gridRowEnd: `span ${position.rowSpan}`,
      } : undefined}>{renderItem(item)}</div>;
    })}
  </div>;
}
