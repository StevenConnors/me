import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import styles from '@/components/trips/trip-page.module.css';
import { TripWorkspace } from '@/components/trips/TripWorkspace';
import { loadTripLedger } from '@/lib/trips/repository';
import { serializeExpense, serializeTrip, TripIdSchema } from '@/lib/trips/schemas';

export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ tripId: string }> };

async function loadSharedTrip(tripId: string) {
  if (!TripIdSchema.safeParse(tripId).success) return null;
  return loadTripLedger(tripId);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const ledger = await loadSharedTrip((await params).tripId);
  return {
    title: ledger ? `${ledger.trip.name} expenses` : 'Not found',
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
  };
}

export default async function SharedTripPage({ params }: Props) {
  const ledger = await loadSharedTrip((await params).tripId);
  if (!ledger) notFound();
  return (
    <main className={styles.page}>
      <TripWorkspace mode="shared" initialTrip={serializeTrip(ledger.trip)} initialExpenses={ledger.expenses.map(serializeExpense)} />
    </main>
  );
}
