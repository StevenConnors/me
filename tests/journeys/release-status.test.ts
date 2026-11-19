import { describe, expect, it } from 'vitest';

import { journeyReleaseSnapshot } from '@/lib/journeys/release-status';
import { EMPTY_JOURNEY_DOCUMENT } from '@/lib/journeys/schemas';

const draft = { title: 'A journey', slug: 'a-journey', draftDocument: EMPTY_JOURNEY_DOCUMENT };

describe('journal release comparison', () => {
  it('treats omitted defaults and object-key order as the same release', () => {
    expect(journeyReleaseSnapshot(draft)).toBe(journeyReleaseSnapshot({
      draftDocument: EMPTY_JOURNEY_DOCUMENT, slug: 'a-journey', title: 'A journey',
      summary: '', cover: null, experiencedAt: null, locations: [],
    }));
    expect(journeyReleaseSnapshot({ ...draft, social: { title: 'Title', description: 'Description' } }))
      .toBe(journeyReleaseSnapshot({ ...draft, social: { description: 'Description', title: 'Title' } }));
  });

  it('detects a draft-only slug or metadata edit', () => {
    expect(journeyReleaseSnapshot({ ...draft, slug: 'unreleased' })).not.toBe(journeyReleaseSnapshot(draft));
    expect(journeyReleaseSnapshot({ ...draft, summary: 'New summary' })).not.toBe(journeyReleaseSnapshot(draft));
  });
});
