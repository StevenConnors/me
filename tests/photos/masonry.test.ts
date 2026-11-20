import { describe, expect, it } from 'vitest';

import { layoutColumns } from '@/components/photos/masonry';

describe('layoutColumns', () => {
  it('uses source aspect ratios and assigns each next item to the shortest column', () => {
    const { positions } = layoutColumns([
      { id: 'wide', width: 1200, height: 600 },
      { id: 'tall', width: 600, height: 1200 },
      { id: 'square', width: 800, height: 800 },
      { id: 'next', width: 1000, height: 500 },
    ], 3);

    expect(positions.map(({ id, column }) => ({ id, column }))).toEqual([
      { id: 'wide', column: 0 },
      { id: 'tall', column: 1 },
      { id: 'square', column: 2 },
      { id: 'next', column: 0 },
    ]);
    expect(positions[3].top).toBe('calc(((100cqw - 16px) / 3) * 0.5 + 8px)');
  });

  it('is deterministic and leaves existing positions intact when media append', () => {
    const initial = [
      { id: 'one', width: 1200, height: 800 },
      { id: 'two', width: 800, height: 1200 },
      { id: 'three', width: 1000, height: 1000 },
    ];
    const first = layoutColumns(initial, 3).positions;
    const appended = layoutColumns([...initial, { id: 'four', width: 1600, height: 900 }], 3).positions;

    expect(appended.slice(0, initial.length)).toEqual(first);
    expect(first.map(({ id }) => id)).toEqual(initial.map(({ id }) => id));
  });

  it('handles empty and single-item section grids', () => {
    expect(layoutColumns([], 2)).toEqual({
      positions: [], height: 'max(calc(((100cqw - 8px) / 2) * 0 + 0px), calc(((100cqw - 8px) / 2) * 0 + 0px))',
    });
    expect(layoutColumns([{ id: 'only', width: 1, height: 3 }], 3).positions[0]).toMatchObject({ id: 'only', column: 0 });
  });
});
