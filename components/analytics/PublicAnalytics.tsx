'use client';

import { Analytics } from '@vercel/analytics/next';

import { allowPublicProductionPageview } from '@/lib/analytics/public-pageview';

export function PublicAnalytics() {
  return <Analytics beforeSend={allowPublicProductionPageview} mode="production" />;
}
