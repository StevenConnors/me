'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';

import styles from './photos-gallery.module.css';
import { PhotosPageView, type PublicPhoto } from './PhotosPageView';

export type { PublicPhoto } from './PhotosPageView';

export function PhotosGallery({ photos }: { photos: PublicPhoto[] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const activePhoto = activeIndex === null ? null : photos[activeIndex];
  const close = useCallback(() => setActiveIndex(null), []);
  const previous = useCallback(() => setActiveIndex((current) => current === null ? 0 : (current - 1 + photos.length) % photos.length), [photos.length]);
  const next = useCallback(() => setActiveIndex((current) => current === null ? 0 : (current + 1) % photos.length), [photos.length]);

  useEffect(() => {
    if (activeIndex === null) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
      if (event.key === 'ArrowLeft') previous();
      if (event.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [activeIndex, close, next, previous]);

  function onTouchStart(event: React.TouchEvent<HTMLDivElement>) {
    const touch = event.changedTouches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  }

  function onTouchEnd(event: React.TouchEvent<HTMLDivElement>) {
    const start = touchStartRef.current;
    const touch = event.changedTouches[0];
    touchStartRef.current = null;
    if (!start || !touch) return;
    const horizontalDistance = touch.clientX - start.x;
    const verticalDistance = touch.clientY - start.y;
    if (Math.abs(verticalDistance) > Math.abs(horizontalDistance) && verticalDistance > 80) close();
    else if (horizontalDistance > 50) previous();
    else if (horizontalDistance < -50) next();
  }

  return (
    <>
      <PhotosPageView onOpen={setActiveIndex} photos={photos} />
      {activePhoto ? (
        <div aria-label={`Photos, ${activeIndex! + 1} of ${photos.length}`} aria-modal="true" className={styles.lightbox} onClick={(event) => { if (event.target === event.currentTarget) close(); }} role="dialog">
          <button aria-label="Close gallery" className={styles.closeButton} onClick={close} ref={closeButtonRef} type="button">×</button>
          <button aria-label="Previous photo" className={`${styles.directionButton} ${styles.previousButton}`} onClick={previous} type="button">←</button>
          <div className={styles.lightboxContent} onTouchEnd={onTouchEnd} onTouchStart={onTouchStart}>
            <div className={styles.lightboxImage}><Image alt={activePhoto.alt} fill priority sizes="(max-width: 900px) 100vw, 85vw" src={activePhoto.source} /></div>
            {activePhoto.caption || activePhoto.captureDate ? <p className={styles.lightboxCaption}>{activePhoto.caption}{activePhoto.caption && activePhoto.captureDate ? ' · ' : ''}{activePhoto.captureDate}</p> : null}
          </div>
          <button aria-label="Next photo" className={`${styles.directionButton} ${styles.nextButton}`} onClick={next} type="button">→</button>
          <p className={styles.position}>{activeIndex! + 1} / {photos.length}</p>
        </div>
      ) : null}
    </>
  );
}
