'use client';

import React from 'react';
import { useCallback, useRef, useState, type CSSProperties } from 'react';

import styles from './held-places.module.css';
import type { HeldPlacesSlide } from './types';

export function HeldPlacesCarousel({ slides }: { slides: HeldPlacesSlide[] }) {
  const [current, setCurrent] = useState(0);
  const viewport = useRef<HTMLDivElement>(null);
  const imageOnly = slides.every((slide) => slide.kind !== 'video');
  const itemName = imageOnly ? 'photograph' : 'media';

  const goTo = useCallback((next: number) => {
    const bounded = Math.max(0, Math.min(slides.length - 1, next));
    viewport.current?.querySelectorAll('video').forEach((video) => video.pause());
    setCurrent(bounded);
    viewport.current?.children[bounded]?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'start',
    });
  }, [slides.length]);

  function handleScroll() {
    const element = viewport.current;
    if (!element || !element.clientWidth) return;
    const next = Math.max(0, Math.min(
      slides.length - 1,
      Math.round(element.scrollLeft / element.clientWidth),
    ));
    Array.from(element.children).forEach((slide, index) => {
      if (index !== next) slide.querySelector('video')?.pause();
    });
    setCurrent(next);
  }

  return (
    <section
      aria-label={imageOnly ? `Photograph carousel, ${slides.length} images` : `Media carousel, ${slides.length} items`}
      className={styles.carousel}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          goTo(current - 1);
        }
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          goTo(current + 1);
        }
      }}
      tabIndex={0}
    >
      <div
        className={styles.carouselViewport}
        onScroll={handleScroll}
        ref={viewport}
      >
        {slides.map((slide, index) => (
          <figure className={styles.carouselSlide} key={`${slide.id}-${index}`}>
            <HeldPlacesPicture slide={slide} eager={index < 2} />
            {slide.caption ? (
              <figcaption className={styles.caption}>{slide.caption}</figcaption>
            ) : null}
          </figure>
        ))}
      </div>
      <div className={styles.carouselControls}>
        <button
          aria-label={`Previous ${itemName}`}
          disabled={current === 0}
          onClick={() => goTo(current - 1)}
          type="button"
        >
          ←
        </button>
        <span aria-live="polite" className={styles.carouselStatus}>
          {current + 1} / {slides.length}
        </span>
        <button
          aria-label={`Next ${itemName}`}
          disabled={current === slides.length - 1}
          onClick={() => goTo(current + 1)}
          type="button"
        >
          →
        </button>
      </div>
      <div aria-hidden="true" className={styles.carouselDots}>
        {slides.map((slide, index) => (
          <span data-active={index === current ? 'true' : undefined} key={slide.id} />
        ))}
      </div>
    </section>
  );
}

export function HeldPlacesPicture({
  slide,
  eager = false,
}: {
  slide: HeldPlacesSlide;
  eager?: boolean;
}) {
  if (slide.kind === 'video') return (
    <video
      aria-label={slide.alt || 'Journey video'}
      className={styles.picture}
      controls
      playsInline
      poster={slide.poster}
      preload={eager ? 'metadata' : 'none'}
      src={slide.src}
    />
  );
  return (
    <picture className={styles.picture}>
      {slide.mobileSrcSet ? (
        <source
          media="(max-width: 47.99rem)"
          sizes="100vw"
          srcSet={slide.mobileSrcSet}
        />
      ) : null}
      {/* A picture element is needed because mobile and desktop focal crops differ. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        alt={slide.alt}
        decoding="async"
        height={slide.height}
        loading={eager ? 'eager' : 'lazy'}
        sizes="(max-width: 48rem) 100vw, 56vw"
        src={slide.src}
        srcSet={slide.srcSet}
        style={{
          '--held-desktop-position': slide.desktopPosition,
          '--held-mobile-position': slide.mobilePosition,
        } as CSSProperties}
        width={slide.width}
      />
    </picture>
  );
}
