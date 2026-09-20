'use client';

import { useState, type ReactNode } from 'react';

import styles from './JourneyPreviewFrame.module.css';

export function JourneyPreviewFrame({ children }: { children: ReactNode }) {
  const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop');

  return (
    <section className={styles.preview} aria-label="Responsive journey preview">
      <div className={styles.controls}>
        <div>
          <p className={styles.eyebrow}>Read-only preview</p>
          <p className={styles.copy}>This uses the same responsive renderer and Cloudinary delivery settings as the public route.</p>
        </div>
        <div className={styles.viewportButtons}>
          <button className={viewport === 'desktop' ? styles.active : styles.button} type="button" onClick={() => setViewport('desktop')}>Desktop</button>
          <button className={viewport === 'mobile' ? styles.active : styles.button} type="button" onClick={() => setViewport('mobile')}>Mobile</button>
        </div>
      </div>
      <div className={styles.stage}>
        <div className={styles.frame} data-viewport={viewport}>
          <div className={styles.frameBar}><span /><span /><span /><b>{viewport === 'mobile' ? '390 px' : '1280 px'} preview</b></div>
          {children}
        </div>
      </div>
    </section>
  );
}
