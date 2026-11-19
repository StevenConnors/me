import { describe, expect, it } from 'vitest';

import { allowPublicProductionPageview } from '@/lib/analytics/public-pageview';

const event = (url: string) => ({ type: 'pageview' as const, url });

describe('allowPublicProductionPageview', () => {
  it('drops admin page views', () => {
    expect(allowPublicProductionPageview(event('https://yujitanaka.com/admin'))).toBeNull();
    expect(allowPublicProductionPageview(event('https://yujitanaka.com/admin/analytics?x=1'))).toBeNull();
    expect(allowPublicProductionPageview(event('/admin/journeys'))).toBeNull();
  });

  it('keeps public page views, including paths that only start with "admin"', () => {
    for (const url of ['https://yujitanaka.com/', 'https://yujitanaka.com/photos', 'https://yujitanaka.com/administrator', '/stories/a']) {
      expect(allowPublicProductionPageview(event(url))).toEqual(event(url));
    }
  });

  it('keeps events whose URL cannot be parsed', () => {
    expect(allowPublicProductionPageview(event('http://['))).toEqual(event('http://['));
  });
});
