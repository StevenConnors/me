import styles from '@/app/admin/admin.module.css';

export default function MediaPage() {
  return (
    <>
      <p className={styles.eyebrow}>Application media library</p>
      <h1 className={styles.title}>Media</h1>
      <section className={styles.panel}>
        <p className={styles.empty}>The provider foundation is ready. Signed uploads, metadata, and reusable media selection arrive in the next stacked change.</p>
      </section>
    </>
  );
}
