import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

import { HeldPlacesFooter, HeldPlacesHeader } from '@/components/held-places/HeldPlaces';
import paper from '@/components/held-places/held-places.module.css';
import styles from '@/components/photos/photo-themes.module.css';
import { ThemeTileLink } from '@/components/photos/ThemeTileLink';
import { getCloudinaryMediaProvider } from '@/lib/media/provider';
import { MediaRepository } from '@/lib/media/repository';
import { loadAllPublicPhotos } from '@/lib/photos/gallery';
import type { PublicPhoto } from '@/lib/photos/presentation';
import { PhotosPageRepository } from '@/lib/photos/repository';
import { photoThemes } from '@/lib/photos/themes';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Photo themes' };

async function loadPhotos(): Promise<PublicPhoto[] | null> {
  try {
    const [mediaRepository, photosPageRepository] = await Promise.all([MediaRepository.connect(), PhotosPageRepository.connect()]);
    return await loadAllPublicPhotos(await photosPageRepository.get(), mediaRepository, getCloudinaryMediaProvider());
  } catch (error) {
    console.error('Unable to render Photo themes', error);
    return null;
  }
}

export default async function PhotoThemesPage({ searchParams }: { searchParams: Promise<{ theme?: string | string[] }> }) {
  const requested = (await searchParams).theme;
  const theme = typeof requested === 'string' && requested ? requested : undefined;
  const photos = await loadPhotos();
  const themes = photos ? photoThemes(photos) : [];
  const shown = photos && theme ? photos.filter((photo) => photo.tags.includes(theme)) : photos ?? [];

  return (
    <main className={paper.paper}>
      <HeldPlacesHeader current="photos" />
      <section aria-labelledby="themes-title" className={styles.themes}>
        <h1 id="themes-title">{theme ? <>Photos: <em>{theme}</em></> : 'Photo themes'}</h1>
        <p className={styles.back}><Link href="/photos">Back to albums</Link></p>
        {photos === null ? <p className={styles.empty}>Photos are temporarily unavailable.</p> : <>
          {/* Plain links: prefetching up to 500 photo URLs would cost more than the navigation saves. */}
          <nav aria-label="Themes" className={styles.themeLinks}>
            <a aria-current={theme ? undefined : 'page'} href="/photos/themes">All<span>{photos.length}</span></a>
            {themes.map((item) => <a aria-current={item.tag === theme ? 'page' : undefined} href={`/photos/themes?theme=${encodeURIComponent(item.tag)}`} key={item.tag}>{item.tag}<span>{item.count}</span></a>)}
          </nav>
          {shown.length ? <ul aria-label="Photos" className={styles.wall}>
            {shown.map((photo, index) => <li key={photo.id}>
              <ThemeTileLink label={photo.alt ? undefined : `Photo ${index + 1}`} photoId={photo.id}>
                <Image alt={photo.alt} fill sizes="(max-width: 700px) 33vw, 160px" src={photo.kind === 'video' ? photo.posterUrl : photo.thumbnailUrl} />
              </ThemeTileLink>
            </li>)}
          </ul> : <p className={styles.empty}>{theme ? <>No photos have the theme “{theme}”. <Link href="/photos/themes">See all themes</Link></> : 'Photos, soon.'}</p>}
        </>}
      </section>
      <HeldPlacesFooter />
    </main>
  );
}
