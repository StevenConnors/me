import { MediaUploadPanel } from './MediaUploadPanel';
import styles from '@/app/admin/admin.module.css';
import { MediaRepository } from '@/lib/media/repository';

export default async function MediaPage() {
  let media: Awaited<ReturnType<MediaRepository['list']>> = [];
  let loadError = false;
  try {
    media = await (await MediaRepository.connect()).list();
  } catch (error) {
    console.error('Unable to render media library', error);
    loadError = true;
  }

  return (
    <>
      <p className={styles.eyebrow}>Application media library</p>
      <h1 className={styles.title}>Media</h1>
      <p className={styles.lede}>Your photographs live here as reusable records. Journeys will refer to them by an internal ID, not a provider path.</p>
      <div className={styles.toolbar}><span className={styles.meta}>{media.length} {media.length === 1 ? 'asset' : 'assets'}</span></div>
      <MediaUploadPanel />
      <div className={styles.toolbar}><span className={styles.eyebrow}>Library</span></div>
      {loadError ? (
        <section className={`${styles.panel} ${styles.error}`}><p className={styles.empty}>The library could not reach MongoDB. Check the server-only database configuration, then reload.</p></section>
      ) : media.length ? (
        <section className={styles.journeyList} aria-label="Media library">
          {media.map((asset) => (
            <article className={styles.journeyCard} key={asset._id}>
              <strong className={styles.journeyCardTitle}>{asset.title || asset.originalFilename}</strong>
              <span className={styles.journeyCardFooter}>
                <span>{asset.width}×{asset.height} · {asset.format.toUpperCase()}</span>
                <span className={styles.badge}>{asset.status}</span>
                <span>{asset.tags.length ? asset.tags.join(', ') : 'untagged'}</span>
              </span>
            </article>
          ))}
        </section>
      ) : (
        <section className={styles.panel}><p className={styles.empty}>No media records yet. Upload an original once, then reuse it across covers, galleries, and story steps.</p></section>
      )}
    </>
  );
}
