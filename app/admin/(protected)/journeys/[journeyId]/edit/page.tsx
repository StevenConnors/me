import { notFound } from 'next/navigation';

import { JourneyWorkspace } from './JourneyWorkspace';
import styles from '@/app/admin/admin.module.css';
import type { EditorMedia } from '@/components/editor/JourneyVisualEditor';
import { loadJourneyEditorMedia } from '@/lib/journeys/editor-media';
import { JourneyRepository } from '@/lib/journeys/repository';
import { findJourneyRevision } from '@/lib/journeys/revisions';
import { journeyReleaseSnapshot } from '@/lib/journeys/release-status';
import { getCloudinaryMediaProvider } from '@/lib/media/provider';
import { MediaRepository } from '@/lib/media/repository';

export default async function JourneyEditPage({ params }: { params: Promise<{ journeyId: string }> }) {
  const { journeyId } = await params;
  let journey;
  let repository;
  try {
    repository = await JourneyRepository.connect();
    journey = await repository.findById(journeyId);
  } catch (error) {
    console.error('Unable to load journey editor', error);
    throw error;
  }
  if (!journey) notFound();
  const publishedRevision = journey.status === 'published' && journey.publishedRevisionId && repository.revisions
    ? await findJourneyRevision(repository.revisions, journey._id, journey.publishedRevisionId)
    : null;

  let media: EditorMedia[] = [];
  try {
    const repository = await MediaRepository.connect();
    let provider: ReturnType<typeof getCloudinaryMediaProvider> | null = null;
    try { provider = getCloudinaryMediaProvider(); } catch { provider = null; }
    media = await loadJourneyEditorMedia(journey, repository, provider);
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
        publishedSlug: journey.publishedSlug,
        summary: journey.summary,
        cover: journey.cover,
        experiencedAt: journey.experiencedAt,
        locations: journey.locations,
        social: journey.social,
        status: journey.status,
        editVersion: journey.editVersion,
        draftDocument: journey.draftDocument,
      }} initialPublishedSnapshot={publishedRevision ? journeyReleaseSnapshot({
        ...publishedRevision.metadataSnapshot,
        draftDocument: publishedRevision.document,
      }) : null} media={media} />
    </>
  );
}
