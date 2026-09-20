'use client';

import Image from 'next/image';
import React, { type ReactNode } from 'react';

import styles from './photos-gallery.module.css';
import { MasonryGrid } from './MasonryGrid';

export type PublicPhotoSectionBreak = { title?: string; text?: string };

export type PublicPhoto = {
  id: string;
  kind?: 'image' | 'video';
  thumbnailUrl?: string;
  displayUrl?: string;
  posterUrl?: string;
  source: string;
  displaySource?: string;
  playbackUrl?: string;
  alt: string;
  width: number;
  height: number;
  caption?: string;
  captureDate?: string;
  sectionBreak?: PublicPhotoSectionBreak;
  /** Editing identity only; omitted from ordinary public presentation. */
  sectionBlockId?: string;
};

export type PhotoSection = {
  sectionBreak?: PublicPhotoSectionBreak;
  sectionBlockId?: string;
  photos: Array<PublicPhoto & { index: number }>;
};

/** Group only around real persisted section blocks, never page boundaries. */
export function groupPhotos(photos: PublicPhoto[]): PhotoSection[] {
  return photos.reduce<PhotoSection[]>((sections, photo, index) => {
    const indexedPhoto = { ...photo, index };
    if (!sections.length || photo.sectionBreak) {
      sections.push({
        ...(photo.sectionBreak ? { sectionBreak: photo.sectionBreak } : {}),
        ...(photo.sectionBlockId ? { sectionBlockId: photo.sectionBlockId } : {}),
        photos: [indexedPhoto],
      });
    } else {
      sections[sections.length - 1].photos.push(indexedPhoto);
    }
    return sections;
  }, []);
}

export function GalleryImageTile({
  photo,
  onOpen,
}: {
  photo: PublicPhoto & { index: number };
  onOpen: (index: number) => void;
}) {
  return (
    <button aria-label={`Open ${photo.kind === 'video' ? 'video' : 'photo'} ${photo.index + 1}`} className={styles.tile} onClick={() => onOpen(photo.index)} type="button">
      <Image alt={photo.alt} height={photo.height} sizes="(max-width: 700px) 50vw, (max-width: 1100px) 33vw, 25vw" src={photo.kind === 'video' ? photo.posterUrl ?? photo.source : photo.thumbnailUrl ?? photo.source} width={photo.width} />
      {photo.kind === 'video' ? <span aria-hidden="true" className={styles.videoPlay}>▶</span> : null}
    </button>
  );
}

/**
 * The layout shared by public reading and authoring. The optional render
 * hooks add editor chrome without changing the section/grid structure.
 */
export function PhotosPageView({
  photos,
  onOpen,
  renderTile,
  renderSection,
  title = 'Photos',
  intro = 'A collection of moments, arranged in the order they belong.',
}: {
  photos: PublicPhoto[];
  onOpen: (index: number) => void;
  renderTile?: (photo: PublicPhoto & { index: number }) => ReactNode;
  renderSection?: (section: PhotoSection, sectionIndex: number) => ReactNode;
  title?: string;
  intro?: string;
}) {
  const sections = groupPhotos(photos);
  return (
    <section aria-labelledby="photos-title" className={styles.gallery}>
      <h1 id="photos-title">{title}</h1>
      {intro ? <p className={styles.intro}>{intro}</p> : null}
      {sections.map((section, sectionIndex) => (
        <section aria-label={section.sectionBreak?.title ?? 'Photographs'} className={styles.section} key={section.sectionBlockId ?? `opening-${sectionIndex}`}>
          {renderSection ? renderSection(section, sectionIndex) : <>
            {section.sectionBreak?.title ? <h2>{section.sectionBreak.title}</h2> : null}
            {section.sectionBreak?.text ? <p className={styles.sectionNote}>{section.sectionBreak.text}</p> : null}
          </>}
          <MasonryGrid
            items={section.photos.map((photo) => ({ id: photo.id, width: photo.width, height: photo.height }))}
            renderItem={(item) => {
              const photo = section.photos.find((candidate) => candidate.id === item.id)!;
              return renderTile ? renderTile(photo) : <GalleryImageTile onOpen={onOpen} photo={photo} />;
            }}
          />
        </section>
      ))}
    </section>
  );
}
