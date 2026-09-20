'use client';

import Link from 'next/link';
import { signOut } from 'next-auth/react';

import styles from './admin.module.css';

export function AdminHeader({ email }: { email?: string | null }) {
  return (
    <header className={styles.header}>
      <Link href="/admin/journeys" className={styles.brand}>Yuji / editor</Link>
      <nav className={styles.navigation} aria-label="Admin navigation">
        <Link href="/admin/journeys" className={styles.navLink}>Journeys</Link>
        <Link href="/admin/photos" className={styles.navLink}>Photos</Link>
        <Link href="/admin/media" className={styles.navLink}>Media</Link>
        <Link href="/" className={styles.navLink}>View site ↗</Link>
      </nav>
      <div className={styles.headerActions}>
        <span className={styles.identity}>{email ?? 'Configured author'}</span>
        <button className={styles.quietButton} type="button" onClick={() => signOut({ callbackUrl: '/' })}>
          Sign out
        </button>
      </div>
    </header>
  );
}
