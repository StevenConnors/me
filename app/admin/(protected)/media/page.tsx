import { MediaLibraryWorkspace } from './MediaLibraryWorkspace';
import styles from '@/app/admin/admin.module.css';

export default function MediaPage() {
  return <>
    <p className={styles.eyebrow}>Application media library</p>
    <h1 className={styles.title}>Media</h1>
    <p className={styles.lede}>Upload once, organize into collections, and reuse photographs in Photos and Journeys. Uploading does not publish anything.</p>
    <MediaLibraryWorkspace />
  </>;
}
