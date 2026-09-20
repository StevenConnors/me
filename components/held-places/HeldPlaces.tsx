import Link from 'next/link';
import React from 'react';
import type { ReactNode } from 'react';

import { HeldPlacesCarousel, HeldPlacesPicture } from './HeldPlacesCarousel';
import styles from './held-places.module.css';
import type { HeldPlacesSlide } from './types';
import type {
  BuildMediaUrl,
  JourneyMediaAsset,
  JourneyMediaAssetMap,
  TiptapMark,
} from '@/components/journey/types';
import {
  heldPlacesMediaToPlacement,
  type HeldPlacesDocumentV2,
  type HeldPlacesMedia,
  type JourneyLocation,
  type PublishedJourneySummary,
  type RestrictedRichTextDocument,
} from '@/lib/journeys/schemas';

type DateRange = {
  start: string;
  end?: string;
};

type MediaContext = {
  assets: JourneyMediaAssetMap;
  buildMediaUrl: BuildMediaUrl;
};

export function HeldPlacesHeader() {
  return (
    <header className={styles.header}>
      <Link className={styles.identity} href="/">Yuji / 佑治</Link>
      <Link className={styles.indexLink} href="/#journeys">Index</Link>
    </header>
  );
}

export function HeldPlacesJourneyPage({
  title,
  summary,
  cover,
  experiencedAt,
  locations,
  document,
  assets,
  buildMediaUrl,
}: {
  title: string;
  summary?: string;
  cover?: HeldPlacesMedia;
  experiencedAt?: DateRange;
  locations?: JourneyLocation[];
  document: HeldPlacesDocumentV2;
  assets: JourneyMediaAssetMap;
  buildMediaUrl: BuildMediaUrl;
}) {
  const context = { assets, buildMediaUrl };
  const coverSlide = cover ? prepareSlide(cover, context, 'cover') : null;
  const meta = formatJourneyMeta(experiencedAt, locations);

  return (
    <main className={`${styles.paper} ${styles.journeyPage}`}>
      <HeldPlacesHeader />
      <article>
        <header className={styles.journeyHero}>
          <div className={styles.journeyHeroCopy}>
            {meta ? <p className={styles.journeyMeta}>{meta}</p> : null}
            <h1>{title || 'Untitled journey'}</h1>
            {summary ? <p className={styles.journeySummary}>{summary}</p> : null}
          </div>
          <div className={styles.journeyCover}>
            {coverSlide ? (
              <HeldPlacesPicture eager slide={coverSlide} />
            ) : (
              <MissingPhotograph />
            )}
          </div>
        </header>
        <div className={styles.chapters}>
          {document.chapters.map((chapter, index) => {
            const slides = chapter.media.flatMap((media) => {
              const prepared = prepareSlide(media, context, 'story');
              return prepared ? [prepared] : [];
            });
            return (
              <section className={styles.chapter} key={chapter.id}>
                <div className={styles.chapterProse}>
                  <p className={styles.chapterNumber}>{String(index + 1).padStart(2, '0')}</p>
                  {chapter.heading ? <h2>{chapter.heading}</h2> : null}
                  <RestrictedText document={chapter.body} />
                </div>
                <div className={styles.chapterMedia}>
                  {slides.length === 1 ? (
                    <figure className={styles.staticPhotograph}>
                      <HeldPlacesPicture slide={slides[0]} />
                      {slides[0].caption ? (
                        <figcaption className={styles.caption}>{slides[0].caption}</figcaption>
                      ) : null}
                    </figure>
                  ) : slides.length > 1 ? (
                    <HeldPlacesCarousel slides={slides} />
                  ) : (
                    <div className={styles.chapterPlaceholder} aria-hidden="true" />
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </article>
    </main>
  );
}

export function HeldPlacesIndex({
  journeys,
  assets,
  buildMediaUrl,
  failed = false,
  legacyJourneys = [],
}: {
  journeys: PublishedJourneySummary[];
  assets: JourneyMediaAssetMap;
  buildMediaUrl: BuildMediaUrl;
  failed?: boolean;
  legacyJourneys?: { slug: string; title: string }[];
}) {
  const [newest, ...archive] = journeys;
  const archiveRows = newest
    ? archive.map((journey) => ({ ...journey, legacy: false as const }))
    : legacyJourneys.map((journey) => ({
        ...journey,
        id: `legacy-${journey.slug}`,
        summary: 'Read the original journey.',
        legacy: true as const,
      }));
  const cover = newest
    ? prepareSlide(newest.cover, { assets, buildMediaUrl }, 'cover')
    : null;

  return (
    <main className={`${styles.paper} ${styles.indexPage}`}>
      <HeldPlacesHeader />
      {newest ? (
        <section className={styles.indexHero}>
          <div className={styles.indexHeroCopy}>
            <p className={styles.kicker}>Newest journey</p>
            <h1>{newest.title}</h1>
            <p className={styles.indexSummary}>{newest.summary}</p>
            <Link className={styles.enterLink} href={`/stories/${newest.slug}`} passHref>
              Enter the journey <span aria-hidden="true">→</span>
            </Link>
          </div>
          <div className={styles.indexCover}>
            {cover ? <HeldPlacesPicture eager slide={cover} /> : <MissingPhotograph />}
          </div>
        </section>
      ) : (
        <section className={styles.indexEmpty}>
          <p className={styles.kicker}>{failed ? 'Archive unavailable' : 'Journeys'}</p>
          <h1>{failed ? 'The archive is resting.' : 'New journeys are being prepared.'}</h1>
          <p>
            {failed
              ? 'Please return soon. The published stories remain unchanged.'
              : 'Published field notes and photographs will appear here.'}
          </p>
        </section>
      )}
      <section className={styles.archive} id="journeys">
        <div className={styles.archiveHeading}>
          <h2>Journeys</h2>
          <span>{String(newest ? journeys.length : legacyJourneys.length).padStart(2, '0')}</span>
        </div>
        {archiveRows.length ? (
          <div className={styles.archiveList}>
            {archiveRows.map((journey, index) => (
              <Link
                className={styles.archiveRow}
                href={`/stories/${journey.slug}`}
                key={journey.id}
                passHref
              >
                <span className={styles.archiveMarker} data-palette={index % 4} />
                <span className={styles.archiveTitle}>{journey.title}</span>
                <span className={styles.archiveSummary}>{journey.summary}</span>
                <span aria-hidden="true" className={styles.archiveArrow}>→</span>
              </Link>
            ))}
          </div>
        ) : newest ? (
          <p className={styles.archiveEmpty}>The newest journey is the first in the archive.</p>
        ) : null}
      </section>
    </main>
  );
}

function prepareSlide(
  media: HeldPlacesMedia,
  context: MediaContext,
  role: 'cover' | 'story',
): HeldPlacesSlide | null {
  const asset = assetFromMap(context.assets, media.mediaAssetId);
  if (!asset || asset.resourceType !== 'image') return null;
  const placement = heldPlacesMediaToPlacement(media, role);
  const widths = [480, 768, 1024, 1440, 1920] as const;
  const desktop = widths.flatMap((width) => {
    const url = context.buildMediaUrl({ asset, placement, viewport: 'desktop', width });
    return url ? [{ url, width }] : [];
  });
  const mobile = widths.flatMap((width) => {
    const url = context.buildMediaUrl({ asset, placement, viewport: 'mobile', width });
    return url ? [{ url, width }] : [];
  });
  const src = desktop.find(({ width }) => width === 1024)?.url
    ?? desktop[desktop.length - 1]?.url
    ?? mobile[mobile.length - 1]?.url;
  if (!src) return null;
  const desktopPoint = media.crop?.desktop?.focalPoint;
  const mobilePoint = media.crop?.mobile?.focalPoint ?? desktopPoint;

  return {
    id: media.mediaAssetId,
    src,
    srcSet: desktop.map(({ url, width }) => `${url} ${width}w`).join(', ') || undefined,
    mobileSrcSet: mobile.map(({ url, width }) => `${url} ${width}w`).join(', ') || undefined,
    alt: media.decorative
      ? ''
      : media.altTextOverride ?? asset.altText ?? asset.title ?? '',
    caption: media.captionOverride ?? asset.caption,
    width: asset.width,
    height: asset.height,
    desktopPosition: desktopPoint
      ? `${desktopPoint.x * 100}% ${desktopPoint.y * 100}%`
      : '50% 50%',
    mobilePosition: mobilePoint
      ? `${mobilePoint.x * 100}% ${mobilePoint.y * 100}%`
      : '50% 50%',
  };
}

function RestrictedText({ document }: { document: RestrictedRichTextDocument }) {
  return (
    <div className={styles.restrictedText}>
      {document.content.map((paragraph, index) => (
        <p key={index}>
          {(paragraph.content ?? []).map((node, nodeIndex) =>
            node.type === 'hardBreak'
              ? <br key={nodeIndex} />
              : <span key={nodeIndex}>{renderMarks(node.text, node.marks)}</span>,
          )}
        </p>
      ))}
    </div>
  );
}

function renderMarks(text: string, marks?: TiptapMark[]): ReactNode {
  return (marks ?? []).reduce<ReactNode>((content, mark, index) => {
    if (mark.type === 'bold') return <strong key={`bold-${index}`}>{content}</strong>;
    if (mark.type === 'italic') return <em key={`italic-${index}`}>{content}</em>;
    if (mark.type === 'link' && safeHref(mark.attrs?.href)) {
      return <a href={mark.attrs?.href} key={`link-${index}`}>{content}</a>;
    }
    return content;
  }, text);
}

function safeHref(value?: string) {
  if (!value) return false;
  try {
    return ['http:', 'https:', 'mailto:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function assetFromMap(assets: JourneyMediaAssetMap, id: string): JourneyMediaAsset | undefined {
  if ('get' in assets && typeof assets.get === 'function') return assets.get(id);
  return (assets as Readonly<Record<string, JourneyMediaAsset>>)[id];
}

function MissingPhotograph() {
  return (
    <div aria-label="Photograph unavailable" className={styles.missingPhotograph} role="img">
      Photograph unavailable
    </div>
  );
}

function formatJourneyMeta(
  experiencedAt?: DateRange,
  locations?: JourneyLocation[],
) {
  const parts: string[] = [];
  if (locations?.length) parts.push(locations.map(({ label }) => label).join(' · '));
  if (experiencedAt?.start) {
    const start = formatDate(experiencedAt.start);
    const end = experiencedAt.end ? formatDate(experiencedAt.end) : undefined;
    parts.push(end ? `${start} — ${end}` : start);
  }
  return parts.join('  /  ');
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${value}T00:00:00.000Z`));
}
