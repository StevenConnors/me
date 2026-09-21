import { HeldPlacesHeader } from '@/components/held-places/HeldPlaces';
import { PhotosGallery } from '@/components/photos/PhotosGallery';
import styles from '@/components/held-places/held-places.module.css';
import { getCloudinaryMediaProvider } from '@/lib/media/provider';
import { MediaRepository } from '@/lib/media/repository';
import { loadPublicPhotosPage } from '@/lib/photos/gallery';
import type { PublicPhoto } from '@/lib/photos/presentation';
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
    const page = await loadPublicPhotosPage(
      await photosPageRepository.get(), mediaRepository, provider, { limit: 24 },
    );
    photos = page.items;
    if (page.unavailable.length) console.error('Photos page skipped unavailable published media', page.unavailable);
    return (
      <main className={`${styles.paper} ${styles.photosPaper}`}>
        <HeldPlacesHeader />
        {photos.length ? <PhotosGallery initialCursor={page.nextCursor} initialItems={photos} /> : <section className={styles.indexEmpty}><h1>Photos, soon.</h1><p>The next collection is being prepared.</p></section>}
      </main>
    );
  } catch (error) {
    console.error('Unable to render Photos', error);
    unavailable = true;
  }

  return (
    <main className={`${styles.paper} ${styles.photosPaper}`}>
      <HeldPlacesHeader />
      {unavailable ? <section className={styles.indexEmpty}><h1>Photos are temporarily unavailable.</h1></section> : photos.length ? <PhotosGallery initialCursor={null} initialItems={photos} /> : <section className={styles.indexEmpty}><h1>Photos, soon.</h1><p>The next collection is being prepared.</p></section>}
    </main>
  );
}
