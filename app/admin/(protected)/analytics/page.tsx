import { loadMostOpenedPhotos, type MostOpenedPhoto } from '@/lib/analytics/photo-opens';
import { loadVercelWebAnalytics, type AnalyticsBreakdown } from '@/lib/analytics/vercel-web-analytics';

import styles from './analytics.module.css';

export const dynamic = 'force-dynamic';

function formatCount(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

function Breakdown({ items, empty, photo = false }: {
  items: AnalyticsBreakdown[] | MostOpenedPhoto[];
  empty: string;
  photo?: boolean;
}) {
  if (!items.length) return <p className={styles.empty}>{empty}</p>;
  const max = Math.max(...items.map((item) => photo ? (item as MostOpenedPhoto).opens : (item as AnalyticsBreakdown).pageviews), 1);
  return (
    <ol className={styles.ranking}>
      {items.map((item) => {
        const value = photo ? (item as MostOpenedPhoto).opens : (item as AnalyticsBreakdown).pageviews;
        return (
          <li className={styles.rankingItem} key={photo ? (item as MostOpenedPhoto).photoId : (item as AnalyticsBreakdown).label}>
            <span className={styles.itemName}>{photo ? (item as MostOpenedPhoto).name : (item as AnalyticsBreakdown).label}</span>
            <span aria-label={photo ? `${formatCount(value)} opens` : `${formatCount(value)} page views`} className={styles.itemValue}>{formatCount(value)} {photo ? 'opens' : 'views'}</span>
            <span className={styles.barTrack}><span className={styles.bar} style={{ width: `${Math.max(3, value / max * 100)}%` }} /></span>
          </li>
        );
      })}
    </ol>
  );
}

export default async function AnalyticsPage() {
  const [trafficResult, photoResult] = await Promise.allSettled([
    loadVercelWebAnalytics(),
    loadMostOpenedPhotos(),
  ]);
  const traffic = trafficResult.status === 'fulfilled' ? trafficResult.value : null;
  const photos = photoResult.status === 'fulfilled' ? photoResult.value : [];

  return (
    <>
      <p className={styles.eyebrow}>Audience</p>
      <h1 className={styles.title}>Analytics</h1>
      <p className={styles.lede}>Production visits and photo openings from the last 30 days.</p>

      {traffic?.message ? <p className={styles.notice} role="status">{traffic.message}</p> : null}
      {trafficResult.status === 'rejected' ? <p className={styles.notice} role="status">Vercel Web Analytics could not be loaded. Check its server configuration and try again.</p> : null}

      <section aria-label="Traffic summary" className={styles.metrics}>
        <article className={styles.metric}>
          <span className={styles.metricLabel}>Page views</span>
          <strong>{traffic ? formatCount(traffic.pageviews) : '—'}</strong>
          <span>Production pages</span>
        </article>
        <article className={styles.metric}>
          <span className={styles.metricLabel}>Visitors</span>
          <strong>{traffic ? formatCount(traffic.visitors) : '—'}</strong>
          <span>Unique in the selected period</span>
        </article>
        <article className={styles.metric}>
          <span className={styles.metricLabel}>Period</span>
          <strong>30 days</strong>
          <span>{traffic?.since ?? 'Production analytics'}</span>
        </article>
      </section>

      <div className={styles.columns}>
        <section aria-labelledby="visits-title" className={styles.panel}>
          <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Production</p><h2 id="visits-title">Visits over time</h2></div></div>
          {!traffic ? <p className={styles.empty}>Traffic data is temporarily unavailable.</p>
            : traffic.status === 'empty' ? <p className={styles.empty}>No Web Analytics visits were reported in this 30 day period.</p>
              : traffic.daily.length ? <div aria-label="Daily page views" className={styles.chart} role="img">
                {traffic.daily.map((day) => {
                  const maximum = Math.max(...traffic.daily.map((point) => point.pageviews), 1);
                  return <span key={day.label} title={`${day.label}: ${formatCount(day.pageviews)} page views`} style={{ height: `${Math.max(3, day.pageviews / maximum * 100)}%` }} />;
                })}
              </div> : <p className={styles.empty}>No daily visit totals are available.</p>}
          {traffic?.daily.length ? <div className={styles.chartCaption}><span>{traffic.since}</span><span>{traffic.until}</span></div> : null}
        </section>

        <section aria-labelledby="countries-title" className={styles.panel}>
          <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Where visitors came from</p><h2 id="countries-title">Countries</h2></div></div>
          <Breakdown items={traffic?.countries ?? []} empty={traffic ? 'No country data is available yet.' : 'Country data is temporarily unavailable.'} />
        </section>

        <section aria-labelledby="journeys-title" className={styles.panel}>
          <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Most visited stories</p><h2 id="journeys-title">Most-viewed journeys</h2></div></div>
          <Breakdown items={traffic?.journeys ?? []} empty={traffic ? 'No journey visits were reported in this period.' : 'Journey data is temporarily unavailable.'} />
        </section>

        <section aria-labelledby="photos-title" className={styles.panel}>
          <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Gallery engagement</p><h2 id="photos-title">Most-opened photos</h2></div></div>
          {photoResult.status === 'rejected'
            ? <p className={styles.empty}>Photo opening counts are temporarily unavailable.</p>
            : <Breakdown items={photos} empty="No photo openings were recorded in this period." photo />}
        </section>
      </div>
      <p className={styles.footnote}>Vercel Web Analytics data uses its plan reporting window. Visitor counts are unique within the full period.</p>
    </>
  );
}
