import 'server-only';

import { JourneyRepository } from '@/lib/journeys/repository';

export type AnalyticsPoint = { label: string; pageviews: number; visitors: number };
export type AnalyticsBreakdown = { label: string; pageviews: number; visitors: number };

export type WebAnalyticsReport = {
  status: 'ready' | 'not-configured' | 'error' | 'empty';
  message?: string;
  since: string;
  until: string;
  pageviews: number;
  visitors: number;
  daily: AnalyticsPoint[];
  countries: AnalyticsBreakdown[];
  journeys: AnalyticsBreakdown[];
};

type AggregateRow = Record<string, unknown> & {
  pageviews?: number;
  visitors?: number;
  timestamp?: string;
  country?: string;
  requestPath?: string;
};

type AggregateResponse = { data?: AggregateRow[] };

function readConfiguration() {
  const token = process.env.VERCEL_ANALYTICS_TOKEN ?? process.env.VERCEL_TOKEN;
  const projectId = process.env.VERCEL_ANALYTICS_PROJECT_ID ?? process.env.VERCEL_PROJECT_ID;
  const teamId = process.env.VERCEL_ANALYTICS_TEAM_ID ?? process.env.VERCEL_TEAM_ID;
  return token && projectId ? { token, projectId, teamId } : null;
}

function utcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function dateWindow(now = new Date()) {
  const until = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const since = new Date(until);
  since.setUTCDate(since.getUTCDate() - 29);
  return { since: utcDate(since), until: utcDate(until) };
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

async function queryAggregate(options: {
  token: string;
  projectId: string;
  teamId?: string;
  since: string;
  until: string;
  by: string;
  filter: string;
  limit?: number;
}): Promise<AggregateRow[]> {
  const url = new URL('https://api.vercel.com/v1/query/web-analytics/visits/aggregate');
  url.searchParams.set('projectId', options.projectId);
  url.searchParams.set('since', options.since);
  url.searchParams.set('until', options.until);
  url.searchParams.set('by', options.by);
  url.searchParams.set('filter', options.filter);
  url.searchParams.set('limit', String(options.limit ?? 100));
  if (options.teamId) url.searchParams.set('teamId', options.teamId);

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${options.token}`, Accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Vercel Web Analytics returned ${response.status}`);
  const payload = await response.json() as AggregateResponse;
  if (!Array.isArray(payload.data)) throw new Error('Vercel Web Analytics returned an unexpected response');
  return payload.data;
}

export async function loadVercelWebAnalytics(now = new Date()): Promise<WebAnalyticsReport> {
  const { since, until } = dateWindow(now);
  const empty = {
    since,
    until,
    pageviews: 0,
    visitors: 0,
    daily: [],
    countries: [],
    journeys: [],
  };
  const config = readConfiguration();
  if (!config) {
    return { ...empty, status: 'not-configured', message: 'Vercel Web Analytics is not configured. Set VERCEL_ANALYTICS_TOKEN and VERCEL_ANALYTICS_PROJECT_ID to show production traffic.' };
  }

  // The API defaults to production. The path filter also removes admin hits,
  // including data collected before the client-side exclusion was enabled.
  const publicFilter = "not startswith(requestPath, '/admin')";
  const results = await Promise.allSettled([
    queryAggregate({ ...config, since, until, by: 'day', filter: publicFilter, limit: 31 }),
    queryAggregate({ ...config, since, until, by: 'environment', filter: publicFilter, limit: 3 }),
    queryAggregate({ ...config, since, until, by: 'country', filter: publicFilter, limit: 20 }),
    queryAggregate({ ...config, since, until, by: 'requestPath', filter: "startswith(requestPath, '/stories/')", limit: 20 }),
  ]);
  const failures = results.filter((result) => result.status === 'rejected');
  const dailyRows = results[0].status === 'fulfilled' ? results[0].value : [];
  const visitorRows = results[1].status === 'fulfilled' ? results[1].value : [];
  const countryRows = results[2].status === 'fulfilled' ? results[2].value : [];
  const journeyRows = results[3].status === 'fulfilled' ? results[3].value : [];
  const daily = dailyRows
    .filter((row) => typeof row.timestamp === 'string')
    .map((row) => ({
      label: row.timestamp!.slice(0, 10),
      pageviews: count(row.pageviews),
      visitors: count(row.visitors),
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
  const countries = countryRows
    .filter((row) => typeof row.country === 'string' && row.country !== 'Others')
    .map((row) => ({ label: row.country as string, pageviews: count(row.pageviews), visitors: count(row.visitors) }))
    .sort((left, right) => right.pageviews - left.pageviews);
  const journeyTitles = new Map<string, string>();
  if (journeyRows.length) {
    try {
      const publishedJourneys = await (await JourneyRepository.connect()).listPublishedSummaries({ limit: 100 });
      for (const journey of publishedJourneys) journeyTitles.set(journey.slug, journey.title);
    } catch {
      // Journey routes stay identifiable by their public path if the title lookup is unavailable.
    }
  }
  const journeys = journeyRows
    .filter((row) => typeof row.requestPath === 'string' && row.requestPath !== 'Others')
    .map((row) => {
      const requestPath = row.requestPath as string;
      let slug = requestPath.slice('/stories/'.length).split('/')[0];
      try { slug = decodeURIComponent(slug); } catch { /* Keep the encoded public path as a fallback. */ }
      return {
        label: journeyTitles.get(slug) ?? requestPath,
        pageviews: count(row.pageviews),
        visitors: count(row.visitors),
      };
    })
    .sort((left, right) => right.pageviews - left.pageviews);

  if (failures.length) {
    return {
      ...empty,
      daily,
      countries,
      journeys,
      pageviews: daily.reduce((sum, row) => sum + row.pageviews, 0),
      visitors: count(visitorRows.find((row) => row.environment === 'production')?.visitors),
      status: 'error',
      message: 'Some production Web Analytics data could not be loaded. Try again later.',
    };
  }

  const pageviews = daily.reduce((sum, row) => sum + row.pageviews, 0);
  const visitors = count(visitorRows.find((row) => row.environment === 'production')?.visitors);
  return {
    ...empty,
    pageviews,
    visitors,
    daily,
    countries,
    journeys,
    status: pageviews || countries.length || journeys.length ? 'ready' : 'empty',
  };
}
