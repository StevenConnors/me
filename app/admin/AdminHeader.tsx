'use client';

import { useState } from 'react';
import Link from 'next/link';
import { signOut } from 'next-auth/react';

import styles from './admin.module.css';

export function AdminHeader({ email }: { email?: string | null }) {
  const [navigationOpen, setNavigationOpen] = useState(false);
  return (
    <header className={styles.header}>
      <Link href="/admin/journeys" className={styles.brand}>Yuji / editor</Link>
      <button aria-controls="admin-navigation" aria-expanded={navigationOpen} aria-label={`${navigationOpen ? 'Close' : 'Open'} admin navigation`} className={styles.mobileNavigationButton} onClick={() => setNavigationOpen((open) => !open)} type="button">
        {navigationOpen ? 'Close' : 'Menu'}
      </button>
      <nav className={`${styles.navigation} ${navigationOpen ? styles.navigationOpen : ''}`} aria-label="Admin navigation" id="admin-navigation" onClick={() => setNavigationOpen(false)}>
        <Link href="/admin/journeys" className={styles.navLink}>Journeys</Link>
        <Link href="/admin/analytics" className={styles.navLink}>Analytics</Link>
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
