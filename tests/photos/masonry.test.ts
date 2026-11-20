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

describe('wide masonry items', () => {
  it('starts a two-column item under the taller of the lowest adjacent pair and lifts both columns', () => {
    const { positions, height } = layoutColumns([
      { id: 'a', width: 100, height: 100 },
      { id: 'b', width: 100, height: 200 },
      { id: 'wide', width: 200, height: 100, span: 2 },
      { id: 'c', width: 100, height: 100 },
    ], 3);
    expect(positions.map(({ id, column, span }) => ({ id, column, span }))).toEqual([
      { id: 'a', column: 0, span: 1 },
      { id: 'b', column: 1, span: 1 },
      { id: 'wide', column: 0, span: 2 },
      { id: 'c', column: 2, span: 1 },
    ]);
    expect(positions[2].top).toBe('calc(((100cqw - 16px) / 3) * 2 + 8px)');
    expect(height).toBe('max(calc(((100cqw - 16px) / 3) * 3 + 12px), calc(((100cqw - 16px) / 3) * 3 + 12px), calc(((100cqw - 16px) / 3) * 1 + 0px))');
  });

  it('starts a wide item below both columns when neither is taller at every width', () => {
    const { positions } = layoutColumns([
      { id: 'tall', width: 1, height: 2 },
      { id: 'one', width: 2, height: 1 },
      { id: 'two', width: 2, height: 1 },
      { id: 'three', width: 4, height: 3 },
      { id: 'wide', width: 2, height: 1, span: 2 },
    ], 2);
    expect(positions.map(({ column }) => column)).toEqual([0, 1, 1, 1, 0]);
    expect(positions[4].top).toBe('max(calc(((100cqw - 8px) / 2) * 2 + 8px), calc(((100cqw - 8px) / 2) * 1.75 + 24px))');
  });

  it('drops a column height that the other column always exceeds', () => {
    const { positions } = layoutColumns([
      { id: 'tall', width: 1, height: 2 },
      { id: 'one', width: 1, height: 1 },
      { id: 'two', width: 1, height: 1 },
      { id: 'wide', width: 2, height: 1, span: 2 },
    ], 2);
    expect(positions[3].top).toBe('calc(((100cqw - 8px) / 2) * 2 + 16px)');
  });
});
