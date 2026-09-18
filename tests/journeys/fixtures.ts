import { ObjectId } from 'mongodb';

import type { MediaPlacement } from '@/lib/media/schemas';
import {
  EMPTY_JOURNEY_DOCUMENT,
  type Journey,
  type JourneyDocument,
} from '@/lib/journeys/schemas';

export const READY_MEDIA_ID = '507f1f77bcf86cd799439011';

export function makePlacement(
  overrides: Partial<MediaPlacement> = {},
): MediaPlacement {
  return {
    mediaAssetId: READY_MEDIA_ID,
    role: 'story',
    layout: { desktop: 'wide', mobile: 'inline' },
    ...overrides,
  };
}

export function makeJourney(
  overrides: Partial<Journey> = {},
): Journey {
  const now = new Date('2026-09-18T00:00:00.000Z');
  return {
    _id: new ObjectId('507f191e810c19729de860ea'),
    schemaVersion: 1,
    slug: 'night-train',
    title: 'Night train',
    summary: 'Notes from the long way home.',
    status: 'draft',
    draftDocument: EMPTY_JOURNEY_DOCUMENT,
    cover: makePlacement({
      role: 'cover',
      layout: { desktop: 'full', mobile: 'full' },
    }),
    locations: [],
    editVersion: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export function makeDocument(
  nodes: JourneyDocument['content']['content'],
): JourneyDocument {
  return {
    schemaVersion: 1,
    editor: 'tiptap',
    content: { type: 'doc', content: nodes },
  };
}
