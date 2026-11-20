'use client';

import React, { type CSSProperties, type ReactNode } from 'react';

import { layoutColumns, type MasonryInput } from './masonry';
import styles from './photos-gallery.module.css';

type MasonryStyle = CSSProperties & Record<`--${string}`, string | number>;

const COLUMN_COUNTS: Array<2 | 3 | 4> = [2, 3, 4];

export function MasonryGrid({
  items,
  renderItem,
}: {
  items: MasonryInput[];
  renderItem: (item: MasonryInput) => ReactNode;
}) {
  const gridStyle: MasonryStyle = {};
  const itemStyles: MasonryStyle[] = items.map(() => ({}));
  for (const columns of COLUMN_COUNTS) {
    const layout = layoutColumns(items, columns);
    gridStyle[`--height-${columns}`] = layout.height;
    layout.positions.forEach((position, index) => {
      itemStyles[index][`--left-${columns}`] = position.left;
      itemStyles[index][`--top-${columns}`] = position.top;
      itemStyles[index][`--span-${columns}`] = position.span;
    });
  }

  return <div className={styles.masonryContainer}>
    <div className={styles.masonryGrid} style={gridStyle}>
      {items.map((item, index) => <div className={styles.masonryItem} data-wide={item.span === 2 || undefined} key={item.id} style={{
        ...itemStyles[index], aspectRatio: `${Math.max(1, item.width)} / ${Math.max(1, item.height)}`,
      }}>{renderItem(item)}</div>)}
    </div>
  </div>;
}
