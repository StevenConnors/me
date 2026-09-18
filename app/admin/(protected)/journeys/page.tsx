import Link from 'next/link';

import { NewJourneyButton } from './NewJourneyButton';
import styles from '@/app/admin/admin.module.css';
import { JourneyRepository } from '@/lib/journeys/repository';

function formatUpdatedAt(value: Date) {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(value);
}

export default async function JourneysPage() {
  let journeys: Awaited<ReturnType<JourneyRepository['list']>> = [];
  let loadError = false;
  try {
    journeys = await (await JourneyRepository.connect()).list();
  } catch (error) {
    console.error('Unable to render journey dashboard', error);
    loadError = true;
  }

  return (
    <>
      <p className={styles.eyebrow}>Authoring archive</p>
      <h1 className={styles.title}>Journeys</h1>
      <p className={styles.lede}>Draft the whole sequence here; the public archive changes only when you publish.</p>
      <div className={styles.toolbar}>
        <span className={styles.meta}>{journeys.length} {journeys.length === 1 ? 'journey' : 'journeys'}</span>
        <NewJourneyButton />
      </div>
      {loadError ? (
        <section className={`${styles.panel} ${styles.error}`}>
          <p className={styles.empty}>The dashboard could not reach MongoDB. Check the server-only database configuration, then reload.</p>
        </section>
      ) : journeys.length ? (
        <section className={styles.journeyList} aria-label="Journeys">
          {journeys.map((journey) => (
            <Link key={journey._id.toHexString()} href={`/admin/journeys/${journey._id.toHexString()}/edit`} className={styles.journeyCard}>
              <span className={styles.journeyCardTitle} data-empty={journey.title ? undefined : 'true'}>{journey.title || 'Untitled journey'}</span>
              <span className={styles.journeyCardFooter}>
                <span>{journey.slug}</span>
                <span className={styles.badge}>{journey.status}</span>
                <span>Edited {formatUpdatedAt(journey.updatedAt)}</span>
              </span>
            </Link>
          ))}
        </section>
      ) : (
        <section className={styles.panel}>
          <p className={styles.empty}>No journeys yet. Start with a small draft—prose and media can be arranged later.</p>
        </section>
      )}
    </>
  );
}
