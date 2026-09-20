import { PhotosWorkspace } from './PhotosWorkspace';
import styles from '@/app/admin/admin.module.css';
import { getCloudinaryMediaProvider } from '@/lib/media/provider';
import { MediaRepository } from '@/lib/media/repository';

export default async function PhotosEditorPage() {
  let photos: Awaited<ReturnType<MediaRepository['listPhotos']>> = [];
  let loadError = false;
  try {
    photos = await (await MediaRepository.connect()).listPhotos();
  } catch (error) {
    console.error('Unable to render the Photos editor', error);
    loadError = true;
  }

  let provider: ReturnType<typeof getCloudinaryMediaProvider> | null = null;
  try {
    provider = getCloudinaryMediaProvider();
  } catch {
    provider = null;
  }

  const editorPhotos = photos.map((photo) => ({
    id: photo._id,
    originalFilename: photo.originalFilename,
    width: photo.width,
    height: photo.height,
    captureDate: photo.captureDate,
    caption: photo.caption,
    altText: photo.altText,
    photoSectionBreak: photo.photoSectionBreak,
    source: provider?.buildImageUrl({
      providerPublicId: photo.providerPublicId,
      version: photo.version,
      width: 480,
      sourceWidth: photo.width,
      sourceHeight: photo.height,
    }),
  }));

  return (
    <>
      <p className={styles.eyebrow}>Photo-first publishing</p>
      <h1 className={styles.title}>Photos</h1>
      <p className={styles.lede}>Upload a batch, then shape the public Photos tab around when each image was taken. The newest dates appear first.</p>
      {loadError ? (
        <section className={`${styles.panel} ${styles.error}`}><p className={styles.empty}>The Photos editor could not reach MongoDB. Check the server-only database configuration, then reload.</p></section>
      ) : (
        <PhotosWorkspace photos={editorPhotos} />
      )}
    </>
  );
}
