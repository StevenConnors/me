import Link from 'next/link';

import styles from '@/app/admin/admin.module.css';
import { TripRepository } from '@/lib/trips/repository';
import type { TripRecord } from '@/lib/trips/schemas';
import { NewTripForm } from './NewTripForm';

export const dynamic = 'force-dynamic';

export default async function TripsPage() {
  let trips: TripRecord[] = [];
  let loadError = false;
  try {
    trips = await (await TripRepository.connect()).listTrips();
  } catch (error) {
    console.error('Unable to list trips', error);
    loadError = true;
  }

  return (
    <>
      <p className={styles.eyebrow}>Shared expenses</p>
      <h1 className={styles.title}>Trips</h1>
      <p className={styles.lede}>Log who paid for what in any currency. Each trip has an unlisted public page that settles everything in yen.</p>
      {loadError ? (
        <section className={`${styles.panel} ${styles.error}`}>
          <p className={styles.empty}>Trips could not be loaded from MongoDB. Reload to try again.</p>
        </section>
      ) : trips.length ? (
        <section className={styles.journeyList} aria-label="Trips" style={{ marginTop: 44 }}>
          {trips.map((trip) => (
            <article key={trip._id} className={styles.journeyCard}>
              <Link href={`/admin/trips/${trip._id}`} className={styles.journeyEditorLink} passHref>
                <span className={styles.journeyCardTitle}>{trip.name}</span>
              </Link>
              <footer className={styles.journeyCardFooter}>
                <span className={styles.journeyCardDetails}>
                  <span>/{trip._id}</span>
                  <span>{trip.participants.map((person) => person.name).join(', ')}</span>
                </span>
                <Link className={styles.quietButton} href={`/${trip._id}`} target="_blank" rel="noreferrer">Public page ↗</Link>
              </footer>
            </article>
          ))}
        </section>
      ) : null}
      <NewTripForm />
    </>
  );
}
