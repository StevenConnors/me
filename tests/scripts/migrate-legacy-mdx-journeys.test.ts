import { describe, expect, it } from 'vitest';

import { parseLegacyStory } from '../../scripts/migrate-legacy-mdx-journeys.mjs';

describe('parseLegacyStory', () => {
  it('turns legacy Step elements into Held Places-ready chapter data', () => {
    const story = parseLegacyStory(`
      <h1 className="title">A title</h1>
      <Step media="stories/example/first">First paragraph.\n\nSecond paragraph.</Step>
      <Step media="stories/example/clip" kind="video">A clip.</Step>
    `, 'example');

    expect(story).toEqual({
      slug: 'example',
      title: 'A title',
      steps: [
        {
          media: 'stories/example/first',
          kind: 'image',
          body: {
            type: 'doc',
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'First paragraph.' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Second paragraph.' }] },
            ],
          },
        },
        {
          media: 'stories/example/clip',
          kind: 'video',
          body: {
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A clip.' }] }],
          },
        },
      ],
    });
  });
});
