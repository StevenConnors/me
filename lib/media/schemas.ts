import { z } from 'zod';

const nonEmptyString = z.string().trim().min(1);
const normalizedCoordinate = z.number().finite().min(0).max(1);

/**
 * Database identifiers cross API boundaries as strings. Repositories may turn
 * these values into MongoDB ObjectIds, but media documents never depend on a
 * provider identifier for application identity.
 */
export const MediaIdSchema = nonEmptyString.refine(
  (value) => !/^https?:\/\//i.test(value),
  'Media IDs must be application-owned identifiers, not URLs',
);

export const GeoPointSchema = z
  .object({
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
  })
  .strict();

export type GeoPoint = z.infer<typeof GeoPointSchema>;

export const PrivacySafeLocationSchema = z
  .object({
    label: nonEmptyString.optional(),
    locality: nonEmptyString.optional(),
    region: nonEmptyString.optional(),
    country: nonEmptyString.optional(),
    approximatePoint: GeoPointSchema.optional(),
  })
  .strict()
  .refine(
    (location) => Object.values(location).some((value) => value !== undefined),
    'A public location must include at least one privacy-safe value',
  );

export type PrivacySafeLocation = z.infer<typeof PrivacySafeLocationSchema>;

export const CropSchema = z
  .object({
    mode: z.enum(['focal-fill', 'manual']),
    aspectRatio: z.number().finite().positive().optional(),
    focalPoint: z
      .object({
        x: normalizedCoordinate,
        y: normalizedCoordinate,
      })
      .strict()
      .optional(),
    rect: z
      .object({
        x: normalizedCoordinate,
        y: normalizedCoordinate,
        width: z.number().finite().positive().max(1),
        height: z.number().finite().positive().max(1),
      })
      .strict()
      .optional(),
    zoom: z.number().finite().min(1).max(20).optional(),
  })
  .strict()
  .superRefine((crop, context) => {
    if (crop.mode === 'manual' && !crop.rect) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rect'],
        message: 'Manual crops require a rectangle',
      });
    }

    if (crop.mode === 'focal-fill' && crop.rect) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rect'],
        message: 'Focal crops cannot include a manual rectangle',
      });
    }

    if (crop.rect && crop.rect.x + crop.rect.width > 1 + Number.EPSILON) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rect', 'width'],
        message: 'Crop rectangle must fit within the source width',
      });
    }

    if (crop.rect && crop.rect.y + crop.rect.height > 1 + Number.EPSILON) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rect', 'height'],
        message: 'Crop rectangle must fit within the source height',
      });
    }
  });

export type Crop = z.infer<typeof CropSchema>;

export const MediaPlacementSchema = z
  .object({
    mediaAssetId: MediaIdSchema,
    role: z.enum(['cover', 'card', 'story', 'gallery']),
    layout: z
      .object({
        desktop: z.enum([
          'inline',
          'wide',
          'full',
          'left',
          'right',
          'pair',
          'grid',
          'sequence',
          'story-step',
        ]),
        mobile: z.enum(['inline', 'full', 'stack']),
      })
      .strict(),
    crop: z
      .object({
        desktop: CropSchema.optional(),
        mobile: CropSchema.optional(),
      })
      .strict()
      .optional(),
    captionOverride: z.string().trim().max(2_000).optional(),
    altTextOverride: z.string().trim().max(1_000).optional(),
    decorative: z.boolean().optional(),
  })
  .strict();

export type MediaPlacement = z.infer<typeof MediaPlacementSchema>;

export const MediaAssetSchema = z
  .object({
    _id: MediaIdSchema,
    schemaVersion: z.literal(1),
    provider: z.literal('cloudinary'),
    providerAssetId: nonEmptyString,
    providerPublicId: nonEmptyString,
    resourceType: z.enum(['image', 'video']),
    deliveryType: nonEmptyString,
    version: z.number().int().nonnegative().optional(),
    originalFilename: nonEmptyString,
    format: nonEmptyString,
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    bytes: z.number().int().nonnegative(),
    checksum: z.union([nonEmptyString, z.null().transform(() => undefined)]).optional(),
    title: z.string().trim().max(500).optional(),
    caption: z.string().trim().max(2_000).optional(),
    altText: z.string().trim().max(1_000).optional(),
    tags: z.array(nonEmptyString).max(100),
    captureDate: z.string().date().optional(),
    privateMetadata: z
      .object({
        originalLocation: GeoPointSchema.optional(),
        retainedExif: z.record(z.string(), z.unknown()).optional(),
      })
      .strict()
      .optional(),
    publicLocation: PrivacySafeLocationSchema.optional(),
    status: z.enum(['pending', 'ready', 'failed', 'archived']),
    createdAt: z.date(),
    updatedAt: z.date(),
    archivedAt: z.date().optional(),
  })
  .strict()
  .superRefine((asset, context) => {
    if (asset.status === 'archived' && !asset.archivedAt) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['archivedAt'],
        message: 'Archived media must include archivedAt',
      });
    }
  });

export type MediaAsset = z.infer<typeof MediaAssetSchema>;

export const UploadSessionSchema = z
  .object({
    _id: MediaIdSchema,
    schemaVersion: z.literal(1).default(1),
    idempotencyKey: z.string().trim().min(8).max(128).regex(/^[A-Za-z0-9_-]+$/),
    intendedJourneyId: MediaIdSchema.optional(),
    status: z.enum(['created', 'uploaded', 'finalized', 'failed', 'expired']),
    expectedResourceType: z.literal('image'),
    providerAssetId: nonEmptyString.optional(),
    mediaAssetId: MediaIdSchema.optional(),
    createdAt: z.date(),
    expiresAt: z.date(),
  })
  .strict()
  .superRefine((session, context) => {
    if (session.expiresAt <= session.createdAt) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expiresAt'],
        message: 'Upload session must expire after it is created',
      });
    }

    if (session.status === 'finalized' && !session.mediaAssetId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['mediaAssetId'],
        message: 'Finalized upload sessions require a media asset ID',
      });
    }
  });

export type UploadSession = z.infer<typeof UploadSessionSchema>;
