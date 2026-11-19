import type { Metadata } from 'next';
import { notFound, redirect, unstable_rethrow } from 'next/navigation';
import { cache } from 'react';

import { LegacyStory } from './LegacyStory';
import { isLegacyStorySlug } from './legacyStorySlugs';
import { HeldPlacesFooter, HeldPlacesHeader, HeldPlacesJourneyPage } from '@/components/held-places/HeldPlaces';
import heldPlacesStyles from '@/components/held-places/held-places.module.css';
import { JourneyRenderer } from '@/components/journey/JourneyRenderer';
import { loadJourneyMediaPresentation } from '@/lib/journeys/media-presentation';
import { JourneyRepository } from '@/lib/journeys/repository';
import {
  collectMediaPlacements,
  isHeldPlacesDocument,
  type HeldPlacesMedia,
} from '@/lib/journeys/schemas';

export const dynamic = 'force-dynamic';

const resolvePublicSlug = cache(async (slug: string) =>
  (await JourneyRepository.connect()).resolvePublicSlug(slug),
);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  try {
    const result = await resolvePublicSlug(slug);
    if (result?.kind !== 'live') return {};
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
    const result = await resolvePublicSlug(slug);
    if (result?.kind === 'moved') redirect(`/stories/${result.slug}`);
    if (!result) {
      if (isLegacyStorySlug(slug)) return <LegacyStoryShell slug={slug} />;
      notFound();
    }

    const { journey, revision } = result;
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
          neighbours={await loadNeighbours(journey.publishedAt)}
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
    unstable_rethrow(error);
    console.error('Unable to load database journey; falling back to the legacy story', error);
    if (isLegacyStorySlug(slug)) return <LegacyStoryShell slug={slug} />;
    notFound();
  }
}

async function loadNeighbours(publishedAt?: Date) {
  if (!publishedAt) return undefined;
  try {
    return await (await JourneyRepository.connect()).findPublishedNeighbours(publishedAt);
  } catch (error) {
    console.error('Unable to load neighbouring journeys', error);
    return undefined;
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

function LegacyStoryShell({ slug }: { slug: string }) {
  return (
    <main className={heldPlacesStyles.paper}>
      <HeldPlacesHeader />
      <div className={heldPlacesStyles.legacyStory}><LegacyStory slug={slug} /></div>
      <div className="relative z-20 bg-[#f1f0eb]"><HeldPlacesFooter /></div>
    </main>
  );
}
