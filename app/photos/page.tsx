import { HeldPlacesHeader } from '@/components/held-places/HeldPlaces';
import { PhotosGallery, type PublicPhoto } from '@/components/photos/PhotosGallery';
import styles from '@/components/held-places/held-places.module.css';
import { getCloudinaryMediaProvider } from '@/lib/media/provider';
import { MediaRepository } from '@/lib/media/repository';

export const dynamic = 'force-dynamic';

export default async function PhotosPage() {
  let photos: PublicPhoto[] = [];
  let unavailable = false;
  try {
    const [records, provider] = await Promise.all([
      (await MediaRepository.connect()).listPhotos(),
      Promise.resolve(getCloudinaryMediaProvider()),
    ]);
    photos = records.map((photo) => ({
      id: photo._id,
      source: provider.buildImageUrl({
        providerPublicId: photo.providerPublicId,
        version: photo.version,
        width: 1440,
        sourceWidth: photo.width,
        sourceHeight: photo.height,
      }),
      alt: photo.altText ?? photo.caption ?? photo.originalFilename,
      width: photo.width,
      height: photo.height,
      caption: photo.caption,
      captureDate: photo.captureDate,
      sectionBreak: photo.photoSectionBreak,
    }));
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
