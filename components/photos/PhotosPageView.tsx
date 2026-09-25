'use client';

import Image from 'next/image';
import React, { type ReactNode } from 'react';

import styles from './photos-gallery.module.css';
import { MasonryGrid } from './MasonryGrid';

export type PublicPhotoSectionBreak = { title?: string; text?: string };
export type PublicPhotoSection = PublicPhotoSectionBreak & { id: string };

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
  title?: string;
  caption?: string;
  tags?: string[];
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
  sectionGroups,
  onOpen,
  renderTile,
  renderSection,
  sectionLinks,
  collapsedSections,
  onToggleSection,
  onSectionLinkClick,
  title = 'Photos',
  intro = 'A collection of moments, arranged in the order they belong.',
}: {
  photos: PublicPhoto[];
  /** Authoring may supply draft groups so empty section blocks stay visible. */
  sectionGroups?: PhotoSection[];
  onOpen: (index: number) => void;
  renderTile?: (photo: PublicPhoto & { index: number }) => ReactNode;
  renderSection?: (section: PhotoSection, sectionIndex: number) => ReactNode;
  sectionLinks?: PublicPhotoSection[];
  collapsedSections?: ReadonlySet<string>;
  onToggleSection?: (id: string) => void;
  onSectionLinkClick?: (event: React.MouseEvent<HTMLAnchorElement>, id: string) => void;
  title?: string;
  intro?: string;
}) {
  const sections = sectionGroups ?? groupPhotos(photos);
  return (
    <section aria-labelledby="photos-title" className={styles.gallery}>
      <h1 id="photos-title">{title}</h1>
      {intro ? <p className={styles.intro}>{intro}</p> : null}
      {sectionLinks?.length ? <nav aria-label="Photo sections" className={styles.sectionLinks}>
        {sectionLinks.map((section, index) => <a href={`#section-${section.id}`} key={section.id} onClick={(event) => onSectionLinkClick?.(event, section.id)}>{section.title ?? `Section ${index + 1}`}</a>)}
      </nav> : null}
      {sections.map((section, sectionIndex) => {
        const sectionNumber = sectionLinks?.findIndex((item) => item.id === section.sectionBlockId);
        const sectionTitle = section.sectionBreak?.title ?? (section.sectionBreak ? `Section ${sectionNumber !== undefined && sectionNumber >= 0 ? sectionNumber + 1 : sectionIndex + 1}` : undefined);
        return <section aria-label={sectionTitle ?? 'Photographs'} className={styles.section} id={section.sectionBlockId ? `section-${section.sectionBlockId}` : undefined} key={section.sectionBlockId ?? `opening-${sectionIndex}`}>
          {renderSection ? renderSection(section, sectionIndex) : <>
            {sectionTitle ? <h2>{onToggleSection && section.sectionBlockId ? <button aria-label={`${collapsedSections?.has(section.sectionBlockId) ? 'Expand' : 'Collapse'} ${sectionTitle}`} aria-expanded={!collapsedSections?.has(section.sectionBlockId)} className={styles.sectionToggle} onClick={() => onToggleSection(section.sectionBlockId!)} type="button">{sectionTitle}<span aria-hidden="true">{collapsedSections?.has(section.sectionBlockId) ? '+' : '−'}</span></button> : sectionTitle}</h2> : null}
            {section.sectionBreak?.text ? <p className={styles.sectionNote}>{section.sectionBreak.text}</p> : null}
          </>}
          {!section.sectionBlockId || !collapsedSections?.has(section.sectionBlockId) ? <MasonryGrid
            items={section.photos.map((photo) => ({ id: photo.id, width: photo.width, height: photo.height }))}
            renderItem={(item) => {
              const photo = section.photos.find((candidate) => candidate.id === item.id)!;
              return renderTile ? renderTile(photo) : <GalleryImageTile onOpen={onOpen} photo={photo} />;
            }}
          /> : null}
        </section>;
      })}
    </section>
  );
}
