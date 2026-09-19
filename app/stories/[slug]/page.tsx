import { LegacyStory } from './LegacyStory';
import { isLegacyStorySlug } from './legacyStorySlugs';
import { notFound } from 'next/navigation';
import { JourneyRenderer } from '@/components/journey/JourneyRenderer';
import type { JourneyMediaAsset } from '@/components/journey/types';
import { findJourneyRevision } from '@/lib/journeys/revisions';
import { JourneyRepository } from '@/lib/journeys/repository';
import { getCloudinaryMediaProvider } from '@/lib/media/provider';
import { MediaRepository } from '@/lib/media/repository';

export const dynamic = 'force-dynamic';

function isNotFoundError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'digest' in error &&
      (error as { digest?: unknown }).digest === 'NEXT_HTTP_ERROR_FALLBACK;404',
  );
}

export default async function StoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const journeyRepository = await JourneyRepository.connect();
    const journey = await journeyRepository.findBySlug(slug);
    if (!journey || journey.status !== 'published' || !journey.publishedRevisionId || !journeyRepository.revisions) {
      if (isLegacyStorySlug(slug)) return <LegacyStory slug={slug} />;
      notFound();
    }
    const revision = await findJourneyRevision(journeyRepository.revisions, journey._id, journey.publishedRevisionId);
    if (!revision) {
      if (isLegacyStorySlug(slug)) return <LegacyStory slug={slug} />;
      notFound();
    }

    const records = await (await MediaRepository.connect()).list({ limit: 100 });
    let provider: ReturnType<typeof getCloudinaryMediaProvider> | null = null;
    try { provider = getCloudinaryMediaProvider(); } catch { provider = null; }
    const byId = new Map(records.map((asset) => [asset._id, asset]));
    const assets = Object.fromEntries(records.map((asset) => [asset._id, {
      id: asset._id,
      resourceType: asset.resourceType,
      width: asset.width,
      height: asset.height,
      title: asset.title,
      caption: asset.caption,
      altText: asset.altText,
      originalFilename: asset.originalFilename,
    } satisfies JourneyMediaAsset]));

    return (
      <main>
        <header style={{ maxWidth: '44rem', margin: '0 auto', padding: '48px 16px 0' }}>
          <p style={{ color: '#6c6a65', font: '11px/1 ui-monospace, SFMono-Regular, Menlo, monospace', letterSpacing: '.1em', textTransform: 'uppercase' }}>Journey</p>
          <h1 style={{ margin: '14px 0 0', font: '400 clamp(40px, 8vw, 88px)/.93 Georgia, serif', letterSpacing: '-.06em' }}>{revision.metadataSnapshot.title}</h1>
          {revision.metadataSnapshot.summary ? <p style={{ margin: '20px 0 0', color: '#625b50', fontSize: '18px', lineHeight: 1.5 }}>{revision.metadataSnapshot.summary}</p> : null}
        </header>
        <JourneyRenderer
          document={revision.document}
          assets={assets}
          buildMediaUrl={({ asset, placement, viewport, width }) => {
            const record = byId.get(asset.id ?? placement.mediaAssetId);
            if (!record || !provider) return null;
            if (record.resourceType === 'video') {
              return provider.buildVideoUrl({ providerPublicId: record.providerPublicId, version: record.version, width, format: record.format === 'webm' ? 'webm' : 'mp4' });
            }
            return provider.buildImageUrl({ providerPublicId: record.providerPublicId, version: record.version, width, sourceWidth: record.width, sourceHeight: record.height, crop: placement.crop?.[viewport] });
          }}
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
