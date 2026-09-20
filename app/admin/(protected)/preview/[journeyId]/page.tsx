import Link from 'next/link';
import { notFound } from 'next/navigation';

import { HeldPlacesJourneyPage } from '@/components/held-places/HeldPlaces';
import { JourneyPreviewFrame } from '@/components/journey/JourneyPreviewFrame';
import { JourneyRenderer } from '@/components/journey/JourneyRenderer';
import styles from '@/app/admin/admin.module.css';
import { loadJourneyMediaPresentation } from '@/lib/journeys/media-presentation';
import { JourneyRepository } from '@/lib/journeys/repository';
import {
  collectMediaPlacements,
  isHeldPlacesDocument,
  type HeldPlacesMedia,
} from '@/lib/journeys/schemas';

export default async function JourneyPreviewPage({
  params,
}: {
  params: Promise<{ journeyId: string }>;
}) {
  const { journeyId } = await params;
  const journey = await (await JourneyRepository.connect()).findById(journeyId);
  if (!journey) notFound();

  const presentation = await loadJourneyMediaPresentation(new Set([
    ...(journey.cover ? [journey.cover.mediaAssetId] : []),
    ...collectMediaPlacements(journey.draftDocument).map(
      (placement) => placement.mediaAssetId,
    ),
  ]));

  return (
    <>
      <Link
        className={styles.quietButton}
        href={`/admin/journeys/${journey._id.toHexString()}/edit`}
      >
        ← Back to editor
      </Link>
      <p className={styles.eyebrow} style={{ marginTop: 28 }}>Journey preview</p>
      <h1 className={styles.title}>{journey.title || 'Untitled journey'}</h1>
      <p className={styles.lede}>
        Previewing the current draft. It has not changed the public archive.
      </p>
      <JourneyPreviewFrame>
        {isHeldPlacesDocument(journey.draftDocument) ? (
          <HeldPlacesJourneyPage
            assets={presentation.assets}
            buildMediaUrl={presentation.buildMediaUrl}
            cover={journey.cover ? coverAsHeldPlacesMedia(journey.cover) : undefined}
            document={journey.draftDocument}
            experiencedAt={journey.experiencedAt}
            locations={journey.locations}
            summary={journey.summary}
            title={journey.title}
          />
        ) : (
          <JourneyRenderer
            assets={presentation.assets}
            buildMediaUrl={presentation.buildMediaUrl}
            document={journey.draftDocument}
          />
        )}
      </JourneyPreviewFrame>
    </>
  );
}

function coverAsHeldPlacesMedia(placement: {
  mediaAssetId: string;
  crop?: HeldPlacesMedia['crop'];
  captionOverride?: string;
  altTextOverride?: string;
  decorative?: boolean;
}): HeldPlacesMedia {
  return {
    mediaAssetId: placement.mediaAssetId,
    ...(placement.crop ? { crop: placement.crop } : {}),
    ...(placement.captionOverride ? { captionOverride: placement.captionOverride } : {}),
    ...(placement.altTextOverride ? { altTextOverride: placement.altTextOverride } : {}),
    ...(placement.decorative !== undefined ? { decorative: placement.decorative } : {}),
  };
}
