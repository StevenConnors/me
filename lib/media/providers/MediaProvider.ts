import { z } from 'zod';

import { CropSchema } from '../schemas';

const nonEmptyString = z.string().trim().min(1);

export const ACCEPTED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
] as const;

export const UploadIntentSchema = z
  .object({
    filename: nonEmptyString.max(255),
    mimeType: z.enum(ACCEPTED_IMAGE_MIME_TYPES),
    bytes: z.number().int().positive(),
    idempotencyKey: z.string().trim().min(8).max(128).regex(/^[A-Za-z0-9_-]+$/),
    intendedJourneyId: nonEmptyString.optional(),
    resourceType: z.literal('image').default('image'),
  })
  .strict();

export type UploadIntent = z.input<typeof UploadIntentSchema>;
export type ValidatedUploadIntent = z.output<typeof UploadIntentSchema>;

export const UploadAuthorizationSchema = z
  .object({
    provider: z.literal('cloudinary'),
    uploadUrl: z.string().url(),
    expiresAt: z.string().datetime(),
    parameters: z
      .object({
        api_key: nonEmptyString,
        timestamp: z.number().int().positive(),
        signature: nonEmptyString,
        folder: nonEmptyString,
        tags: nonEmptyString,
        allowed_formats: nonEmptyString,
        overwrite: z.literal(false),
        unique_filename: z.literal(true),
        use_filename: z.literal(false),
      })
      .strict(),
  })
  .strict();

export type UploadAuthorization = z.infer<typeof UploadAuthorizationSchema>;

export const ProviderAssetSchema = z
  .object({
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
    checksum: nonEmptyString.optional(),
    tags: z.array(nonEmptyString).default([]),
  })
  .strict();

export type ProviderAsset = z.infer<typeof ProviderAssetSchema>;

export const ProviderAssetPageSchema = z
  .object({
    assets: z.array(ProviderAssetSchema),
    nextCursor: nonEmptyString.optional(),
  })
  .strict();

export type ProviderAssetPage = z.infer<typeof ProviderAssetPageSchema>;

export const ImageDeliveryInputSchema = z
  .object({
    providerPublicId: nonEmptyString,
    version: z.number().int().nonnegative().optional(),
    width: z.number().finite().positive(),
    sourceWidth: z.number().int().positive(),
    sourceHeight: z.number().int().positive(),
    crop: CropSchema.optional(),
  })
  .strict();

export type ImageDeliveryInput = z.infer<typeof ImageDeliveryInputSchema>;

export const VideoDeliveryInputSchema = z
  .object({
    providerPublicId: nonEmptyString,
    version: z.number().int().nonnegative().optional(),
    width: z.number().finite().positive(),
    format: z.enum(['mp4', 'webm']).default('mp4'),
  })
  .strict();

export type VideoDeliveryInput = z.input<typeof VideoDeliveryInputSchema>;

export const ProviderUploadResultSchema = z
  .object({
    providerAssetId: nonEmptyString,
    providerPublicId: nonEmptyString,
    resourceType: z.enum(['image', 'video']),
    deliveryType: nonEmptyString,
    version: z.number().int().nonnegative(),
    originalFilename: nonEmptyString,
    format: nonEmptyString,
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    bytes: z.number().int().nonnegative(),
    checksum: nonEmptyString.optional(),
    tags: z.array(nonEmptyString).default([]),
    signature: nonEmptyString,
  })
  .strict();

export type ProviderUploadResult = z.infer<typeof ProviderUploadResultSchema>;

export const ExportReferenceSchema = z
  .object({
    providerAssetId: nonEmptyString,
    providerPublicId: nonEmptyString,
    resourceType: z.enum(['image', 'video']),
    url: z.string().url(),
  })
  .strict();

export type ExportReference = z.infer<typeof ExportReferenceSchema>;

export interface MediaProvider {
  createUploadAuthorization(intent: UploadIntent): Promise<UploadAuthorization>;
  verifyUploadResult(result: ProviderUploadResult): boolean;
  inspectAsset(providerAssetId: string): Promise<ProviderAsset>;
  buildImageUrl(input: ImageDeliveryInput): string;
  buildVideoUrl(input: VideoDeliveryInput): string;
  listAssets(cursor?: string): Promise<ProviderAssetPage>;
  getOriginalExportReference(providerAssetId: string): Promise<ExportReference>;
}
