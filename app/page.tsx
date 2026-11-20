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
  { slug: 'dfw-okc', title: 'Oklahoma! Oklahoma?', summary: 'Experienced August 1–5, 2024' },
  { slug: 'newpoc', title: 'Whisky with an e' },
];

export const dynamic = 'force-dynamic';

export default async function Home() {
  let journeys: PublishedJourneySummary[] = [];
  let photos: PublicPhoto[] = [];
  let covers: HeldPlacesMediaContext | undefined;
  let failed = false;
  let visibleLegacyJourneys = legacyJourneys;

  try {
    const repository = await JourneyRepository.connect();
    journeys = await repository.listPublishedSummaries({
      limit: 24,
    });
    try {
      const resolved = await Promise.all(legacyJourneys.map(({ slug }) => repository.resolvePublicSlug(slug)));
      visibleLegacyJourneys = legacyJourneys.filter((_, index) => !resolved[index]);
    } catch (error) {
      console.error('Unable to resolve legacy journey links', error);
    }
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

  return <HeldPlacesIndex covers={covers} failed={failed} journeys={journeys} photos={photos} legacyJourneys={visibleLegacyJourneys} />;
}
