export type MasonryInput = { id: string; width: number; height: number };
export type MasonryPosition = { id: string; column: number; rowStart: number; rowSpan: number };

/**
 * Deterministically places each canonical item in the shortest column. The
 * input order is never changed, so appending later items cannot move earlier
 * placements at a stable container width.
 */
export function calculateMasonryLayout(
  items: MasonryInput[],
  options: { columns: number; containerWidth: number; gap: number; rowUnit: number },
): MasonryPosition[] {
  const columns = Math.max(1, Math.floor(options.columns));
  const width = Math.max(1, options.containerWidth);
  const gap = Math.max(0, options.gap);
  const rowUnit = Math.max(1, options.rowUnit);
  const columnWidth = Math.max(1, (width - gap * (columns - 1)) / columns);
  const heights = Array.from({ length: columns }, () => 0);

  return items.map((item) => {
    const column = heights.reduce((shortest, height, index) => height < heights[shortest] ? index : shortest, 0);
    const ratio = Math.max(1 / 100, item.height / Math.max(1, item.width));
    const renderedHeight = columnWidth * ratio;
    const rowSpan = Math.max(1, Math.ceil((renderedHeight + gap) / (rowUnit + gap)));
    const rowStart = heights[column] + 1;
    heights[column] += rowSpan;
    return { id: item.id, column: column + 1, rowStart, rowSpan };
  });
}
