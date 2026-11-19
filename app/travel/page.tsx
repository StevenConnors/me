import type { Metadata } from 'next';

import { HeldPlacesFooter, HeldPlacesHeader } from '@/components/held-places/HeldPlaces';
import { TravelOverview } from '@/components/travel/TravelOverview';
import styles from '@/components/held-places/held-places.module.css';
import { JourneyRepository } from '@/lib/journeys/repository';
import { EMPTY_TRAVEL_SELECTIONS } from '@/lib/travel/catalog';
import { journeyLinksByCountry, type TravelJourneyLinks } from '@/lib/travel/journey-links';
import { getTravel } from '@/lib/travel/repository';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Travel',
  description: 'An atlas of countries, US states, and Japanese prefectures visited.',
};

export default async function TravelPage() {
  let selections = EMPTY_TRAVEL_SELECTIONS;
  let updatedAt: string | null = null;
  let failed = false;
  let journeyLinks: TravelJourneyLinks = {};
  try {
    const record = await getTravel();
    selections = record.selections;
    updatedAt = record.updatedAt;
  } catch (error) {
    console.error('Unable to render visited travel locations', error);
    failed = true;
  }
  try {
    journeyLinks = journeyLinksByCountry(await (await JourneyRepository.connect()).listPublishedSummaries({ limit: 100 }));
  } catch (error) {
    console.error('Unable to link visited places to journeys', error);
  }

  return (
    <main className={styles.paper}>
      <HeldPlacesHeader current="travel" />
      <TravelOverview failed={failed} journeyLinks={journeyLinks} selections={selections} updatedAt={updatedAt} />
      <HeldPlacesFooter />
    </main>
  );
}
