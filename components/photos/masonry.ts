export type MasonryInput = { id: string; width: number; height: number; span?: 1 | 2 };

const GAP = 8;

type Term = { ratio: number; gaps: number };

/** Drops terms that can never be the tallest: another term is at least as tall at every width. */
function envelope(terms: Term[]): Term[] {
  return terms.filter((term, index) => !terms.some((other, otherIndex) => otherIndex !== index
    && other.ratio >= term.ratio && other.gaps >= term.gaps && (other.ratio > term.ratio || other.gaps > term.gaps || otherIndex < index)));
}

/**
 * A column's height is the largest of its terms, each a height in column
 * widths (`ratio`) plus a number of gaps, so positions stay valid at any
 * container width. A two-column item starts below both columns and lifts both.
 */
export function layoutColumns(items: MasonryInput[], columns: 2 | 3 | 4) {
  const heights: Term[][] = Array.from({ length: columns }, () => [{ ratio: 0, gaps: 0 }]);
  const tallest = (terms: Term[]) => Math.max(...terms.map((term) => term.ratio));
  const positions = items.map((item) => {
    const span = item.span === 2 ? 2 : 1;
    let column = 0;
    const pairHeight = (start: number) => Math.max(...heights.slice(start, start + span).map(tallest));
    for (let start = 1; start + span <= columns; start += 1) {
      if (pairHeight(start) < pairHeight(column)) column = start;
    }
    const top = envelope(heights.slice(column, column + span).flat());
    const ratio = Math.max(0.01, item.height / Math.max(1, item.width));
    const next = top.map((term) => ({ ratio: term.ratio + ratio * span, gaps: term.gaps + ratio * (span - 1) + 1 }));
    for (let offset = 0; offset < span; offset += 1) heights[column + offset] = next;
    return { id: item.id, column, span, top };
  });
  const columnWidth = `(100cqw - ${(columns - 1) * GAP}px) / ${columns}`;
  const heightAt = (ratio: number, gaps: number) => `calc((${columnWidth}) * ${ratio} + ${gaps * GAP}px)`;
  const maxOf = (values: string[]) => values.length === 1 ? values[0] : `max(${values.join(', ')})`;
  return {
    height: `max(${heights.flatMap((terms) => terms.map(({ ratio, gaps }) => heightAt(ratio, Math.max(0, gaps - 1)))).join(', ')})`,
    positions: positions.map(({ id, column, span, top }) => ({
      id,
      column,
      span,
      left: `calc((100% + ${GAP}px) / ${columns} * ${column})`,
      top: maxOf(top.map(({ ratio, gaps }) => heightAt(ratio, gaps))),
    })),
  };
}
