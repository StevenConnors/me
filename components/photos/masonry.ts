export type MasonryInput = { id: string; width: number; height: number };

const GAP = 8;

export function layoutColumns(items: MasonryInput[], columns: 2 | 3 | 4) {
  const heights = Array.from({ length: columns }, () => ({ ratio: 0, count: 0 }));
  const positions = items.map((item) => {
    const column = heights.reduce((shortest, height, index) => height.ratio < heights[shortest].ratio ? index : shortest, 0);
    const height = heights[column];
    const position = { id: item.id, column, ratio: height.ratio, count: height.count };
    height.ratio += Math.max(0.01, item.height / Math.max(1, item.width));
    height.count += 1;
    return position;
  });
  const columnWidth = `(100cqw - ${(columns - 1) * GAP}px) / ${columns}`;
  const heightAt = (ratio: number, gaps: number) => `calc((${columnWidth}) * ${ratio} + ${gaps * GAP}px)`;
  return {
    height: `max(${heights.map(({ ratio, count }) => heightAt(ratio, Math.max(0, count - 1))).join(', ')})`,
    positions: positions.map(({ id, column, ratio, count }) => ({
      id,
      column,
      left: `calc((100% + ${GAP}px) / ${columns} * ${column})`,
      top: heightAt(ratio, count),
    })),
  };
}
