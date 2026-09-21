import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={String(href)} {...props}>{children}</a>
  ),
}));

import { HeldPlacesHeader } from '@/components/held-places/HeldPlaces';
import { MediaGrid } from '@/components/MediaGrid';

describe('site galleries', () => {
  afterEach(cleanup);

  it('uses the Japanese identity and exposes the new gallery links', () => {
    render(<HeldPlacesHeader />);

    expect(screen.getByRole('link', { name: '佑治' })).toHaveAttribute('href', '/');
    expect(screen.queryByRole('link', { name: /Yuji/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Photos' })).toHaveAttribute('href', '/photos');
    expect(screen.getByRole('link', { name: 'Glass' })).toHaveAttribute('href', '/glass');
    expect(screen.getByRole('link', { name: 'Work' })).toHaveAttribute('href', 'https://www.linkedin.com/in/steven-connors/');
  });

  it('opens an item in place and supports keyboard navigation and closing', () => {
    render(
      <MediaGrid
        portrait
        title="Glass"
        items={[
          { id: 'one', kind: 'photo', src: 'https://res.cloudinary.com/demo/one-full.jpg', thumbnailSrc: 'https://res.cloudinary.com/demo/one.jpg', alt: 'A glass vase', width: 900, height: 1600 },
          { id: 'two', kind: 'photo', src: 'https://res.cloudinary.com/demo/two-full.jpg', thumbnailSrc: 'https://res.cloudinary.com/demo/two.jpg', alt: 'A glass bowl', width: 900, height: 1600 },
        ]}
      />,
    );

    expect(screen.getByAltText('A glass vase')).toHaveAttribute('src', 'https://res.cloudinary.com/demo/one.jpg');
    expect(screen.getByAltText('A glass vase')).toHaveAttribute('loading', 'lazy');
    fireEvent.click(screen.getByRole('button', { name: 'Open photo 1' }));
    expect(screen.getByRole('dialog', { name: 'Glass, 1 of 2' })).toBeInTheDocument();
    expect(screen.getAllByAltText('A glass vase')[1]).toHaveAttribute('src', 'https://res.cloudinary.com/demo/one-full.jpg');

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByRole('dialog', { name: 'Glass, 2 of 2' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close gallery' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
