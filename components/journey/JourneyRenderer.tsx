import React, { type CSSProperties, type ReactNode } from 'react';

import styles from './JourneyRenderer.module.css';
import {
  RESPONSIVE_IMAGE_WIDTHS,
  type BuildMediaUrl,
  type Crop,
  type DesktopMediaLayout,
  type GalleryTemplate,
  type JourneyMediaAsset,
  type JourneyMediaAssetMap,
  type MediaPlacement,
  type RenderableJourneyDocument,
  type ResponsiveImageWidth,
  type TiptapJsonDocument,
  type TiptapJsonNode,
  type TiptapMark,
} from './types';

export type JourneyRendererProps = {
  document: RenderableJourneyDocument;
  assets: JourneyMediaAssetMap;
  buildMediaUrl: BuildMediaUrl;
  /** Assets in this list load eagerly; all others use native lazy loading. */
  priorityMediaAssetIds?: readonly string[];
  className?: string;
};

type RenderContext = Omit<JourneyRendererProps, 'document' | 'className'>;

const layoutClasses: Record<DesktopMediaLayout, string> = {
  inline: styles.layoutInline,
  wide: styles.layoutWide,
  full: styles.layoutFull,
  left: styles.layoutLeft,
  right: styles.layoutRight,
  pair: styles.layoutPair,
  grid: styles.layoutGrid,
  sequence: styles.layoutSequence,
  'story-step': styles.layoutStoryStep,
};

const galleryClasses: Record<GalleryTemplate, string> = {
  'two-equal': styles.galleryTwoEqual,
  'one-plus-two': styles.galleryFeature,
  'three-column': styles.galleryThreeColumn,
  'vertical-sequence': styles.gallerySequence,
};

export function JourneyRenderer({
  document,
  assets,
  buildMediaUrl,
  priorityMediaAssetIds = [],
  className,
}: JourneyRendererProps) {
  const tiptapDocument = unwrapDocument(document);
  const rootClassName = [styles.journey, className].filter(Boolean).join(' ');

  return (
    <article className={rootClassName} data-journey-renderer="">
      <RenderNodes
        nodes={tiptapDocument.content}
        context={{ assets, buildMediaUrl, priorityMediaAssetIds }}
      />
    </article>
  );
}

function unwrapDocument(document: RenderableJourneyDocument): TiptapJsonDocument {
  return 'type' in document ? document : document.content;
}

function RenderNodes({
  nodes,
  context,
}: {
  nodes?: TiptapJsonNode[];
  context: RenderContext;
}) {
  if (!nodes?.length) return null;

  return <>{nodes.map((node, index) => renderNode(node, `${node.type}-${index}`, context))}</>;
}

function renderNode(node: TiptapJsonNode, key: string, context: RenderContext): ReactNode {
  switch (node.type) {
    case 'text':
      return <span key={key}>{renderMarkedText(node.text ?? '', node.marks)}</span>;
    case 'paragraph':
      return (
        <p className={styles.paragraph} key={key}>
          <RenderNodes nodes={node.content} context={context} />
        </p>
      );
    case 'heading': {
      const level = numberAttr(node, 'level') === 3 ? 3 : 2;
      const children = <RenderNodes nodes={node.content} context={context} />;
      return level === 3 ? (
        <h3 className={styles.headingThree} key={key}>{children}</h3>
      ) : (
        <h2 className={styles.headingTwo} key={key}>{children}</h2>
      );
    }
    case 'bulletList':
    case 'bullet-list':
      return (
        <ul className={styles.list} key={key}>
          <RenderNodes nodes={node.content} context={context} />
        </ul>
      );
    case 'orderedList':
    case 'ordered-list':
      return (
        <ol className={styles.list} key={key} start={numberAttr(node, 'start')}>
          <RenderNodes nodes={node.content} context={context} />
        </ol>
      );
    case 'listItem':
    case 'list-item':
      return (
        <li className={styles.listItem} key={key}>
          <RenderNodes nodes={node.content} context={context} />
        </li>
      );
    case 'blockquote':
      return (
        <blockquote className={styles.blockquote} key={key}>
          <RenderNodes nodes={node.content} context={context} />
        </blockquote>
      );
    case 'quote':
      return <EditorialQuote key={key} node={node} context={context} />;
    case 'hardBreak':
    case 'hard-break':
      return <br key={key} />;
    case 'horizontalRule':
    case 'horizontal-rule':
    case 'divider':
      return <hr className={styles.divider} key={key} />;
    case 'photograph': {
      const placement = placementFromNode(node);
      return placement ? <MediaFigure key={key} placement={placement} context={context} /> : null;
    }
    case 'gallery':
      return <Gallery key={key} node={node} context={context} />;
    case 'storyStep':
    case 'story-step':
      return <StoryStep key={key} node={node} context={context} />;
    default:
      return null;
  }
}

