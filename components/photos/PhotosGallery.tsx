'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';

import styles from './photos-gallery.module.css';
import { PhotosPageView, type PublicPhoto } from './PhotosPageView';

export type { PublicPhoto } from './PhotosPageView';

export function PhotosGallery({
  initialItems,
  initialCursor,
}: {
  initialItems: PublicPhoto[];
  initialCursor: string | null;
}) {
  const [photos, setPhotos] = useState(initialItems);
  const [nextCursor, setNextCursor] = useState(initialCursor);
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [loadedMessage, setLoadedMessage] = useState('');
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const lightboxRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const loadingRef = useRef(false);
  const activePhoto = activeIndex === null ? null : photos[activeIndex];
  const open = useCallback((index: number) => {
    triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setActiveIndex(index);
  }, []);
  const close = useCallback(() => {
    setActiveIndex(null);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);
  const previous = useCallback(() => setActiveIndex((current) => current === null ? 0 : (current - 1 + photos.length) % photos.length), [photos.length]);
  const next = useCallback(() => setActiveIndex((current) => current === null ? 0 : (current + 1) % photos.length), [photos.length]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingRef.current) return;
    loadingRef.current = true;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoadState('loading');
    try {
      const parameters = new URLSearchParams({ limit: '24', cursor: nextCursor });
      const response = await fetch(`/api/photos?${parameters.toString()}`, { signal: controller.signal });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? 'Unable to load more photos');
      const items = payload.items as PublicPhoto[];
      setPhotos((current) => [...current, ...items.filter((item) => !current.some((known) => known.id === item.id))]);
      setNextCursor((payload.nextCursor as string | null) ?? null);
      setLoadedMessage(items.length ? `${items.length} more photo${items.length === 1 ? '' : 's'} loaded.` : 'No additional photos were loaded.');
      setLoadState('idle');
    } catch (error) {
      if ((error as DOMException).name !== 'AbortError') {
        console.error(error);
        setLoadState('error');
      }
    } finally {
      loadingRef.current = false;
    }
  }, [nextCursor]);

  useEffect(() => {
    if (activeIndex === null) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
      if (event.key === 'ArrowLeft') previous();
      if (event.key === 'ArrowRight') next();
      if (event.key === 'Tab') {
        const focusable = Array.from(lightboxRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), video[controls]') ?? [])
          .filter((element) => !element.hasAttribute('hidden'));
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable.at(-1)!;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [activeIndex, close, next, previous]);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (!nextCursor || !sentinelRef.current || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadMore();
    }, { rootMargin: '800px 0px' });
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [loadMore, nextCursor]);

  useEffect(() => {
    if (activeIndex !== null && nextCursor && activeIndex >= photos.length - 4) void loadMore();
  }, [activeIndex, loadMore, nextCursor, photos.length]);

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
      <PhotosPageView onOpen={open} photos={photos} />
      {nextCursor ? <div className={styles.loader} ref={sentinelRef}>
        {loadState === 'error' ? <p>More photos could not be loaded.</p> : null}
        <button disabled={loadState === 'loading'} onClick={() => void loadMore()} type="button">{loadState === 'loading' ? 'Loading…' : loadState === 'error' ? 'Try again' : 'Load more'}</button>
      </div> : null}
      <p aria-live="polite" className="sr-only">{loadedMessage}</p>
      {activePhoto ? (
        <div aria-label={`Photos, ${activeIndex! + 1} of ${photos.length}`} aria-modal="true" className={styles.lightbox} onClick={(event) => { if (event.target === event.currentTarget) close(); }} ref={lightboxRef} role="dialog">
          <button aria-label="Close gallery" className={styles.closeButton} onClick={close} ref={closeButtonRef} type="button">×</button>
          <button aria-label="Previous photo" className={`${styles.directionButton} ${styles.previousButton}`} onClick={previous} type="button">←</button>
          <div className={styles.lightboxContent} onTouchEnd={onTouchEnd} onTouchStart={onTouchStart}>
            <div className={styles.lightboxImage}>{activePhoto.kind === 'video' && activePhoto.playbackUrl ? <video className={styles.lightboxVideo} controls playsInline poster={activePhoto.posterUrl ?? activePhoto.source} preload="none" src={activePhoto.playbackUrl} /> : <Image alt={activePhoto.alt} fill priority sizes="(max-width: 900px) 100vw, 85vw" src={activePhoto.displayUrl ?? activePhoto.displaySource ?? activePhoto.source} />}</div>
            {activePhoto.caption || activePhoto.captureDate ? <p className={styles.lightboxCaption}>{activePhoto.caption}{activePhoto.caption && activePhoto.captureDate ? ' · ' : ''}{activePhoto.captureDate}</p> : null}
          </div>
          <button aria-label="Next photo" className={`${styles.directionButton} ${styles.nextButton}`} onClick={next} type="button">→</button>
          <p className={styles.position}>{activeIndex! + 1} / {photos.length}</p>
        </div>
      ) : null}
    </>
  );
}
