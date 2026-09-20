import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={String(href)} {...props}>{children}</a>
  ),
}));

import { HeldPlacesJourneyPage } from '@/components/held-places/HeldPlaces';
import { makeHeldPlacesDocument } from '@/tests/journeys/fixtures';

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
        document={makeHeldPlacesDocument()}
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
          { mediaAssetId: asset.id },
          { mediaAssetId: secondAsset.id },
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
    expect(screen.getAllByRole('img').map((image) => image.getAttribute('alt')))
      .toEqual(['Coast after rain', 'Train platform']);
  });
});
