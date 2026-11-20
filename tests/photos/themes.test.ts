import { describe, expect, it } from 'vitest';

import { MAX_THEMES, MIN_THEME_PHOTOS, photoThemes } from '@/lib/photos/themes';

describe('photoThemes', () => {
  it('keeps tags shared by enough photos, most common first, counting each photo once', () => {
    const photos = [
      ...Array.from({ length: 6 }, () => ({ tags: ['sunset', 'sunset'] })),
      ...Array.from({ length: MIN_THEME_PHOTOS }, () => ({ tags: ['cat'] })),
      ...Array.from({ length: MIN_THEME_PHOTOS }, () => ({ tags: ['bird'] })),
      { tags: ['lonely'] },
    ];
    expect(photoThemes(photos)).toEqual([
      { tag: 'sunset', count: 6 },
      { tag: 'bird', count: MIN_THEME_PHOTOS },
      { tag: 'cat', count: MIN_THEME_PHOTOS },
    ]);
  });

  it('limits the number of themes', () => {
    const tags = Array.from({ length: MAX_THEMES + 4 }, (_, index) => `tag-${index}`);
    expect(photoThemes(Array.from({ length: MIN_THEME_PHOTOS }, () => ({ tags })))).toHaveLength(MAX_THEMES);
  });
});
