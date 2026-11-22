import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ExpenseList, TripSummary } from '@/components/trips/TripLedger';
import styles from '@/components/trips/trip-page.module.css';
import { loadTripLedger } from '@/lib/trips/repository';
import { serializeExpense, TripSlugSchema } from '@/lib/trips/schemas';

export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ tripSlug: string }> };

async function loadPublicTrip(slug: string) {
  if (!TripSlugSchema.safeParse(slug).success) return null;
  return loadTripLedger(slug);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const ledger = await loadPublicTrip((await params).tripSlug);
  return {
    title: ledger ? `${ledger.trip.name} expenses` : 'Not found',
    robots: { index: false, follow: false },
  };
}

export default async function TripPage({ params }: Props) {
  const ledger = await loadPublicTrip((await params).tripSlug);
  if (!ledger) notFound();
  const { trip } = ledger;
  const expenses = ledger.expenses.map(serializeExpense);
  return (
    <main className={styles.page}>
      <p className={styles.eyebrow}>Shared expenses · settled in yen</p>
      <h1 className={styles.title}>{trip.name}</h1>
      <p className={styles.people}>{trip.participants.map((person) => person.name).join(' · ')}</p>
      <TripSummary participants={trip.participants} expenses={expenses} />
      <h2 className={styles.sectionTitle}>Expenses</h2>
      <ExpenseList participants={trip.participants} expenses={expenses} />
    </main>
  );
}
