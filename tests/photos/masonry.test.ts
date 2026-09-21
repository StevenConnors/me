import { describe, expect, it } from 'vitest';

import { calculateMasonryLayout } from '@/components/photos/masonry';

const options = { columns: 3, containerWidth: 900, gap: 8, rowUnit: 8 };

describe('calculateMasonryLayout', () => {
  it('uses source aspect ratios and assigns each next item to the shortest column', () => {
    const positions = calculateMasonryLayout([
      { id: 'wide', width: 1200, height: 600 },
      { id: 'tall', width: 600, height: 1200 },
      { id: 'square', width: 800, height: 800 },
      { id: 'next', width: 1000, height: 500 },
    ], options);

    expect(positions.map(({ id, column }) => ({ id, column }))).toEqual([
      { id: 'wide', column: 1 },
      { id: 'tall', column: 2 },
      { id: 'square', column: 3 },
      { id: 'next', column: 1 },
    ]);
    expect(positions[1].rowSpan).toBeGreaterThan(positions[0].rowSpan);
  });

  it('is deterministic and leaves existing positions intact when media append', () => {
    const initial = [
      { id: 'one', width: 1200, height: 800 },
      { id: 'two', width: 800, height: 1200 },
      { id: 'three', width: 1000, height: 1000 },
    ];
    const first = calculateMasonryLayout(initial, options);
    const appended = calculateMasonryLayout([...initial, { id: 'four', width: 1600, height: 900 }], options);

    expect(appended.slice(0, initial.length)).toEqual(first);
    expect(calculateMasonryLayout(initial, { ...options, columns: 4 })).toHaveLength(3);
    expect(calculateMasonryLayout(initial, { ...options, columns: 2 })).toHaveLength(3);
  });

  it('handles empty and single-item section grids', () => {
    expect(calculateMasonryLayout([], options)).toEqual([]);
    expect(calculateMasonryLayout([{ id: 'only', width: 1, height: 3 }], options)[0]).toMatchObject({ column: 1, rowStart: 1 });
  });
});
