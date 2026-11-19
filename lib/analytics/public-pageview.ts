import type { BeforeSendEvent } from '@vercel/analytics/next';

/** Drops admin page views so Web Analytics only reports public traffic. */
export function allowPublicProductionPageview(event: BeforeSendEvent): BeforeSendEvent | null {
  let pathname: string;
  try {
    pathname = new URL(event.url, 'https://analytics.invalid').pathname;
  } catch {
    return event;
  }
  return pathname === '/admin' || pathname.startsWith('/admin/') ? null : event;
}
