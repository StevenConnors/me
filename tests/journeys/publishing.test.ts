import { describe, expect, it } from 'vitest';

import { validateJourneyForPublication } from '@/lib/journeys/publishing';
import { makeDocument, makeJourney, makePlacement, READY_MEDIA_ID } from './fixtures';

const readyAsset = {
  _id: READY_MEDIA_ID,
  status: 'ready' as const,
  altText: 'A train crossing a snowy plain',
};

describe('validateJourneyForPublication', () => {
  it('accepts a complete journey whose referenced media are ready', () => {
    const journey = makeJourney({
      draftDocument: makeDocument([
        { type: 'photograph', attrs: { placement: makePlacement() } },
      ]),
    });

    expect(
      validateJourneyForPublication(journey, { mediaAssets: [readyAsset] }),
    ).toMatchObject({ success: true });
  });

  it('reports incomplete uploads and all missing publication metadata', () => {
    const result = validateJourneyForPublication(
      makeJourney({
        title: ' ',
        summary: undefined,
        cover: undefined,
        draftDocument: makeDocument([
          {
            type: 'mediaUpload',
            attrs: { uploadSessionId: 'upload-123', status: 'pending' },
          },
        ]),
      }),
      { mediaAssets: [], slugAvailable: false },
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'title_required',
        'summary_required',
        'slug_unavailable',
        'cover_required',
        'upload_incomplete',
      ]),
    );
  });

  it('requires ready assets and alt text for meaningful placements', () => {
    const journey = makeJourney({
      draftDocument: makeDocument([
        {
          type: 'photograph',
          attrs: {
            placement: makePlacement({ mediaAssetId: 'missing-media' }),
          },
        },
        {
          type: 'photograph',
          attrs: {
            placement: makePlacement({ mediaAssetId: 'processing-media' }),
          },
        },
      ]),
    });
    const result = validateJourneyForPublication(journey, {
      mediaAssets: [
        readyAsset,
        { _id: 'processing-media', status: 'pending' as const },
      ],
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'media_missing',
        'media_not_ready',
        'alt_text_required',
      ]),
    );
  });

  it('allows an explicit decorative placement without alt text', () => {
    const journey = makeJourney({
      cover: makePlacement({
        role: 'cover',
        layout: { desktop: 'full', mobile: 'full' },
        decorative: true,
      }),
      draftDocument: makeDocument([
        {
          type: 'photograph',
          attrs: { placement: makePlacement({ decorative: true }) },
        },
      ]),
    });
    const result = validateJourneyForPublication(journey, {
      mediaAssets: [{ _id: READY_MEDIA_ID, status: 'ready' as const }],
    });

    expect(result.success).toBe(true);
  });
});
