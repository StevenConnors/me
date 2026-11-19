import { HeldPlacesIndex, type HeldPlacesMediaContext } from '@/components/held-places/HeldPlaces';
import { loadJourneyMediaPresentation } from '@/lib/journeys/media-presentation';
import { JourneyRepository } from '@/lib/journeys/repository';
import type { PublishedJourneySummary } from '@/lib/journeys/schemas';
import { getCloudinaryMediaProvider } from '@/lib/media/provider';
import { MediaRepository } from '@/lib/media/repository';
import { loadHomepagePhotos } from '@/lib/photos/gallery';
import type { PublicPhoto } from '@/lib/photos/presentation';
import { PhotosPageRepository } from '@/lib/photos/repository';

const legacyJourneys = [
  { slug: 'poc', title: 'Autumn in Tōhoku' },
  { slug: 'dfw-okc', title: 'Oklahoma! Oklahoma?' },
  { slug: 'newpoc', title: 'Whisky with an e' },
];

export const dynamic = 'force-dynamic';

export default async function Home() {
  let journeys: PublishedJourneySummary[] = [];
  let photos: PublicPhoto[] = [];
  let covers: HeldPlacesMediaContext | undefined;
  let failed = false;

  try {
    journeys = await (await JourneyRepository.connect()).listPublishedSummaries({
      limit: 24,
    });
  } catch (error) {
    failed = true;
    console.error('Unable to load the published journey index', error);
  }

  if (journeys.length) {
    try {
      covers = await loadJourneyMediaPresentation(journeys.map(({ cover }) => cover.mediaAssetId));
    } catch (error) {
      console.error('Unable to load journey covers', error);
    }
  }

  try {
    const [mediaRepository, photosPageRepository] = await Promise.all([
      MediaRepository.connect(), PhotosPageRepository.connect(),
    ]);
    photos = await loadHomepagePhotos(
      await photosPageRepository.get(), mediaRepository, getCloudinaryMediaProvider(),
    );
  } catch (error) {
    console.error('Unable to load home photo selection', error);
  }

  return <HeldPlacesIndex covers={covers} failed={failed} journeys={journeys} photos={photos} legacyJourneys={legacyJourneys} />;
}
