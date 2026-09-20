import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

vi.mock('next/image', () => ({ default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => <img {...props} /> }));

import { PhotosGallery } from '@/components/photos/PhotosGallery';

const photo = (id: string) => ({
  id,
  source: `https://images.test/${id}`,
  alt: `Photo ${id}`,
  width: 100,
  height: 100,
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
    await waitFor(() => expect(screen.getByText('More photos could not be loaded.')).toBeTruthy());
    expect(screen.getAllByAltText('Photo one')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    consoleError.mockRestore();
  });
});
