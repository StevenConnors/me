import { cleanup, render, screen, within } from '@testing-library/react';
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';

import AnalyticsPage from '@/app/admin/(protected)/analytics/page';

vi.mock('@/lib/analytics/photo-opens', () => ({
  loadMostOpenedPhotos: async () => [],
}));

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it('shows zero page views and visitors for a configured report with no traffic', async () => {
  vi.stubGlobal('React', React);
  vi.stubEnv('VERCEL_ANALYTICS_TOKEN', 'test-token');
  vi.stubEnv('VERCEL_ANALYTICS_PROJECT_ID', 'test-project');
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: [] })));

  render(await AnalyticsPage());

  expect(screen.queryByText(/not configured/i)).not.toBeInTheDocument();
  expect(screen.getByText(/No Web Analytics visits were reported/)).toBeVisible();
  const summary = within(screen.getByRole('region', { name: 'Traffic summary' }));
  for (const label of ['Page views', 'Visitors']) {
    expect(summary.getByText(label).closest('article')?.querySelector('strong')).toHaveTextContent(/^0$/);
  }
});
