import Link from 'next/link';
import { notFound } from 'next/navigation';

import { JourneyMetadataForm } from './JourneyMetadataForm';
import styles from '@/app/admin/admin.module.css';
import { JourneyRepository } from '@/lib/journeys/repository';

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

  return (
    <>
      <p className={styles.eyebrow}>Journey metadata</p>
      <h1 className={styles.title}>{journey.title || 'Untitled journey'}</h1>
      <p className={styles.lede}>This first editor layer makes the journey durable and private. The visual writing canvas and media blocks build on this draft in the next stack.</p>
      <JourneyMetadataForm initialJourney={{
        _id: journey._id.toHexString(),
        title: journey.title,
        slug: journey.slug,
        summary: journey.summary,
        editVersion: journey.editVersion,
      }} />
      <p className={styles.notice}>
        The document is already versioned and ready for visual blocks. Continue to the <Link href="/admin/journeys">journey dashboard</Link> while the media and canvas layers are added.
      </p>
    </>
  );
}
