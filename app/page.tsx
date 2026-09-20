import { HeldPlacesIndex } from '@/components/held-places/HeldPlaces';
import { loadJourneyMediaPresentation } from '@/lib/journeys/media-presentation';
import { JourneyRepository } from '@/lib/journeys/repository';
import type { PublishedJourneySummary } from '@/lib/journeys/schemas';

const legacyJourneys = [
  { slug: 'poc', title: 'Autumn in Tōhoku' },
  { slug: 'dfw-okc', title: 'Oklahoma! Oklahoma?' },
  { slug: 'newpoc', title: 'Whisy with an e' },
];

export const dynamic = 'force-dynamic';

export default async function Home() {
  let journeys: PublishedJourneySummary[] = [];
  let failed = false;

  try {
    journeys = await (await JourneyRepository.connect()).listPublishedSummaries({
      limit: 24,
    });
  } catch (error) {
    failed = true;
    console.error('Unable to load the published journey index', error);
  }

  try {
    const media = await loadJourneyMediaPresentation(
      journeys.map((journey) => journey.cover.mediaAssetId),
    );
    return (
      <HeldPlacesIndex
        assets={media.assets}
        buildMediaUrl={media.buildMediaUrl}
        failed={failed}
        journeys={journeys}
        legacyJourneys={legacyJourneys}
      />
    );
  } catch (error) {
    console.error('Unable to load published journey covers', error);
    return (
      <HeldPlacesIndex
        assets={{}}
        buildMediaUrl={() => null}
        failed={failed}
        journeys={journeys}
        legacyJourneys={legacyJourneys}
      />
    );
  }
}
