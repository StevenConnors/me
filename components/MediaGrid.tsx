'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';

import styles from './mediaGrid.module.css';

export type GalleryMediaKind = 'photo' | 'video';

export type GalleryMediaItem = {
  id: string;
  kind: GalleryMediaKind;
  src: string;
  thumbnailSrc: string;
  alt: string;
  width: number;
  height: number;
};

export function MediaGrid({
  title,
  items,
  portrait = false,
}: {
  title: string;
  items: GalleryMediaItem[];
  portrait?: boolean;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const activeItem = activeIndex === null ? null : items[activeIndex];

  const close = useCallback(() => setActiveIndex(null), []);
  const showPrevious = useCallback(() => {
    setActiveIndex((current) => current === null ? 0 : (current - 1 + items.length) % items.length);
  }, [items.length]);
  const showNext = useCallback(() => {
    setActiveIndex((current) => current === null ? 0 : (current + 1) % items.length);
  }, [items.length]);

  useEffect(() => {
    if (activeIndex === null) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
      if (event.key === 'ArrowLeft') showPrevious();
      if (event.key === 'ArrowRight') showNext();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [activeIndex, close, showNext, showPrevious]);

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.changedTouches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    const start = touchStartRef.current;
    const touch = event.changedTouches[0];
    touchStartRef.current = null;
    if (!start || !touch) return;

    const horizontalDistance = touch.clientX - start.x;
    const verticalDistance = touch.clientY - start.y;

    if (Math.abs(verticalDistance) > Math.abs(horizontalDistance) && verticalDistance > 80) {
      close();
    } else if (horizontalDistance > 50) {
      showPrevious();
    } else if (horizontalDistance < -50) {
      showNext();
    }
  };

  return (
    <section className={styles.gallery} aria-labelledby={`${title.toLowerCase()}-gallery-title`}>
      <h1 className={styles.visuallyHidden} id={`${title.toLowerCase()}-gallery-title`}>{title}</h1>
      <div className={`${styles.grid} ${portrait ? styles.portraitGrid : ''}`}>
        {items.map((item, index) => (
          <button
            aria-label={`Open ${item.kind} ${index + 1}`}
            className={styles.tile}
            data-kind={item.kind}
            key={item.id}
            onClick={() => setActiveIndex(index)}
            style={{ aspectRatio: `${item.width} / ${item.height}` }}
            type="button"
          >
            <Image
              alt={item.alt}
              className={styles.image}
              fill
              sizes={portrait ? '(max-width: 768px) 50vw, 25vw' : '(max-width: 768px) 50vw, 33vw'}
              src={item.thumbnailSrc}
              unoptimized
            />
            {item.kind === 'video' ? <span className={styles.videoMarker}>Video</span> : null}
          </button>
        ))}
      </div>

      {activeItem ? (
        <div
          aria-label={`${title}, ${activeIndex! + 1} of ${items.length}`}
          aria-modal="true"
          className={styles.lightbox}
          onClick={(event) => {
            if (event.target === event.currentTarget) close();
          }}
          role="dialog"
        >
          <button
            aria-label="Close gallery"
            className={styles.closeButton}
            onClick={close}
            ref={closeButtonRef}
            type="button"
          >
            <span aria-hidden="true">×</span>
          </button>
          <button
            aria-label="Previous item"
            className={`${styles.directionButton} ${styles.previousButton}`}
            onClick={showPrevious}
            type="button"
          >
            <span aria-hidden="true">←</span>
          </button>
          <div
            className={`${styles.lightboxMedia} ${portrait ? styles.portraitLightboxMedia : ''}`}
            onTouchEnd={handleTouchEnd}
            onTouchStart={handleTouchStart}
          >
            {activeItem.kind === 'video' ? (
              <video className={styles.lightboxVideo} controls playsInline poster={activeItem.thumbnailSrc} preload="none" src={activeItem.src} />
            ) : (
              <Image alt={activeItem.alt} className={styles.fullImage} fill priority sizes="100vw" src={activeItem.src} unoptimized />
            )}
          </div>
          <button
            aria-label="Next item"
            className={`${styles.directionButton} ${styles.nextButton}`}
            onClick={showNext}
            type="button"
          >
            <span aria-hidden="true">→</span>
          </button>
          <p className={styles.position} aria-live="polite">{activeIndex! + 1} / {items.length}</p>
        </div>
      ) : null}
    </section>
  );
}
