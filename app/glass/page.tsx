import { HeldPlacesHeader } from '@/components/held-places/HeldPlaces';
import { MediaGrid, type GalleryMediaItem } from '@/components/MediaGrid';
import styles from '@/components/held-places/held-places.module.css';
import { loadGlassGallery } from '@/lib/glass/gallery';

export const revalidate = 300;

export default async function GlassPage() {
  let glass: GalleryMediaItem[] = [];
  let unavailable = false;
  try {
    glass = await loadGlassGallery();
  } catch {
    console.error('Unable to render the Glass collection');
    unavailable = true;
  }

  return (
    <main className={styles.paper}>
      <HeldPlacesHeader />
      {unavailable ? (
        <section className={styles.indexEmpty}><h1>Glass is temporarily unavailable.</h1><p>Please try again shortly.</p></section>
      ) : glass.length ? (
        <MediaGrid items={glass} portrait title="Glass" />
      ) : (
        <section className={styles.indexEmpty}><h1>Glass, soon.</h1><p>The next collection is being prepared.</p></section>
      )}
    </main>
  );
}
