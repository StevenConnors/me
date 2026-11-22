import type { BeforeSendEvent } from '@vercel/analytics/next';

const PARSE_BASE = 'https://analytics.invalid';
const SHARED_TRIP_PATH = '/trips/[tripId]';

/**
 * Drops admin page views so Web Analytics only reports public traffic, and
 * hides trip ids because a trip link grants edit access.
 */
export function allowPublicProductionPageview(event: BeforeSendEvent): BeforeSendEvent | null {
  let url: URL;
  try {
    url = new URL(event.url, PARSE_BASE);
  } catch {
    return event;
  }
  if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) return null;
  if (!url.pathname.startsWith('/trips/')) return event;
  return { ...event, url: url.origin === PARSE_BASE ? SHARED_TRIP_PATH : `${url.origin}${SHARED_TRIP_PATH}` };
}
