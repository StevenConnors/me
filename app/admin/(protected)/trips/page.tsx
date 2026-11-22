import Link from 'next/link';

import styles from '@/app/admin/admin.module.css';
import { ShareLink } from '@/components/trips/ShareLink';
import { formatYen } from '@/lib/trips/currencies';
import { TripRepository, type TripTotals } from '@/lib/trips/repository';
import type { TripRecord } from '@/lib/trips/schemas';
import { NewTripForm } from './NewTripForm';

export const dynamic = 'force-dynamic';

export default async function TripsPage() {
  let trips: TripRecord[] = [];
  let totals = new Map<string, TripTotals>();
  let loadError = false;
  try {
    const repository = await TripRepository.connect();
    trips = await repository.listTrips();
    totals = await repository.totalsByTrip(trips.map((trip) => trip._id));
  } catch (error) {
    console.error('Unable to list trips', error);
    loadError = true;
  }

  return (
    <>
      <p className={styles.eyebrow}>Shared expenses</p>
      <h1 className={styles.title}>Trips</h1>
      <p className={styles.lede}>Each trip gets its own private link. Share it with the people on the trip so anyone can add what they paid; everything settles in yen.</p>
      {loadError ? (
        <section className={`${styles.panel} ${styles.error}`}>
          <p className={styles.empty}>Trips could not be loaded from MongoDB. Reload to try again.</p>
        </section>
      ) : trips.length ? (
        <section className={styles.journeyList} aria-label="Trips" style={{ marginTop: 44 }}>
          {trips.map((trip) => {
            const tripTotals = totals.get(trip._id) ?? { expenseCount: 0, totalJpy: 0 };
            return (
              <article key={trip._id} className={styles.journeyCard} aria-label={trip.name}>
                <Link href={`/admin/trips/${trip._id}`} className={styles.journeyEditorLink} passHref>
                  <span className={styles.journeyCardTitle}>{trip.name}</span>
                </Link>
                <footer className={styles.journeyCardFooter} style={{ flexWrap: 'wrap' }}>
                  <span className={styles.journeyCardDetails}>
                    <span>{trip.participants.map((person) => person.name).join(', ')}</span>
                    <span>{tripTotals.expenseCount === 1 ? '1 expense' : `${tripTotals.expenseCount} expenses`}</span>
                    <span>{formatYen(tripTotals.totalJpy)}</span>
                  </span>
                  <ShareLink tripId={trip._id} compact />
                </footer>
              </article>
            );
          })}
        </section>
      ) : null}
      <NewTripForm />
    </>
  );
}
