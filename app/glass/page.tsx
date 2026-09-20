import { HeldPlacesHeader } from '@/components/held-places/HeldPlaces';
import { MediaGrid, type GalleryMediaItem } from '@/components/MediaGrid';
import styles from '@/components/held-places/held-places.module.css';

const glass: GalleryMediaItem[] = [
  { id: 'glass-01', kind: 'photo' },
  { id: 'glass-02', kind: 'video' },
  { id: 'glass-03', kind: 'photo' },
  { id: 'glass-04', kind: 'photo' },
];

export default function GlassPage() {
  return (
    <main className={styles.paper}>
      <HeldPlacesHeader />
      <MediaGrid
        items={glass}
        placeholderImage="/gallery-placeholders/glass-contact-sheet.png"
        portrait
        title="Glass"
      />
    </main>
  );
}
