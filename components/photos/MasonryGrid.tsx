'use client';

import React, { type CSSProperties, type ReactNode } from 'react';

import { type MasonryInput } from './masonry';
import styles from './photos-gallery.module.css';

type MasonryStyle = CSSProperties & Record<`--${string}`, string | number>;

const COLUMN_COUNTS = [2, 3, 4];
const GAP = 8;

function layoutColumns(items: MasonryInput[], columns: number) {
  const heights = Array.from({ length: columns }, () => ({ ratio: 0, count: 0 }));
  const positions = items.map((item) => {
    const column = heights.reduce((shortest, height, index) => height.ratio < heights[shortest].ratio ? index : shortest, 0);
    const height = heights[column];
    const position = { column, ratio: height.ratio, count: height.count };
    height.ratio += Math.max(0.01, item.height / Math.max(1, item.width));
    height.count += 1;
    return position;
  });
  const columnWidth = `(100cqw - ${(columns - 1) * GAP}px) / ${columns}`;
  const heightAt = (ratio: number, gaps: number) => `calc((${columnWidth}) * ${ratio} + ${gaps * GAP}px)`;
  return {
    height: `max(${heights.map(({ ratio, count }) => heightAt(ratio, Math.max(0, count - 1))).join(', ')})`,
    positions: positions.map(({ column, ratio, count }) => ({
      left: `calc((100% + ${GAP}px) / ${columns} * ${column})`,
      top: heightAt(ratio, count),
    })),
  };
}

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
    });
  }

  return <div className={styles.masonryContainer}>
    <div className={styles.masonryGrid} style={gridStyle}>
      {items.map((item, index) => <div className={styles.masonryItem} key={item.id} style={{
        ...itemStyles[index], aspectRatio: `${Math.max(1, item.width)} / ${Math.max(1, item.height)}`,
      }}>{renderItem(item)}</div>)}
    </div>
  </div>;
}
