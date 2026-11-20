'use client';

import Image from 'next/image';
import React, { type ReactNode } from 'react';

import styles from './photos-gallery.module.css';
import { MasonryGrid } from './MasonryGrid';

export type PublicPhotoSectionBreak = { title?: string; text?: string };
export type PublicPhotoSection = PublicPhotoSectionBreak & { id: string; count?: number; cover?: PublicPhoto };

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
  albumRole?: 'cover' | 'feature';
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
  priority = false,
}: {
  photo: PublicPhoto & { index: number };
  onOpen: (index: number) => void;
  priority?: boolean;
}) {
  return (
    <button aria-label={`Open ${photo.kind === 'video' ? 'video' : 'photo'} ${photo.index + 1}`} className={styles.tile} onClick={() => onOpen(photo.index)} type="button">
      <Image alt={photo.alt} height={photo.height} priority={priority} sizes="(max-width: 700px) 50vw, (max-width: 1100px) 33vw, 25vw" src={photo.kind === 'video' ? photo.posterUrl ?? photo.source : photo.thumbnailUrl ?? photo.source} width={photo.width} />
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
  onOpenPhoto,
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
  /** Opens a photo that may not be loaded yet, such as an album cover on a later page. */
  onOpenPhoto?: (photo: PublicPhoto) => void;
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
  const priorityPhotoIds = new Set(sections[0]?.photos.slice(0, 2).map((photo) => photo.id));
  const albums = (sectionLinks ?? []).flatMap((link) => link.cover ? [{ ...link, cover: link.cover }] : []);
  return (
    <section aria-labelledby="photos-title" className={styles.gallery}>
      <h1 id="photos-title">{title}</h1>
      {intro ? <p className={styles.intro}>{intro}</p> : null}
      {albums.length > 1 ? <nav aria-label="Albums" className={styles.albums}>
        {albums.map((album, index) => <a className={styles.albumCard} href={`#section-${album.id}`} key={album.id} onClick={(event) => onSectionLinkClick?.(event, album.id)}>
          <span className={styles.albumCover}><Image alt={album.cover.alt} fill priority={index === 0} sizes={index === 0 ? '(max-width: 700px) 100vw, 66vw' : '(max-width: 700px) 50vw, 33vw'} src={album.cover.thumbnailUrl ?? album.cover.source} /></span>
          <span className={styles.albumTitle}>{album.title ?? `Section ${index + 1}`}</span>
          {album.count !== undefined ? <span className={styles.albumCount}>{album.count} {album.count === 1 ? 'photo' : 'photos'}</span> : null}
        </a>)}
      </nav> : null}
      {sectionLinks?.length ? <nav aria-label="Photo sections" className={styles.sectionLinks}>
        {sectionLinks.map((section, index) => <a href={`#section-${section.id}`} key={section.id} onClick={(event) => onSectionLinkClick?.(event, section.id)}>{section.title ?? `Section ${index + 1}`}{section.count !== undefined ? <span className={styles.sectionCount}>{section.count}</span> : null}</a>)}
      </nav> : null}
      {sections.map((section, sectionIndex) => {
        const sectionNumber = sectionLinks?.findIndex((item) => item.id === section.sectionBlockId);
        const sectionCount = sectionNumber !== undefined && sectionNumber >= 0 ? sectionLinks?.[sectionNumber].count : undefined;
        const cover = sectionNumber !== undefined && sectionNumber >= 0 && !renderTile ? sectionLinks?.[sectionNumber].cover : undefined;
        const loadedCover = cover ? section.photos.find((photo) => photo.id === cover.id) : undefined;
        const hero = loadedCover ?? (cover && onOpenPhoto ? cover : undefined);
        const gridPhotos = hero ? section.photos.filter((photo) => photo.id !== hero.id) : section.photos;
        const sectionTitle = section.sectionBreak?.title ?? (section.sectionBreak ? `Section ${sectionNumber !== undefined && sectionNumber >= 0 ? sectionNumber + 1 : sectionIndex + 1}` : undefined);
        return <section aria-label={sectionTitle ?? 'Photographs'} className={styles.section} id={section.sectionBlockId ? `section-${section.sectionBlockId}` : undefined} key={section.sectionBlockId ?? `opening-${sectionIndex}`}>
          {renderSection ? renderSection(section, sectionIndex) : <>
            {sectionTitle ? <h2>{onToggleSection && section.sectionBlockId ? <button aria-label={`${collapsedSections?.has(section.sectionBlockId) ? 'Expand' : 'Collapse'} ${sectionTitle}`} aria-expanded={!collapsedSections?.has(section.sectionBlockId)} className={styles.sectionToggle} onClick={() => onToggleSection(section.sectionBlockId!)} type="button">{sectionTitle}<span aria-hidden="true">{collapsedSections?.has(section.sectionBlockId) ? '+' : '−'}</span></button> : sectionTitle}</h2> : null}
            {sectionCount !== undefined ? <p className={styles.sectionCount}>{sectionCount} {sectionCount === 1 ? 'photo' : 'photos'}</p> : null}
            {section.sectionBreak?.text ? <p className={styles.sectionNote}>{section.sectionBreak.text}</p> : null}
          </>}
          {!section.sectionBlockId || !collapsedSections?.has(section.sectionBlockId) ? <>
          {hero ? <button aria-label={loadedCover ? `Open ${loadedCover.kind === 'video' ? 'video' : 'photo'} ${loadedCover.index + 1}` : `Open ${sectionTitle ?? 'album'} cover`} className={styles.chapterHero} onClick={() => loadedCover ? onOpen(loadedCover.index) : onOpenPhoto?.(hero)} type="button">
            <Image alt={hero.alt} fill sizes="100vw" src={hero.kind === 'video' ? hero.posterUrl ?? hero.source : hero.displaySource ?? hero.source} />
          </button> : null}
          <MasonryGrid
            items={gridPhotos.map((photo) => ({ id: photo.id, width: photo.width, height: photo.height, span: photo.albumRole === 'feature' || photo.width > photo.height * 1.2 ? 2 : 1 }))}
            renderItem={(item) => {
              const photo = gridPhotos.find((candidate) => candidate.id === item.id)!;
              return renderTile ? renderTile(photo) : <GalleryImageTile onOpen={onOpen} photo={photo} priority={priorityPhotoIds.has(photo.id)} />;
            }}
          /></> : null}
        </section>;
      })}
    </section>
  );
}
