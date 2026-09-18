import Link from 'next/link';
import { notFound } from 'next/navigation';

import { JourneyPreviewFrame } from '@/components/journey/JourneyPreviewFrame';
import { JourneyRenderer } from '@/components/journey/JourneyRenderer';
import type { JourneyMediaAsset } from '@/components/journey/types';
import styles from '@/app/admin/admin.module.css';
import { JourneyRepository } from '@/lib/journeys/repository';
import { getCloudinaryMediaProvider } from '@/lib/media/provider';
import { MediaRepository } from '@/lib/media/repository';

export default async function JourneyPreviewPage({ params }: { params: Promise<{ journeyId: string }> }) {
  const { journeyId } = await params;
  let journey;
  try {
    journey = await (await JourneyRepository.connect()).findById(journeyId);
  } catch (error) {
    console.error('Unable to load journey preview', error);
    throw error;
  }
  if (!journey) notFound();

  let records: Awaited<ReturnType<MediaRepository['list']>> = [];
  try {
    records = await (await MediaRepository.connect()).list({ limit: 100 });
  } catch (error) {
    console.error('Unable to load preview media', error);
  }
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
    <>
      <Link className={styles.quietButton} href={`/admin/journeys/${journey._id.toHexString()}/edit`}>← Back to editor</Link>
      <p className={styles.eyebrow} style={{ marginTop: 28 }}>Journey preview</p>
      <h1 className={styles.title}>{journey.title || 'Untitled journey'}</h1>
      <p className={styles.lede}>Previewing the current draft. It has not changed the public archive.</p>
      <JourneyPreviewFrame>
        <JourneyRenderer
          document={journey.draftDocument}
          assets={assets}
          buildMediaUrl={({ asset, placement, viewport, width }) => {
            const record = byId.get(asset.id ?? placement.mediaAssetId);
            if (!record || !provider) return null;
            if (record.resourceType === 'video') {
              return provider.buildVideoUrl({ providerPublicId: record.providerPublicId, version: record.version, width, format: record.format === 'webm' ? 'webm' : 'mp4' });
            }
            return provider.buildImageUrl({
              providerPublicId: record.providerPublicId,
              version: record.version,
              width,
              sourceWidth: record.width,
              sourceHeight: record.height,
              crop: placement.crop?.[viewport],
            });
          }}
        />
      </JourneyPreviewFrame>
    </>
  );
}
