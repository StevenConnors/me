// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { render, screen, within } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  JourneyRenderer,
  type BuildMediaUrl,
  type MediaPlacement,
  type TiptapJsonDocument,
} from '@/components/journey';
import type { JourneyDocument } from '@/lib/journeys/schemas';

const photograph: MediaPlacement = {
  mediaAssetId: 'photo-1',
  role: 'story',
  layout: { desktop: 'wide', mobile: 'full' },
  crop: {
    desktop: { mode: 'focal-fill', aspectRatio: 1.5, focalPoint: { x: 0.25, y: 0.75 } },
    mobile: { mode: 'focal-fill', aspectRatio: 0.8, focalPoint: { x: 0.6, y: 0.4 } },
  },
  captionOverride: 'A placement caption',
  altTextOverride: 'A person crossing a mountain pass',
  decorative: false,
};

const assets = {
  'photo-1': {
    resourceType: 'image' as const,
    width: 2400,
    height: 1600,
    altText: 'Asset-level alt text',
  },
  'photo-2': {
    resourceType: 'image' as const,
    width: 1600,
    height: 1600,
    altText: 'A second photograph',
  },
};

const buildMediaUrl: BuildMediaUrl = ({ placement, viewport, width }) =>
  `https://media.example/${placement.mediaAssetId}/${viewport}/${width}`;

describe('JourneyRenderer', () => {
  it('renders the supported rich-text subset with safe links', () => {
    const document: TiptapJsonDocument = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Departure' }],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'A bold start', marks: [{ type: 'bold' }] },
            { type: 'text', text: ' and an italic turn', marks: [{ type: 'italic' }] },
            { type: 'hardBreak' },
            {
              type: 'text',
              text: 'external link',
              marks: [{ type: 'link', attrs: { href: 'https://example.com', target: '_blank' } }],
            },
            {
              type: 'text',
              text: ' unsafe link',
              marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
            },
          ],
        },
        {
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: 'Packing list' }],
        },
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'First' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Second' }] }] },
          ],
        },
        {
          type: 'orderedList',
          attrs: { start: 3 },
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Third' }] }] },
          ],
        },
        {
          type: 'blockquote',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A field note.' }] }],
        },
        { type: 'divider' },
      ],
    };

    render(<JourneyRenderer assets={{}} buildMediaUrl={buildMediaUrl} document={document} />);

    expect(screen.getByRole('heading', { level: 2, name: 'Departure' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Packing list' })).toBeInTheDocument();
    expect(screen.getByText('A bold start').closest('strong')).toBeInTheDocument();
    expect(screen.getByText(/italic turn/).closest('em')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'external link' })).toHaveAttribute('rel', 'noreferrer noopener');
    expect(screen.queryByRole('link', { name: 'unsafe link' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('list')[0]).toHaveTextContent('FirstSecond');
    expect(screen.getAllByRole('list')[1]).toHaveAttribute('start', '3');
    expect(screen.getByText('A field note.').closest('blockquote')).toBeInTheDocument();
    expect(documentQuery('hr')).toBeInTheDocument();
  });

  it('resolves a photograph through the asset map and URL builder', () => {
    const urlBuilder = vi.fn(buildMediaUrl);
    const document: TiptapJsonDocument = {
      type: 'doc',
      content: [{ type: 'photograph', attrs: { placement: photograph } }],
    };

    const { container } = render(
      <JourneyRenderer assets={assets} buildMediaUrl={urlBuilder} document={document} />,
    );

    const image = screen.getByRole('img', { name: 'A person crossing a mountain pass' });
    expect(image).toHaveAttribute('src', 'https://media.example/photo-1/desktop/1024');
    expect(image).toHaveAttribute('loading', 'lazy');
    expect(image).toHaveAttribute('width', '2400');
    expect(screen.getByText('A placement caption')).toBeInTheDocument();
    expect(container.querySelector('source[media="(max-width: 47.99rem)"]')).toHaveAttribute(
      'srcset',
      expect.stringContaining('/mobile/480 480w'),
    );
    expect(urlBuilder).toHaveBeenCalledWith(expect.objectContaining({
      placement: photograph,
      viewport: 'desktop',
      width: 1024,
    }));
  });

  it('renders galleries, editorial quotes, and story steps in document order', () => {
    const secondPlacement: MediaPlacement = {
      ...photograph,
      mediaAssetId: 'photo-2',
      captionOverride: undefined,
      altTextOverride: undefined,
    };
    const document: TiptapJsonDocument = {
      type: 'doc',
      content: [
        {
          type: 'quote',
          attrs: { attribution: 'M. Rivera', citation: 'Field notebook' },
          content: [{ type: 'text', text: 'The road remembers.' }],
        },
        {
          type: 'gallery',
          attrs: { template: 'two-equal', items: [photograph, secondPlacement] },
        },
        {
          type: 'storyStep',
          attrs: { media: secondPlacement },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'We climbed before dawn.' }] }],
        },
      ],
    };

    render(<JourneyRenderer assets={assets} buildMediaUrl={buildMediaUrl} document={document} />);

    expect(screen.getByText('The road remembers.')).toBeInTheDocument();
    expect(screen.getByText(/M\. Rivera/)).toBeInTheDocument();
    const gallery = screen.getByRole('region', { name: 'Photograph gallery' });
    expect(within(gallery).getAllByRole('img')).toHaveLength(2);
    expect(screen.getByText('We climbed before dawn.')).toBeInTheDocument();
    expect(screen.getAllByRole('img', { name: 'A second photograph' })).toHaveLength(2);
  });

  it('shows an accessible fallback when media is missing or URL generation fails', () => {
    const document: TiptapJsonDocument = {
      type: 'doc',
      content: [
        { type: 'photograph', attrs: { placement: { ...photograph, mediaAssetId: 'missing' } } },
        { type: 'photograph', attrs: { placement: photograph } },
      ],
    };
    const failedBuilder = () => {
      throw new Error('delivery unavailable');
    };

    render(<JourneyRenderer assets={assets} buildMediaUrl={failedBuilder} document={document} />);

    expect(screen.getByRole('img', { name: 'Photograph unavailable' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Media unavailable' })).toBeInTheDocument();
  });

  it('supports the persisted JourneyDocument wrapper and decorative media', () => {
    const document: JourneyDocument = {
      schemaVersion: 1,
      editor: 'tiptap' as const,
      content: {
        type: 'doc' as const,
        content: [
          {
            type: 'photograph',
            attrs: { placement: { ...photograph, decorative: true } },
          },
        ],
      },
    };

    render(
      <JourneyRenderer
        assets={new Map(Object.entries(assets))}
        buildMediaUrl={buildMediaUrl}
        document={document}
        priorityMediaAssetIds={['photo-1']}
      />,
    );

    const image = screen.getByRole('presentation');
    expect(image).toHaveAttribute('alt', '');
    expect(image).toHaveAttribute('loading', 'eager');
  });
});

function documentQuery(selector: string) {
  return window.document.querySelector(selector);
}
