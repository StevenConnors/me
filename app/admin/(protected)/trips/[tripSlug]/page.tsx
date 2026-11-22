import { notFound } from 'next/navigation';

import styles from '@/app/admin/admin.module.css';
import { loadTripLedger } from '@/lib/trips/repository';
import { serializeExpense, serializeTrip, TripSlugSchema } from '@/lib/trips/schemas';
import { TripWorkspace } from './TripWorkspace';

export const dynamic = 'force-dynamic';

export default async function TripEditorPage({ params }: { params: Promise<{ tripSlug: string }> }) {
  const { tripSlug } = await params;
  if (!TripSlugSchema.safeParse(tripSlug).success) notFound();
  let ledger: Awaited<ReturnType<typeof loadTripLedger>>;
  try {
    ledger = await loadTripLedger(tripSlug);
  } catch (error) {
    console.error('Unable to load trip', error);
    return (
      <section className={`${styles.panel} ${styles.error}`}>
        <p className={styles.empty}>This trip could not be loaded from MongoDB. Reload to try again.</p>
      </section>
    );
  }
  if (!ledger) notFound();
  return <TripWorkspace initialTrip={serializeTrip(ledger.trip)} initialExpenses={ledger.expenses.map(serializeExpense)} />;
}
