import { describe, expect, it } from 'vitest';

import {
  JourneyDocumentSchema,
  JourneySchema,
  collectMediaPlacements,
  createEmptyHeldPlacesDocument,
} from '@/lib/journeys/schemas';
import {
  makeDocument,
  makeHeldPlacesDocument,
  makeJourney,
  makePlacement,
} from './fixtures';

describe('JourneyDocumentSchema', () => {
  it('accepts a versioned document made only from supported nodes', () => {
    const document = makeDocument([
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'On the ' },
          { type: 'text', text: 'road', marks: [{ type: 'italic' }] },
        ],
      },
      {
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'First stop' }] },
            ],
          },
        ],
      },
      { type: 'photograph', attrs: { placement: makePlacement() } },
      {
        type: 'storyStep',
        attrs: {
          media: makePlacement({
            layout: { desktop: 'story-step', mobile: 'stack' },
          }),
        },
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Arrival' }] },
        ],
      },
    ]);

    expect(JourneyDocumentSchema.parse(document)).toEqual(document);
    expect(collectMediaPlacements(document)).toHaveLength(2);
  });

  it('rejects provider URLs and arbitrary nodes in stored content', () => {
    const providerUrl = makeDocument([
      {
        type: 'photograph',
        attrs: {
          placement: makePlacement({
            mediaAssetId: 'https://res.cloudinary.com/example/image.jpg',
          }),
        },
      },
    ]);
    const arbitraryNode = makeDocument([
      { type: 'script', attrs: { source: 'alert(1)' } } as never,
    ]);

    expect(JourneyDocumentSchema.safeParse(providerUrl).success).toBe(false);
    expect(JourneyDocumentSchema.safeParse(arbitraryNode).success).toBe(false);
  });

  it('rejects unversioned documents and level-one headings', () => {
    expect(
      JourneyDocumentSchema.safeParse({
        editor: 'tiptap',
        content: { type: 'doc', content: [] },
      }).success,
    ).toBe(false);
    expect(
      JourneyDocumentSchema.safeParse(
        makeDocument([
          {
            type: 'heading',
            attrs: { level: 1 },
            content: [{ type: 'text', text: 'Duplicate title' }],
          } as never,
        ]),
      ).success,
    ).toBe(false);
  });

  it('accepts the layout-free Held Places contract and collects its media', () => {
    const document = makeHeldPlacesDocument();

    expect(JourneyDocumentSchema.parse(document)).toEqual(document);
    expect(collectMediaPlacements(document)).toEqual([
      expect.objectContaining({
        mediaAssetId: document.chapters[0].media[0].mediaAssetId,
        role: 'story',
        layout: { desktop: 'story-step', mobile: 'full' },
      }),
    ]);
    expect(createEmptyHeldPlacesDocument('stable-chapter')).toMatchObject({
      schemaVersion: 2,
      template: 'held-places-v1',
      chapters: [{ id: 'stable-chapter', media: [] }],
    });
  });

  it('rejects presentation controls, provider URLs, and unsafe rich text in v2', () => {
    const withLayout = makeHeldPlacesDocument({
      chapters: [{
        id: 'chapter-1',
        body: { type: 'doc', content: [] },
        media: [{
          mediaAssetId: 'media-1',
          layout: { desktop: 'wide', mobile: 'full' },
        } as never],
      }],
    });
    const withProviderUrl = makeHeldPlacesDocument({
      chapters: [{
        id: 'chapter-1',
        body: { type: 'doc', content: [] },
        media: [{ mediaAssetId: 'https://example.com/photo.jpg' }],
      }],
    });
    const withUnsafeNode = makeHeldPlacesDocument({
      chapters: [{
        id: 'chapter-1',
        body: {
          type: 'doc',
          content: [{ type: 'heading', content: [] } as never],
        },
        media: [],
      }],
    });

    expect(JourneyDocumentSchema.safeParse(withLayout).success).toBe(false);
    expect(JourneyDocumentSchema.safeParse(withProviderUrl).success).toBe(false);
    expect(JourneyDocumentSchema.safeParse(withUnsafeNode).success).toBe(false);
  });
});

describe('JourneySchema', () => {
  it('accepts persisted MongoDB values and rejects backwards date ranges', () => {
    expect(
      JourneySchema.safeParse(
        makeJourney({ experiencedAt: { start: '2026-01-01', end: '2026-01-03' } }),
      ).success,
    ).toBe(true);
    expect(
      JourneySchema.safeParse(
        makeJourney({ experiencedAt: { start: '2026-01-03', end: '2026-01-01' } }),
      ).success,
    ).toBe(false);
    expect(
      JourneySchema.safeParse(
        makeJourney({ experiencedAt: { start: '2026-02-30' } }),
      ).success,
    ).toBe(false);
  });
});
