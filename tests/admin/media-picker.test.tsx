import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

import { MediaPicker, type PickerMedia } from '@/app/admin/(protected)/photos/MediaPicker';

function media(id: string): PickerMedia {
  return {
    _id: id,
    originalFilename: `${id}.jpg`,
    width: 1200,
    height: 800,
    status: 'ready',
    resourceType: 'image',
  };
}

describe('MediaPicker pagination', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('loads the next page at the scroll sentinel and preserves selections across pages', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ media: [media('one')], nextCursor: 'cursor-two' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ media: [media('twenty-five')], nextCursor: null }) });
    vi.stubGlobal('fetch', fetchMock);

    let intersectionCallback: IntersectionObserverCallback | undefined;
    let intersectionOptions: IntersectionObserverInit | undefined;
    class MockIntersectionObserver {
      observe = vi.fn();
      disconnect = vi.fn();
      unobserve = vi.fn();
      takeRecords = vi.fn(() => []);
      root = null;
      rootMargin = '';
      thresholds = [];

      constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
        intersectionCallback = callback;
        intersectionOptions = options;
      }
    }
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
    const onInsert = vi.fn();

    render(
      <MediaPicker
        onClose={vi.fn()}
        onInsert={onInsert}
        onUpload={vi.fn()}
        open
        placedMediaIds={new Set()}
      />,
    );

    fireEvent.click(await screen.findByRole('checkbox', { name: /one\.jpg/ }));
    await waitFor(() => expect(intersectionCallback).toBeTypeOf('function'));
    expect(intersectionOptions?.root).toBe(document.querySelector('[class*="pickerItems"]'));

    intersectionCallback?.(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );

    fireEvent.click(await screen.findByRole('checkbox', { name: /twenty-five\.jpg/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Insert selected' }));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain('cursor=cursor-two');
    expect(onInsert).toHaveBeenCalledWith([
      expect.objectContaining({ _id: 'one' }),
      expect.objectContaining({ _id: 'twenty-five' }),
    ]);
  });
});
