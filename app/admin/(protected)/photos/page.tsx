import { PhotosWorkspace } from './PhotosWorkspace';
import styles from '@/app/admin/admin.module.css';
import { getCloudinaryMediaProvider } from '@/lib/media/provider';
import { MediaRepository } from '@/lib/media/repository';
import { PhotosPageRepository } from '@/lib/photos/repository';
import { serializePhotosPage } from '@/lib/photos/serializers';

export default async function PhotosEditorPage() {
  try {
    const [photosRepository, mediaRepository, provider] = await Promise.all([
      PhotosPageRepository.connect(),
      MediaRepository.connect(),
      Promise.resolve(getCloudinaryMediaProvider()),
    ]);
    const page = await photosRepository.get();
    if (!page) {
      return <>
        <p className={styles.eyebrow}>Photo-first publishing</p>
        <h1 className={styles.title}>Photos</h1>
        <section className={`${styles.panel} ${styles.error}`}><p className={styles.empty}>The Photos page has not been initialized yet. Run <code>npm run photos:migrate -- --apply</code> before using the authoring canvas; this preserves the current public page during rollout.</p></section>
      </>;
    }

    const mediaIds = page.draftDocument.blocks.flatMap((block) => block.type === 'media' ? [block.mediaAssetId] : []);
    const assets = await mediaRepository.findByIds(mediaIds);
    const editorMedia = assets.map((asset) => ({
      id: asset._id,
      originalFilename: asset.originalFilename,
      width: asset.width,
      height: asset.height,
      captureDate: asset.captureDate,
      caption: asset.caption,
      altText: asset.altText,
      source: asset.resourceType === 'image' && asset.status === 'ready' ? provider.buildImageUrl({
        providerPublicId: asset.providerPublicId,
        version: asset.version,
        width: 768,
        sourceWidth: asset.width,
        sourceHeight: asset.height,
      }) : undefined,
    }));
    const serialized = serializePhotosPage(page);

    return <>
      <p className={styles.eyebrow}>Photo-first publishing</p>
      <h1 className={styles.title}>Photos</h1>
      <p className={styles.lede}>Arrange the published page directly. Edits are autosaved to a private draft and become public only when you publish.</p>
      <PhotosWorkspace initialDocument={serialized.draftDocument} initialDraftVersion={serialized.draftVersion} initialHasUnpublishedChanges={serialized.hasUnpublishedChanges} media={editorMedia} />
    </>;
  } catch (error) {
    console.error('Unable to render the Photos editor', error);
    return <>
      <p className={styles.eyebrow}>Photo-first publishing</p>
      <h1 className={styles.title}>Photos</h1>
      <section className={`${styles.panel} ${styles.error}`}><p className={styles.empty}>The Photos editor could not reach its server-only services. Check the database and media-provider configuration, then reload.</p></section>
    </>;
  }
}
