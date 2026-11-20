import { cleanup, render, screen, within } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={String(href)} {...props}>{children}</a>
  ),
}));

import { HeldPlacesIndex, HeldPlacesJourneyPage } from '@/components/held-places/HeldPlaces';
import type { PublishedJourneySummary } from '@/lib/journeys/schemas';
import { makeHeldPlacesDocument } from '@/tests/journeys/fixtures';

describe('HeldPlacesIndex', () => {
  afterEach(cleanup);
  const legacyJourneys = [
    { slug: 'poc', title: 'Autumn in Tōhoku' },
    { slug: 'dfw-okc', title: 'Oklahoma! Oklahoma?' },
    { slug: 'newpoc', title: 'Whisky with an e' },
  ];
  const published: PublishedJourneySummary = {
    id: 'published', slug: 'current', title: 'Published title', summary: 'Published summary',
    cover: { mediaAssetId: 'cover' }, publishedAt: '2026-01-01T00:00:00.000Z', locations: [],
  };
  it.each([
    { label: 'mixed', journeys: [published], expected: ['current', 'poc', 'dfw-okc', 'newpoc'], failed: false },
    { label: 'legacy only', journeys: [], expected: ['poc', 'dfw-okc', 'newpoc'], failed: false },
    { label: 'database failure', journeys: [], expected: ['poc', 'dfw-okc', 'newpoc'], failed: true },
    { label: 'matching slug', journeys: [{ ...published, slug: 'poc' }], expected: ['poc', 'dfw-okc', 'newpoc'], failed: false },
  ])('lists $label rows with an accurate count', ({ journeys, expected, failed }) => {
    const { container } = render(<HeldPlacesIndex journeys={journeys} legacyJourneys={legacyJourneys} photos={[]} failed={failed} />);
    const archive = container.querySelector('#journeys');
    expect(archive).not.toBeNull();
    expect(Array.from(archive?.querySelectorAll('a') ?? [], (link) => link.getAttribute('href')))
      .toEqual(expected.map((slug) => `/stories/${slug}`));
    expect(archive?.querySelector('h2 + span')).toHaveTextContent(String(expected.length).padStart(2, '0'));
    if (journeys.length) expect(screen.getByText('Published title')).toBeInTheDocument();
  });
  it('shows the empty and unavailable messages without entries', () => {
    const { rerender } = render(<HeldPlacesIndex journeys={[]} photos={[]} />);
    expect(screen.getByText('New journeys are being prepared.')).toBeInTheDocument();
    rerender(<HeldPlacesIndex journeys={[]} photos={[]} failed />);
    expect(screen.getByText('Journeys are temporarily unavailable.')).toBeInTheDocument();
  });
});

describe('HeldPlacesJourneyPage', () => {
  afterEach(cleanup);

  const asset = {
    id: '507f1f77bcf86cd799439011',
    resourceType: 'image' as const,
    width: 1600,
    height: 1200,
    altText: 'Coast after rain',
  };
  const buildMediaUrl = ({ width }: { width: number }) =>
    `https://example.test/photo-${width}.jpg`;

  it('renders one chapter image without carousel controls', () => {
    render(
      <HeldPlacesJourneyPage
        assets={{ [asset.id]: asset }}
        buildMediaUrl={buildMediaUrl}
        document={makeHeldPlacesDocument({
          chapters: [{
            id: 'chapter-1',
            heading: 'Arrival',
            body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'The rain lifted at the coast.' }] }] },
            media: [{ mediaAssetId: asset.id, decorative: false }],
          }],
        })}
        title="Coast walk"
      />,
    );

    expect(screen.getByRole('img', { name: 'Coast after rain' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /Photograph carousel/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next photograph' })).not.toBeInTheDocument();
  });

  it('turns ordered multiple images into one manual carousel', () => {
    const secondAsset = { ...asset, id: 'media-2', altText: 'Train platform' };
    const document = makeHeldPlacesDocument({
      chapters: [{
        id: 'chapter-1',
        body: { type: 'doc', content: [] },
        media: [
          { mediaAssetId: asset.id, decorative: false },
          { mediaAssetId: secondAsset.id, decorative: false },
        ],
      }],
    });
    render(
      <HeldPlacesJourneyPage
        assets={{ [asset.id]: asset, [secondAsset.id]: secondAsset }}
        buildMediaUrl={buildMediaUrl}
        document={document}
        title="Coast walk"
      />,
    );

    expect(screen.getByRole('region', {
      name: 'Photograph carousel, 2 images',
    })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Photograph carousel, 2 images' }))
      .getAllByRole('img').map((image) => image.getAttribute('alt')))
      .toEqual(['Coast after rain', 'Train platform']);
  });
});
