import { describe, expect, it } from 'vitest';

import { assertMeasurementIdentity, assertSample } from '../../scripts/perf/sample-guard.mjs';

describe('UX performance sample guard', () => {
  const sample = { route: '/photos', status: 200, errors: [], missingFixture: '' };

  it('accepts a successful load with the fixture present', () => {
    expect(() => assertSample(sample)).not.toThrow();
  });

  it.each([0, 204, 302, 500])('rejects HTTP %i', (status) => {
    expect(() => assertSample({ ...sample, status })).toThrow(`Refusing to compare /photos: HTTP ${status}`);
  });

  it('rejects an HTTP 200 load without the seeded photo', () => {
    expect(() => assertSample({ ...sample, missingFixture: 'loaded fixture photo' }))
      .toThrow('Refusing to compare /photos: missing loaded fixture photo');
  });

  it('rejects a load with a browser error', () => {
    expect(() => assertSample({ ...sample, errors: ['render failed'] }))
      .toThrow('Refusing to compare /photos: browser error: render failed');
  });
});

describe('UX performance measurement identity', () => {
  const measurement = { profile: 'mobile', viewport: { width: 412, height: 823 } };

  it('accepts matching profiles and viewport dimensions', () => {
    expect(() => assertMeasurementIdentity(measurement, { ...measurement })).not.toThrow();
  });

  it.each([
    { profile: 'mobile', viewport: { width: 390, height: 823 } },
    { profile: 'mobile', viewport: { width: 412, height: 844 } },
    { profile: 'desktop', viewport: { width: 412, height: 823 } },
  ])('rejects a different measurement configuration: %j', (baseline) => {
    expect(() => assertMeasurementIdentity(measurement, baseline))
      .toThrow('Refusing to compare: viewport or profile differs from baseline');
  });

  it('refuses older baselines whose actual viewport is unknown', () => {
    expect(() => assertMeasurementIdentity(measurement, { profile: 'mobile' }))
      .toThrow('Refusing to compare: missing viewport identity; remeasure the baseline');
  });
});
