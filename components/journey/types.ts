export const RESPONSIVE_IMAGE_WIDTHS = [320, 480, 768, 1024, 1440, 1920] as const;

export type ResponsiveImageWidth = (typeof RESPONSIVE_IMAGE_WIDTHS)[number];

export type DesktopMediaLayout =
  | 'inline'
  | 'wide'
  | 'full'
  | 'left'
  | 'right'
  | 'pair'
  | 'grid'
  | 'sequence'
  | 'story-step';

export type MobileMediaLayout = 'inline' | 'full' | 'stack';

export type Crop = {
  mode: 'focal-fill' | 'manual';
  aspectRatio?: number;
  focalPoint?: { x: number; y: number };
  rect?: { x: number; y: number; width: number; height: number };
  zoom?: number;
};

export type MediaPlacement = {
  mediaAssetId: string;
  role: 'cover' | 'card' | 'story' | 'gallery';
  layout: {
    desktop: DesktopMediaLayout;
    mobile: MobileMediaLayout;
  };
  crop?: {
    desktop?: Crop;
    mobile?: Crop;
  };
  captionOverride?: string;
  altTextOverride?: string;
  decorative?: boolean;
};

/**
 * The renderer only needs delivery metadata. Database/provider-specific fields can
 * be present on the object and are intentionally ignored here.
 */
export type JourneyMediaAsset = {
  id?: string;
  resourceType: 'image' | 'video';
  width?: number;
  height?: number;
  title?: string;
  caption?: string;
  altText?: string;
  originalFilename?: string;
};

export type JourneyMediaAssetMap =
  | ReadonlyMap<string, JourneyMediaAsset>
  | Readonly<Record<string, JourneyMediaAsset>>;

export type MediaUrlRequest = {
  asset: JourneyMediaAsset;
  placement: MediaPlacement;
  viewport: 'desktop' | 'mobile';
  width: ResponsiveImageWidth;
  purpose?: 'playback' | 'poster';
};

export type BuildMediaUrl = (request: MediaUrlRequest) => string | null | undefined;

export type TiptapMark = {
  type: 'bold' | 'italic' | 'link';
  attrs?: {
    href?: string;
    target?: string;
  };
};

/** A deliberately small structural type for the application-owned Tiptap JSON. */
export type TiptapJsonNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapJsonNode[];
  marks?: TiptapMark[];
  text?: string;
};

export type TiptapJsonDocument = TiptapJsonNode & {
  type: 'doc';
  content?: TiptapJsonNode[];
};

/** Accepts both raw Tiptap JSON and the persisted JourneyDocument wrapper. */
export type RenderableJourneyDocument =
  | TiptapJsonDocument
  | {
      schemaVersion: number;
      editor: 'tiptap';
      content: TiptapJsonDocument;
    };

export type GalleryTemplate =
  | 'two-equal'
  | 'one-plus-two'
  | 'three-column'
  | 'vertical-sequence';
