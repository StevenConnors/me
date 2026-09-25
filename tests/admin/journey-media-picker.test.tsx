import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { JourneyMediaPicker } from '@/components/editor/JourneyMediaPicker';

function media(id: string) {
  return { _id: id, originalFilename: `${id}.jpg`, width: 1200, height: 800, status: 'ready', previewUrl: `https://images.example/${id}.jpg` };
}

describe('Journey photograph library', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('shows actual images and retains selections across library pages', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ media: [media('coast')], nextCursor: 'older' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ media: [media('forest')], nextCursor: null }) });
    vi.stubGlobal('fetch', fetchMock);
    const onInsert = vi.fn();
    render(<JourneyMediaPicker onClose={vi.fn()} onInsert={onInsert} placedMediaIds={new Set()} />);

    const coast = await screen.findByRole('checkbox', { name: 'coast.jpg' });
    expect(within(coast.closest('label')!).getByRole('presentation')).toHaveAttribute('src', 'https://images.example/coast.jpg');
    fireEvent.click(coast);
    fireEvent.click(screen.getByRole('button', { name: 'Load more media' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'forest.jpg' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add selected' }));

    expect(String(fetchMock.mock.calls[0][0])).not.toContain('resourceType=');
    expect(String(fetchMock.mock.calls[1][0])).toContain('cursor=older');
    expect(onInsert).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'coast', previewUrl: 'https://images.example/coast.jpg' }),
      expect.objectContaining({ id: 'forest', previewUrl: 'https://images.example/forest.jpg' }),
    ]);
  });

  it('searches the entire library and prevents adding placed or unavailable images', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ media: [media('existing'), { ...media('processing'), status: 'processing' }], nextCursor: 'next' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ media: [media('old-coast')], nextCursor: null }) });
    vi.stubGlobal('fetch', fetchMock);
    render(<JourneyMediaPicker onClose={vi.fn()} onInsert={vi.fn()} placedMediaIds={new Set(['existing'])} />);
    expect(await screen.findByRole('checkbox', { name: 'existing.jpg' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'processing.jpg' })).toBeDisabled();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search library media' }), { target: { value: 'old coast' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByRole('checkbox', { name: 'old-coast.jpg' })).toBeEnabled();
    expect(String(fetchMock.mock.calls[1][0])).toContain('q=old+coast');
    expect(String(fetchMock.mock.calls[1][0])).not.toContain('cursor=');
  });
});
