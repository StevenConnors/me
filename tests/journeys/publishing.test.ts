import { describe, expect, it } from 'vitest';

import { validateJourneyForPublication } from '@/lib/journeys/publishing';
import {
  makeDocument,
  makeHeldPlacesDocument,
  makeJourney,
  makePlacement,
  READY_MEDIA_ID,
} from './fixtures';

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

  it('requires every referenced asset to exist and be ready', () => {
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
      ]),
    );
  });

  it('allows ready non-decorative placements without alt text', () => {
    const journey = makeJourney({
      draftDocument: makeDocument([
        {
          type: 'photograph',
          attrs: { placement: makePlacement() },
        },
      ]),
    });
    const result = validateJourneyForPublication(journey, {
      mediaAssets: [{ _id: READY_MEDIA_ID, status: 'ready' as const }],
    });

    expect(result.success).toBe(true);
  });

  it('publishes a meaningful Held Places document with accessible media', () => {
    const journey = makeJourney({
      draftDocument: makeHeldPlacesDocument(),
    });

    expect(
      validateJourneyForPublication(journey, { mediaAssets: [readyAsset] }),
    ).toMatchObject({ success: true });
  });

  it('rejects empty Held Places chapters but allows decorative photos without text', () => {
    const emptyResult = validateJourneyForPublication(
      makeJourney({
        draftDocument: makeHeldPlacesDocument({
          chapters: [{
            id: 'empty-chapter',
            body: { type: 'doc', content: [] },
            media: [],
          }],
        }),
      }),
      { mediaAssets: [readyAsset] },
    );
    expect(emptyResult.success).toBe(false);
    if (!emptyResult.success) {
      expect(emptyResult.issues.map(({ code }) => code)).toContain('chapter_required');
    }

    const decorativePhotoResult = validateJourneyForPublication(
      makeJourney({
        draftDocument: makeHeldPlacesDocument(),
      }),
      { mediaAssets: [{ _id: READY_MEDIA_ID, status: 'ready' as const }] },
    );
    expect(decorativePhotoResult.success).toBe(true);
  });
});
