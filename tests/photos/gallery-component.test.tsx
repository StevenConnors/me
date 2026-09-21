import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

vi.mock('next/image', () => ({
  default: ({ fill: _fill, priority: _priority, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean; priority?: boolean }) => <img {...props} />,
}));

import { PhotosGallery } from '@/components/photos/PhotosGallery';

const photo = (id: string) => ({
  id,
  source: `https://images.test/${id}`,
  alt: `Photo ${id}`,
  width: 100,
  height: 100,
});

const video = (id: string) => ({
  ...photo(id),
  kind: 'video' as const,
  source: `https://images.test/${id}.jpg`,
  posterUrl: `https://images.test/${id}.jpg`,
  playbackUrl: `https://videos.test/${id}.mp4`,
});

describe('PhotosGallery pagination', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('does not refetch the server-rendered first page and appends a manual next page', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ items: [photo('two')], nextCursor: null }) }));
    vi.stubGlobal('fetch', fetchMock);
    render(<PhotosGallery initialCursor="cursor-one" initialItems={[photo('one')]} />);

    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await waitFor(() => expect(screen.getByAltText('Photo two')).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });

  it('keeps existing photos and offers a retry after a later-page error', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, json: async () => ({ error: { message: 'Offline' } }) }));
    vi.stubGlobal('fetch', fetchMock);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<PhotosGallery initialCursor="cursor-one" initialItems={[photo('one')]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await waitFor(() => expect(screen.getByText('Offline')).toBeTruthy());
    expect(screen.getAllByAltText('Photo one')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    consoleError.mockRestore();
  });

  it('offers a full reload when a publish makes the pagination cursor stale', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      json: async () => ({ error: { code: 'GALLERY_CURSOR_STALE', message: 'This gallery page has changed.' } }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<PhotosGallery initialCursor="cursor-one" initialItems={[photo('one')]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));

    expect(await screen.findByText('This gallery page has changed.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reload gallery' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    consoleError.mockRestore();
  });

  it('does not wrap the lightbox while a later page is still loading', async () => {
    let resolveResponse: ((response: { ok: true; json: () => Promise<{ items: ReturnType<typeof photo>[]; nextCursor: null }> }) => void) | undefined;
    const fetchMock = vi.fn(() => new Promise((resolve) => { resolveResponse = resolve; }));
    vi.stubGlobal('fetch', fetchMock);
    render(<PhotosGallery initialCursor="cursor-one" initialItems={[photo('one'), photo('two')]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Open photo 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next photo' }));

    expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', 'Photos, 2 of 2');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveResponse?.({ ok: true, json: async () => ({ items: [photo('three')], nextCursor: null }) });
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', 'Photos, 2 of 3'));
    fireEvent.click(screen.getByRole('button', { name: 'Next photo' }));
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', 'Photos, 3 of 3');
  });

  it('uses a poster in the grid and mounts a non-preloading video only while it is active', async () => {
    render(<PhotosGallery initialCursor={null} initialItems={[video('clip'), photo('still')]} />);

    expect(document.querySelector('video')).toBeNull();
    const trigger = screen.getByRole('button', { name: 'Open video 1' });
    trigger.focus();
    fireEvent.click(trigger);

    const player = document.querySelector('video');
    expect(player).not.toBeNull();
    expect(player).toHaveAttribute('controls');
    expect(player).toHaveAttribute('playsinline');
    expect(player).toHaveAttribute('preload', 'none');
    expect(player).toHaveAttribute('poster', 'https://images.test/clip.jpg');
    expect(player).toHaveAttribute('src', 'https://videos.test/clip.mp4');

    fireEvent.click(screen.getByRole('button', { name: 'Next photo' }));
    expect(document.querySelector('video')).toBeNull();
    expect(screen.getAllByAltText('Photo still')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Close gallery' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});
