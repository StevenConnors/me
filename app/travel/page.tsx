import type { Metadata } from 'next';

import { HeldPlacesHeader } from '@/components/held-places/HeldPlaces';
import { TravelOverview } from '@/components/travel/TravelOverview';
import styles from '@/components/held-places/held-places.module.css';
import { EMPTY_TRAVEL_SELECTIONS } from '@/lib/travel/catalog';
import { getTravel } from '@/lib/travel/repository';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Travel | Yuji',
  description: 'An atlas of countries, US states, and Japanese prefectures visited.',
};

export default async function TravelPage() {
  let selections = EMPTY_TRAVEL_SELECTIONS;
  let updatedAt: string | null = null;
  let failed = false;
  try {
    const record = await getTravel();
    selections = record.selections;
    updatedAt = record.updatedAt;
  } catch (error) {
    console.error('Unable to render visited travel locations', error);
    failed = true;
  }

  return (
    <main className={`${styles.paper} ${styles.travelPaper}`}>
      <HeldPlacesHeader />
      <TravelOverview selections={selections} updatedAt={updatedAt} failed={failed} />
    </main>
  );
}