function renderMarkedText(text: string, marks: TiptapMark[] | undefined): ReactNode {
  return (marks ?? []).reduce<ReactNode>((content, mark, index) => {
    if (mark.type === 'bold') return <strong key={`bold-${index}`}>{content}</strong>;
    if (mark.type === 'italic') return <em key={`italic-${index}`}>{content}</em>;
    if (mark.type === 'link') {
      const href = safeHref(mark.attrs?.href);
      if (!href) return content;
      const opensNewWindow = mark.attrs?.target === '_blank';
      return (
        <a
          className={styles.link}
          href={href}
          key={`link-${index}`}
          rel="noreferrer noopener"
          target={opensNewWindow ? '_blank' : undefined}
        >
          {content}
        </a>
      );
    }
    return content;
  }, text);
}

function safeHref(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (value.startsWith('/') || value.startsWith('#')) return value;

  try {
    const parsed = new URL(value);
    return ['https:', 'http:', 'mailto:'].includes(parsed.protocol) ? value : undefined;
  } catch {
    return undefined;
  }
}

function EditorialQuote({
  node,
  context,
}: {
  node: TiptapJsonNode;
  context: RenderContext;
}) {
  const attribution = stringAttr(node, 'attribution');
  const citation = stringAttr(node, 'citation');

  return (
    <figure className={styles.editorialQuote}>
      <blockquote>
        <RenderNodes nodes={node.content} context={context} />
      </blockquote>
      {(attribution || citation) && (
        <figcaption>
          {attribution}
          {attribution && citation ? <span aria-hidden="true"> — </span> : null}
          {citation ? <cite>{citation}</cite> : null}
        </figcaption>
      )}
    </figure>
  );
}

function Gallery({ node, context }: { node: TiptapJsonNode; context: RenderContext }) {
  const placements = placementArrayAttr(node, 'items') ?? placementArrayAttr(node, 'placements') ?? [];
  if (!placements.length) return null;

  const requestedTemplate = stringAttr(node, 'template') as GalleryTemplate | undefined;
  const template = requestedTemplate && requestedTemplate in galleryClasses
    ? requestedTemplate
    : 'two-equal';

  return (
    <section className={`${styles.gallery} ${galleryClasses[template]}`} aria-label="Photograph gallery">
      {placements.map((placement, index) => (
        <MediaFigure
          context={context}
          galleryItem
          key={`${placement.mediaAssetId}-${index}`}
          placement={placement}
        />
      ))}
    </section>
  );
}

function StoryStep({ node, context }: { node: TiptapJsonNode; context: RenderContext }) {
  const placement = placementFromNode(node);

  return (
    <section className={styles.storyStep}>
      <div className={styles.storyStepProse}>
        <RenderNodes nodes={node.content} context={context} />
      </div>
      {placement ? (
        <MediaFigure context={context} placement={placement} storyStep />
      ) : (
        <MissingMedia label="Story-step media unavailable" />
      )}
    </section>
  );
}

