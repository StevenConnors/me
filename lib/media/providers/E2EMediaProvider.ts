import {
  ExportReferenceSchema,
  ImageDeliveryInputSchema,
  ProviderAssetDeletionInputSchema,
  ProviderAssetPageSchema,
  ProviderAssetSchema,
  ProviderUploadResultSchema,
  UploadAuthorizationSchema,
  UploadIntentSchema,
  VideoDeliveryInputSchema,
  type ExportReference,
  type ImageDeliveryInput,
  type MediaProvider,
  type ProviderAsset,
  type ProviderAssetDeletionInput,
  type ProviderAssetPage,
  type ProviderUploadResult,
  type UploadAuthorization,
  type UploadIntent,
  type VideoDeliveryInput,
} from './MediaProvider';

const TEST_SIGNATURE = 'e2e-upload-signature';
const TRANSPARENT_PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
const E2E_BASE_URL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3001';

/**
 * A server-only provider for local browser tests. It is selected exclusively
 * through E2E_TEST_MODE and never makes a network request or stores files.
 */
export class E2EMediaProvider implements MediaProvider {
  async createUploadAuthorization(unparsedIntent: UploadIntent): Promise<UploadAuthorization> {
    const intent = UploadIntentSchema.parse(unparsedIntent);
    return UploadAuthorizationSchema.parse({
      provider: 'cloudinary',
      uploadUrl: `${E2E_BASE_URL}/api/e2e/media-upload`,
      expiresAt: '2099-01-01T00:00:00.000Z',
      parameters: {
        api_key: 'e2e',
        timestamp: 1,
        signature: TEST_SIGNATURE,
        folder: 'e2e',
        tags: `upload-session-${intent.idempotencyKey}`,
        allowed_formats: 'jpg,jpeg,png,webp,heic,heif',
        overwrite: false,
        unique_filename: true,
        use_filename: false,
      },
    });
  }

  verifyUploadResult(unparsedResult: ProviderUploadResult): boolean {
    const result = ProviderUploadResultSchema.parse(unparsedResult);
    return result.signature === TEST_SIGNATURE && result.providerAssetId.startsWith('e2e-');
  }

  async inspectAsset(providerAssetId: string): Promise<ProviderAsset> {
    const id = providerAssetId.trim();
    return ProviderAssetSchema.parse({
      providerAssetId: id,
      providerPublicId: `e2e/${id}`,
      resourceType: 'image',
      deliveryType: 'upload',
      version: 1,
      originalFilename: 'sample-image.png',
      format: 'png',
      width: 1,
      height: 1,
      bytes: 68,
      checksum: 'e2e-checksum',
      tags: [],
    });
  }

  async deleteAsset(unparsedInput: ProviderAssetDeletionInput): Promise<void> {
    ProviderAssetDeletionInputSchema.parse(unparsedInput);
  }

  buildImageUrl(unparsedInput: ImageDeliveryInput): string {
    ImageDeliveryInputSchema.parse(unparsedInput);
    return TRANSPARENT_PIXEL;
  }

  buildVideoUrl(unparsedInput: VideoDeliveryInput): string {
    VideoDeliveryInputSchema.parse(unparsedInput);
    return 'https://e2e.invalid/media.mp4';
  }

  async listAssets(): Promise<ProviderAssetPage> {
    return ProviderAssetPageSchema.parse({ assets: [] });
  }

  async getOriginalExportReference(providerAssetId: string): Promise<ExportReference> {
    const asset = await this.inspectAsset(providerAssetId);
    return ExportReferenceSchema.parse({
      providerAssetId: asset.providerAssetId,
      providerPublicId: asset.providerPublicId,
      resourceType: asset.resourceType,
      url: 'https://e2e.invalid/media.png',
    });
  }
}
