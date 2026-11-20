export type MasonryInput = { id: string; width: number; height: number; span?: 1 | 2 };

const GAP = 8;

/**
 * Column state is a height in column widths (`ratio`) plus a number of gaps,
 * so positions stay valid at any container width. A two-column item starts
 * under the taller of the lowest adjacent pair and lifts both columns.
 */
export function layoutColumns(items: MasonryInput[], columns: 2 | 3 | 4) {
  const heights = Array.from({ length: columns }, () => ({ ratio: 0, gaps: 0 }));
  const positions = items.map((item) => {
    const span = item.span === 2 ? 2 : 1;
    let column = 0;
    for (let start = 1; start + span <= columns; start += 1) {
      if (Math.max(...heights.slice(start, start + span).map((height) => height.ratio))
        < Math.max(...heights.slice(column, column + span).map((height) => height.ratio))) column = start;
    }
    const top = heights.slice(column, column + span).reduce((highest, height) => height.ratio > highest.ratio ? height : highest);
    const position = { id: item.id, column, span, ratio: top.ratio, gaps: top.gaps };
    const ratio = Math.max(0.01, item.height / Math.max(1, item.width));
    const next = { ratio: top.ratio + ratio * span, gaps: top.gaps + ratio * (span - 1) + 1 };
    for (let offset = 0; offset < span; offset += 1) heights[column + offset] = { ...next };
    return position;
  });
  const columnWidth = `(100cqw - ${(columns - 1) * GAP}px) / ${columns}`;
  const heightAt = (ratio: number, gaps: number) => `calc((${columnWidth}) * ${ratio} + ${gaps * GAP}px)`;
  return {
    height: `max(${heights.map(({ ratio, gaps }) => heightAt(ratio, Math.max(0, gaps - 1))).join(', ')})`,
    positions: positions.map(({ id, column, span, ratio, gaps }) => ({
      id,
      column,
      span,
      left: `calc((100% + ${GAP}px) / ${columns} * ${column})`,
      top: heightAt(ratio, gaps),
    })),
  };
}
