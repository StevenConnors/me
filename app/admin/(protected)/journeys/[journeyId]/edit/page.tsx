import { notFound } from 'next/navigation';

import { JourneyWorkspace } from './JourneyWorkspace';
import styles from '@/app/admin/admin.module.css';
import type { EditorMedia } from '@/components/editor/JourneyVisualEditor';
import { JourneyRepository } from '@/lib/journeys/repository';
import { getCloudinaryMediaProvider } from '@/lib/media/provider';
import { MediaRepository } from '@/lib/media/repository';

export default async function JourneyEditPage({ params }: { params: Promise<{ journeyId: string }> }) {
  const { journeyId } = await params;
  let journey;
  try {
    journey = await (await JourneyRepository.connect()).findById(journeyId);
  } catch (error) {
    console.error('Unable to load journey editor', error);
    throw error;
  }
  if (!journey) notFound();

  let media: EditorMedia[] = [];
  try {
    const assets = await (await MediaRepository.connect()).list({ limit: 100 });
    let provider: ReturnType<typeof getCloudinaryMediaProvider> | null = null;
    try { provider = getCloudinaryMediaProvider(); } catch { provider = null; }
    media = assets.map((asset) => ({
      id: asset._id,
      title: asset.title || asset.originalFilename,
      width: asset.width,
      height: asset.height,
      altText: asset.altText,
      previewUrl: provider && asset.resourceType === 'image'
        ? provider.buildImageUrl({ providerPublicId: asset.providerPublicId, version: asset.version, width: 768, sourceWidth: asset.width, sourceHeight: asset.height })
        : undefined,
    }));
  } catch (error) {
    console.error('Unable to load editor media', error);
  }

  return (
    <>
      <p className={styles.eyebrow}>Private journey editor</p>
      <h1 className={styles.title}>{journey.title || 'Untitled journey'}</h1>
      <p className={styles.lede}>This draft is separate from the public journey. It can be revised freely until you decide it is ready to publish.</p>
      <JourneyWorkspace initialJourney={{
        _id: journey._id.toHexString(),
        title: journey.title,
        slug: journey.slug,
        summary: journey.summary,
        cover: journey.cover,
        status: journey.status,
        editVersion: journey.editVersion,
        draftDocument: journey.draftDocument,
      }} media={media} />
    </>
  );
}
