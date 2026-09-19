import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EMPTY_JOURNEY_DOCUMENT } from '@/lib/journeys/schemas';

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={String(href)} {...props}>{children}</a>
  ),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/components/editor/JourneyVisualEditor', () => ({
  JourneyVisualEditor: () => <div>Journey editor</div>,
}));

import { JourneyWorkspace } from '@/app/admin/(protected)/journeys/[journeyId]/edit/JourneyWorkspace';

describe('JourneyWorkspace', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('includes a selected cover image in autosave', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        journey: {
          _id: 'journey-1',
          title: 'A journey',
          slug: 'a-journey',
          cover: {
            mediaAssetId: 'media-1',
            role: 'cover',
            layout: { desktop: 'full', mobile: 'full' },
          },
          status: 'draft',
          editVersion: 1,
          draftDocument: EMPTY_JOURNEY_DOCUMENT,
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <JourneyWorkspace
        initialJourney={{
          _id: 'journey-1',
          title: 'A journey',
          slug: 'a-journey',
          status: 'draft',
          editVersion: 0,
          draftDocument: EMPTY_JOURNEY_DOCUMENT,
        }}
        media={[{
          id: 'media-1',
          title: 'Cover photograph',
          width: 1600,
          height: 1200,
        }]}
      />,
    );

    fireEvent.change(screen.getByLabelText('Cover image'), {
      target: { value: 'media-1' },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, request] = fetchMock.mock.calls[0];
    expect(JSON.parse(request.body)).toMatchObject({
      expectedEditVersion: 0,
      cover: {
        mediaAssetId: 'media-1',
        role: 'cover',
        layout: { desktop: 'full', mobile: 'full' },
      },
    });
  });

  it('shows the public story URL after publishing', async () => {
    const savedJourney = {
      _id: 'journey-1',
      title: 'A journey',
      slug: 'a-journey',
      summary: 'A short summary',
      status: 'draft' as const,
      editVersion: 1,
      draftDocument: EMPTY_JOURNEY_DOCUMENT,
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ journey: savedJourney }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          journey: { ...savedJourney, status: 'published', editVersion: 2 },
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <JourneyWorkspace
        initialJourney={{
          ...savedJourney,
          editVersion: 0,
        }}
        media={[]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Publish journey' }));

    const publicLink = await screen.findByRole('link', { name: 'View public journey ↗' });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(publicLink).toHaveAttribute('href', '/stories/a-journey');
    expect(publicLink).toHaveAttribute('target', '_blank');
  });
});