function MediaFigure({
  placement,
  context,
  galleryItem = false,
  storyStep = false,
}: {
  placement: MediaPlacement;
  context: RenderContext;
  galleryItem?: boolean;
  storyStep?: boolean;
}) {
  const asset = assetFromMap(context.assets, placement.mediaAssetId);
  const caption = placement.captionOverride ?? asset?.caption;
  const layout = storyStep ? 'story-step' : placement.layout.desktop;
  const className = [
    styles.mediaFigure,
    layoutClasses[layout],
    galleryItem ? styles.galleryItem : '',
    placement.layout.mobile === 'full' ? styles.mobileFull : '',
  ].filter(Boolean).join(' ');

  return (
    <figure className={className}>
      {asset ? (
        <MediaVisual asset={asset} placement={placement} context={context} />
      ) : (
        <MissingMedia label="Photograph unavailable" />
      )}
      {caption ? <figcaption className={styles.caption}>{caption}</figcaption> : null}
    </figure>
  );
}

function MediaVisual({
  asset,
  placement,
  context,
}: {
  asset: JourneyMediaAsset;
  placement: MediaPlacement;
  context: RenderContext;
}) {
  const alt = placement.decorative
    ? ''
    : placement.altTextOverride ?? asset.altText ?? asset.title ?? '';
  const eager = context.priorityMediaAssetIds?.includes(placement.mediaAssetId) ?? false;
  const desktopUrls = responsiveUrls(asset, placement, 'desktop', context.buildMediaUrl);
  const mobileUrls = responsiveUrls(asset, placement, 'mobile', context.buildMediaUrl);
  const fallbackUrl = preferredUrl(desktopUrls) ?? preferredUrl(mobileUrls);

  if (!fallbackUrl) return <MissingMedia label="Media unavailable" />;

  if (asset.resourceType === 'video') {
    return (
      <div className={styles.visual}>
        <video
          aria-label={alt || 'Journey video'}
          className={styles.media}
          controls
          playsInline
          preload="metadata"
          src={fallbackUrl}
        />
      </div>
    );
  }

  const cropStyle = mediaCropStyle(placement, asset);
  const hasCrop = Boolean(placement.crop?.desktop || placement.crop?.mobile);

  return (
    <div className={`${styles.visual} ${hasCrop ? styles.croppedVisual : ''}`} style={cropStyle}>
      <picture>
        {mobileUrls.length ? (
          <source
            media="(max-width: 47.99rem)"
            sizes={mediaSizes(placement.layout.desktop, true)}
            srcSet={srcSet(mobileUrls)}
          />
        ) : null}
        {/* A native picture is required for mobile-specific crop sources. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt={alt}
          className={styles.media}
          decoding="async"
          height={positiveNumber(asset.height)}
          loading={eager ? 'eager' : 'lazy'}
          sizes={mediaSizes(placement.layout.desktop, false)}
          src={fallbackUrl}
          srcSet={srcSet(desktopUrls) || undefined}
          width={positiveNumber(asset.width)}
        />
      </picture>
    </div>
  );
}

function MissingMedia({ label }: { label: string }) {
  return (
    <div aria-label={label} className={styles.missingMedia} role="img">
      <span aria-hidden="true">◇</span>
      <span>{label}</span>
    </div>
  );
}

function responsiveUrls(
  asset: JourneyMediaAsset,
  placement: MediaPlacement,
  viewport: 'desktop' | 'mobile',
  buildMediaUrl: BuildMediaUrl,
) {
  return RESPONSIVE_IMAGE_WIDTHS.flatMap((width) => {
    try {
      const url = buildMediaUrl({ asset, placement, viewport, width });
      return url ? [{ url, width }] : [];
    } catch {
      return [];
    }
  });
}

function preferredUrl(urls: { url: string; width: ResponsiveImageWidth }[]) {
  return urls.find(({ width }) => width === 1024)?.url ?? urls[urls.length - 1]?.url;
}

function srcSet(urls: { url: string; width: ResponsiveImageWidth }[]) {
  return urls.map(({ url, width }) => `${url} ${width}w`).join(', ');
}

function mediaSizes(layout: DesktopMediaLayout, mobileOnly: boolean) {
  if (mobileOnly) return '100vw';
  switch (layout) {
    case 'inline': return '(max-width: 768px) 100vw, 704px';
    case 'wide': return '(max-width: 768px) 100vw, 1088px';
    case 'left':
    case 'right': return '(max-width: 768px) 100vw, 62vw';
    case 'pair': return '(max-width: 768px) 100vw, 50vw';
    case 'sequence': return '(max-width: 768px) 86vw, 45vw';
    case 'story-step': return '(max-width: 1024px) 100vw, 55vw';
    default: return '100vw';
  }
}

function mediaCropStyle(placement: MediaPlacement, asset: JourneyMediaAsset): CSSProperties {
  const desktop = placement.crop?.desktop;
  const mobile = placement.crop?.mobile ?? desktop;
  const desktopPoint = desktop?.focalPoint;
  const mobilePoint = mobile?.focalPoint ?? desktopPoint;
  const style: Record<string, string | number> = {};

  const desktopRatio = cropAspectRatio(desktop, asset);
  const mobileRatio = cropAspectRatio(mobile, asset);
  if (desktopRatio) {
    style['--journey-desktop-ratio'] = desktopRatio;
  }
  if (mobileRatio) {
    style['--journey-mobile-ratio'] = mobileRatio;
  }
  if (desktopPoint) {
    style['--journey-desktop-position'] = `${desktopPoint.x * 100}% ${desktopPoint.y * 100}%`;
  }
  if (mobilePoint) {
    style['--journey-mobile-position'] = `${mobilePoint.x * 100}% ${mobilePoint.y * 100}%`;
  }

  return style as CSSProperties;
}

function cropAspectRatio(
  crop: Crop | undefined,
  asset: JourneyMediaAsset,
) {
  if (crop?.aspectRatio && crop.aspectRatio > 0) return crop.aspectRatio;
  if (crop?.mode !== 'manual' || !crop.rect || !asset.width || !asset.height) return undefined;
  return (crop.rect.width * asset.width) / (crop.rect.height * asset.height);
}

function assetFromMap(assets: JourneyMediaAssetMap, id: string) {
  if ('get' in assets && typeof assets.get === 'function') return assets.get(id);
  return (assets as Readonly<Record<string, JourneyMediaAsset>>)[id];
}

function placementFromNode(node: TiptapJsonNode): MediaPlacement | undefined {
  const nested = node.attrs?.placement;
  if (isMediaPlacement(nested)) return nested;
  const storyStepMedia = node.attrs?.media;
  if (isMediaPlacement(storyStepMedia)) return storyStepMedia;
  return isMediaPlacement(node.attrs) ? node.attrs : undefined;
}

function placementArrayAttr(node: TiptapJsonNode, key: string) {
  const value = node.attrs?.[key];
  if (!Array.isArray(value)) return undefined;
  const placements = value.filter(isMediaPlacement);
  return placements.length ? placements : undefined;
}

function isMediaPlacement(value: unknown): value is MediaPlacement {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<MediaPlacement>;
  return typeof candidate.mediaAssetId === 'string'
    && Boolean(candidate.layout)
    && typeof candidate.layout?.desktop === 'string'
    && typeof candidate.layout?.mobile === 'string';
}

function stringAttr(node: TiptapJsonNode, key: string) {
  const value = node.attrs?.[key];
  return typeof value === 'string' ? value : undefined;
}

function numberAttr(node: TiptapJsonNode, key: string) {
  const value = node.attrs?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function positiveNumber(value: number | undefined) {
  return typeof value === 'number' && value > 0 ? value : undefined;
}
