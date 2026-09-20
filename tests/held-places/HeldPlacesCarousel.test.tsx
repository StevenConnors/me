import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HeldPlacesCarousel } from '@/components/held-places/HeldPlacesCarousel';

const slides = [1, 2, 3].map((number) => ({
  id: `media-${number}`,
  src: `https://example.test/${number}.jpg`,
  alt: `Photograph ${number}`,
  desktopPosition: '50% 50%',
  mobilePosition: '50% 50%',
}));

describe('HeldPlacesCarousel', () => {
  afterEach(cleanup);
  beforeEach(() => {
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });
  });

  it('moves one slide at a time without wrapping', () => {
    render(<HeldPlacesCarousel slides={slides} />);

    const carousel = screen.getByRole('region', {
      name: 'Photograph carousel, 3 images',
    });
    const previous = screen.getByRole('button', { name: 'Previous photograph' });
    const next = screen.getByRole('button', { name: 'Next photograph' });

    expect(previous).toBeDisabled();
    expect(screen.getByText('1 / 3')).toBeInTheDocument();

    fireEvent.click(next);
    expect(screen.getByText('2 / 3')).toBeInTheDocument();

    fireEvent.keyDown(carousel, { key: 'ArrowRight' });
    expect(screen.getByText('3 / 3')).toBeInTheDocument();
    expect(next).toBeDisabled();

    fireEvent.keyDown(carousel, { key: 'ArrowRight' });
    expect(screen.getByText('3 / 3')).toBeInTheDocument();
  });

  it('preserves image order and accessible text', () => {
    render(<HeldPlacesCarousel slides={slides} />);
    expect(screen.getAllByRole('img').map((image) => image.getAttribute('alt')))
      .toEqual(['Photograph 1', 'Photograph 2', 'Photograph 3']);
  });
});
