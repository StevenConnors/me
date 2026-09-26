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
  VideoPosterInputSchema,
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
  type VideoPosterInput,
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
      uploadUrl: `${E2E_BASE_URL}/api/e2e/media-upload?resourceType=${intent.resourceType}`,
      expiresAt: '2099-01-01T00:00:00.000Z',
      parameters: {
        api_key: 'e2e',
        timestamp: 1,
        signature: TEST_SIGNATURE,
        folder: 'e2e',
        tags: `upload-session-${intent.idempotencyKey}`,
        allowed_formats: intent.resourceType === 'video' ? 'mp4,mov,webm' : 'jpg,jpeg,png,webp,heic,heif',
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
    const encodedFilename = id.split('~')[1];
    const filename = encodedFilename ? decodeURIComponent(encodedFilename) : undefined;
    return ProviderAssetSchema.parse({
      providerAssetId: id,
      providerPublicId: `e2e/${id}`,
      resourceType: id.startsWith('e2e-video-') ? 'video' : 'image',
      deliveryType: 'upload',
      version: 1,
      originalFilename: filename ?? (id.startsWith('e2e-video-') ? 'sample-video.mp4' : 'sample-image.png'),
      format: id.startsWith('e2e-video-') ? 'mp4' : 'png',
      width: 1,
      height: 1,
      bytes: 68,
      checksum: 'e2e-checksum',
      tags: [],
    });
  }

  async getAssetMetadata(providerAssetId: string): Promise<Record<string, unknown>> {
    const encodedFilename = providerAssetId.split('~')[1];
    const filename = encodedFilename ? decodeURIComponent(encodedFilename) : '';
    if (filename === 'gps-eg-fixture.png') {
      return { GPSLatitude: 30.0444, GPSLatitudeRef: 'N', GPSLongitude: 31.2357, GPSLongitudeRef: 'E' };
    }
    if (filename === 'gps-us-fixture.png') {
      return { GPSLatitude: 37.7749, GPSLatitudeRef: 'N', GPSLongitude: '122.4194', GPSLongitudeRef: 'W' };
    }
    return {};
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

  buildVideoPosterUrl(unparsedInput: VideoPosterInput): string {
    VideoPosterInputSchema.parse(unparsedInput);
    return TRANSPARENT_PIXEL;
  }

  async listAssets(cursor?: string, resourceType?: 'image' | 'video'): Promise<ProviderAssetPage> {
    return ProviderAssetPageSchema.parse({ assets: !cursor && resourceType === 'video' ? [{
      providerAssetId: 'e2e-existing-video',
      providerPublicId: 'e2e/existing-video',
      resourceType: 'video',
      deliveryType: 'upload',
      version: 1,
      originalFilename: 'existing-video.mp4',
      format: 'mp4',
      width: 640,
      height: 360,
      bytes: 1024,
      tags: [],
    }] : [] });
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
