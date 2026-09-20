import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';

import { LegacyStory } from './LegacyStory';
import { isLegacyStorySlug } from './legacyStorySlugs';
import { HeldPlacesJourneyPage } from '@/components/held-places/HeldPlaces';
import { JourneyRenderer } from '@/components/journey/JourneyRenderer';
import { loadJourneyMediaPresentation } from '@/lib/journeys/media-presentation';
import { JourneyRepository } from '@/lib/journeys/repository';
import { findJourneyRevision } from '@/lib/journeys/revisions';
import {
  collectMediaPlacements,
  isHeldPlacesDocument,
  type HeldPlacesMedia,
} from '@/lib/journeys/schemas';

export const dynamic = 'force-dynamic';

const loadPublishedJourney = cache(async (slug: string) => {
  const repository = await JourneyRepository.connect();
  const journey = await repository.findBySlug(slug);
  if (
    !journey ||
    journey.status !== 'published' ||
    !journey.publishedRevisionId ||
    !repository.revisions
  ) {
    return null;
  }
  const revision = await findJourneyRevision(
    repository.revisions,
    journey._id,
    journey.publishedRevisionId,
  );
  return revision ? { journey, revision } : null;
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  try {
    const result = await loadPublishedJourney(slug);
    if (!result) return {};
    const metadata = result.revision.metadataSnapshot;
    const title = metadata.social?.title ?? metadata.title;
    const description = metadata.social?.description ?? metadata.summary;
    const socialPlacement = metadata.social?.image ?? metadata.cover;
    let image: string | undefined;

    if (socialPlacement) {
      const presentation = await loadJourneyMediaPresentation([
        socialPlacement.mediaAssetId,
      ]);
      const asset = presentation.assets[socialPlacement.mediaAssetId];
      image = asset
        ? presentation.buildMediaUrl({
            asset,
            placement: socialPlacement,
            viewport: 'desktop',
            width: 1440,
          }) ?? undefined
        : undefined;
    }

    return {
      title,
      description,
      alternates: { canonical: `/stories/${metadata.slug}` },
      openGraph: {
        title,
        description,
        type: 'article',
        ...(image ? { images: [{ url: image }] } : { images: [] }),
      },
      twitter: {
        card: image ? 'summary_large_image' : 'summary',
        title,
        description,
        ...(image ? { images: [image] } : { images: [] }),
      },
    };
  } catch (error) {
    console.error('Unable to build journey metadata', error);
    return {};
  }
}

export default async function StoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  try {
    const result = await loadPublishedJourney(slug);
    if (!result) {
      if (isLegacyStorySlug(slug)) return <LegacyStory slug={slug} />;
      notFound();
    }

    const { revision } = result;
    const metadata = revision.metadataSnapshot;
    const mediaIds = new Set([
      ...(metadata.cover ? [metadata.cover.mediaAssetId] : []),
      ...collectMediaPlacements(revision.document).map(
        (placement) => placement.mediaAssetId,
      ),
    ]);
    const presentation = await loadJourneyMediaPresentation(mediaIds);

    if (isHeldPlacesDocument(revision.document)) {
      return (
        <HeldPlacesJourneyPage
          assets={presentation.assets}
          buildMediaUrl={presentation.buildMediaUrl}
          cover={metadata.cover ? coverAsHeldPlacesMedia(metadata.cover) : undefined}
          document={revision.document}
          experiencedAt={metadata.experiencedAt}
          locations={metadata.locations}
          summary={metadata.summary}
          title={metadata.title}
        />
      );
    }

    return (
      <main>
        <header style={{ maxWidth: '44rem', margin: '0 auto', padding: '48px 16px 0' }}>
          <p style={{ color: '#6c6a65', font: '11px/1 ui-monospace, SFMono-Regular, Menlo, monospace', letterSpacing: '.1em', textTransform: 'uppercase' }}>Journey</p>
          <h1 style={{ margin: '14px 0 0', font: '400 clamp(40px, 8vw, 88px)/.93 Georgia, serif', letterSpacing: '-.06em' }}>{metadata.title}</h1>
          {metadata.summary ? <p style={{ margin: '20px 0 0', color: '#625b50', fontSize: '18px', lineHeight: 1.5 }}>{metadata.summary}</p> : null}
        </header>
        <JourneyRenderer
          assets={presentation.assets}
          buildMediaUrl={presentation.buildMediaUrl}
          document={revision.document}
        />
      </main>
    );
  } catch (error) {
    if (isNotFoundError(error)) throw error;
    console.error('Unable to load database journey; falling back to the legacy story', error);
    if (isLegacyStorySlug(slug)) return <LegacyStory slug={slug} />;
    notFound();
  }
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
    ...(placement.decorative !== undefined
      ? { decorative: placement.decorative }
      : {}),
  };
}

function isNotFoundError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'digest' in error &&
      (error as { digest?: unknown }).digest ===
        'NEXT_HTTP_ERROR_FALLBACK;404',
  );
}
