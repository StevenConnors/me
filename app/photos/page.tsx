import { HeldPlacesHeader } from '@/components/held-places/HeldPlaces';
import { PhotosGallery } from '@/components/photos/PhotosGallery';
import styles from '@/components/held-places/held-places.module.css';
import { getCloudinaryMediaProvider } from '@/lib/media/provider';
import { MediaRepository } from '@/lib/media/repository';
import { resolveLegacyPhotos, resolvePublishedPhotos, type PublicPhoto } from '@/lib/photos/presentation';
import { PhotosPageRepository } from '@/lib/photos/repository';

export const dynamic = 'force-dynamic';

export default async function PhotosPage() {
  let photos: PublicPhoto[] = [];
  let unavailable = false;
  try {
    const [mediaRepository, photosPageRepository, provider] = await Promise.all([
      MediaRepository.connect(),
      PhotosPageRepository.connect(),
      Promise.resolve(getCloudinaryMediaProvider()),
    ]);
    const page = await photosPageRepository.get();
    if (page?.publishedDocument) {
      const mediaIds = page.publishedDocument.blocks.flatMap((block) => (
        block.type === 'media' ? [block.mediaAssetId] : []
      ));
      const resolved = resolvePublishedPhotos(
        page.publishedDocument,
        await mediaRepository.findByIds(mediaIds),
        provider,
      );
      if (resolved.unavailable.length) {
        console.error('Photos page skipped unavailable published media', resolved.unavailable);
      }
      photos = resolved.photos;
    } else {
      // Rollout fallback: legacy query remains public until migration publishes
      // a Photos page document, so schema deployment cannot cause downtime.
      photos = resolveLegacyPhotos(await mediaRepository.listPhotos(), provider);
    }
  } catch (error) {
    console.error('Unable to render Photos', error);
    unavailable = true;
  }

  return (
    <main className={`${styles.paper} ${styles.photosPaper}`}>
      <HeldPlacesHeader />
      {unavailable ? <section className={styles.indexEmpty}><h1>Photos are temporarily unavailable.</h1></section> : photos.length ? <PhotosGallery photos={photos} /> : <section className={styles.indexEmpty}><h1>Photos, soon.</h1><p>The next collection is being prepared.</p></section>}
    </main>
  );
}
