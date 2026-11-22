import { notFound } from 'next/navigation';

import styles from '@/app/admin/admin.module.css';
import { TripWorkspace } from '@/components/trips/TripWorkspace';
import { loadTripLedger } from '@/lib/trips/repository';
import { serializeExpense, serializeTrip, TripIdSchema } from '@/lib/trips/schemas';

export const dynamic = 'force-dynamic';

export default async function TripEditorPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  if (!TripIdSchema.safeParse(tripId).success) notFound();
  let ledger: Awaited<ReturnType<typeof loadTripLedger>>;
  try {
    ledger = await loadTripLedger(tripId);
  } catch (error) {
    console.error('Unable to load trip', error);
    return (
      <section className={`${styles.panel} ${styles.error}`}>
        <p className={styles.empty}>This trip could not be loaded from MongoDB. Reload to try again.</p>
      </section>
    );
  }
  if (!ledger) notFound();
  return <TripWorkspace mode="admin" initialTrip={serializeTrip(ledger.trip)} initialExpenses={ledger.expenses.map(serializeExpense)} />;
}
