import { createHash, timingSafeEqual } from 'node:crypto';

import {
  ExportReference,
  ExportReferenceSchema,
  ImageDeliveryInput,
  ImageDeliveryInputSchema,
  MediaProvider,
  ProviderAsset,
  ProviderAssetPage,
  ProviderAssetPageSchema,
  ProviderAssetSchema,
  ProviderUploadResult,
  ProviderUploadResultSchema,
  UploadAuthorization,
  UploadAuthorizationSchema,
  UploadIntent,
  UploadIntentSchema,
  VideoDeliveryInput,
  VideoDeliveryInputSchema,
} from './MediaProvider';

export const SUPPORTED_MEDIA_WIDTHS = [320, 480, 768, 1024, 1440, 1920] as const;

type SignatureAlgorithm = 'sha1' | 'sha256';
type CloudinaryScalar = string | number | boolean;

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>;

export type CloudinaryProviderOptions = {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  uploadFolder?: string;
  maxUploadBytes?: number;
  uploadTtlSeconds?: number;
  signatureAlgorithm?: SignatureAlgorithm;
  responseSignatureAlgorithm?: SignatureAlgorithm;
  fetch?: FetchLike;
  now?: () => Date;
};

type CloudinaryResource = {
  asset_id?: unknown;
  public_id?: unknown;
  resource_type?: unknown;
  type?: unknown;
  version?: unknown;
  original_filename?: unknown;
  filename?: unknown;
  format?: unknown;
  width?: unknown;
  height?: unknown;
  bytes?: unknown;
  etag?: unknown;
  tags?: unknown;
};

export class MediaProviderError extends Error {
  readonly code: string;
  readonly status?: number;

  constructor(code: string, message: string, status?: number) {
    super(message);
    this.name = 'MediaProviderError';
    this.code = code;
    this.status = status;
  }
}

export function clampMediaWidth(requestedWidth: number): (typeof SUPPORTED_MEDIA_WIDTHS)[number] {
  if (!Number.isFinite(requestedWidth) || requestedWidth <= 0) {
    throw new MediaProviderError('INVALID_WIDTH', 'Media width must be a positive number');
  }

  return (
    SUPPORTED_MEDIA_WIDTHS.find((width) => width >= requestedWidth) ??
    SUPPORTED_MEDIA_WIDTHS[SUPPORTED_MEDIA_WIDTHS.length - 1]
  );
}

function encodePublicId(publicId: string): string {
  return publicId
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function positiveInteger(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) return undefined;
  return value;
}

function mapCloudinaryResource(resource: CloudinaryResource): ProviderAsset {
  return ProviderAssetSchema.parse({
    providerAssetId: resource.asset_id,
    providerPublicId: resource.public_id,
    resourceType: resource.resource_type,
    deliveryType: resource.type ?? 'upload',
    version: positiveInteger(resource.version),
    originalFilename: resource.original_filename ?? resource.filename ?? resource.public_id,
    format: resource.format,
    width: resource.width,
    height: resource.height,
    bytes: resource.bytes,
    checksum: typeof resource.etag === 'string' && resource.etag ? resource.etag : undefined,
    tags: Array.isArray(resource.tags) ? resource.tags : [],
  });
}

function serializeSignatureParameters(parameters: Record<string, CloudinaryScalar>): string {
  return Object.entries(parameters)
    .filter(([, value]) => value !== '' && value !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join('&');
}

function createSignature(
  parameters: Record<string, CloudinaryScalar>,
  secret: string,
  algorithm: SignatureAlgorithm,
): string {
  return createHash(algorithm)
    .update(`${serializeSignatureParameters(parameters)}${secret}`)
    .digest('hex');
}

function transformNumber(value: number): string {
  return Number(value.toFixed(4)).toString();
}

function buildImageTransformations(input: ImageDeliveryInput): string[] {
  const width = clampMediaWidth(input.width);
  const transformations = ['f_auto,q_auto'];

  if (input.crop?.mode === 'manual' && input.crop.rect) {
    const x = Math.round(input.crop.rect.x * input.sourceWidth);
    const y = Math.round(input.crop.rect.y * input.sourceHeight);
    const cropWidth = Math.max(1, Math.round(input.crop.rect.width * input.sourceWidth));
    const cropHeight = Math.max(1, Math.round(input.crop.rect.height * input.sourceHeight));
    transformations.push(`c_crop,x_${x},y_${y},w_${cropWidth},h_${cropHeight}`);
  } else if (input.crop?.mode === 'focal-fill' && input.crop.aspectRatio) {
    const focalPoint = input.crop.focalPoint ?? { x: 0.5, y: 0.5 };
    const x = Math.round(focalPoint.x * input.sourceWidth);
    const y = Math.round(focalPoint.y * input.sourceHeight);
    const zoom = input.crop.zoom ? `,z_${transformNumber(input.crop.zoom)}` : '';
    transformations.push(
      `c_fill,ar_${transformNumber(input.crop.aspectRatio)},g_xy_center,x_${x},y_${y}${zoom}`,
    );
  }

  transformations.push(`c_limit,w_${width}`);
  return transformations;
}

export class CloudinaryProvider implements MediaProvider {
  private readonly cloudName: string;
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly uploadFolder: string;
  private readonly maxUploadBytes: number;
  private readonly uploadTtlSeconds: number;
  private readonly signatureAlgorithm: SignatureAlgorithm;
  private readonly responseSignatureAlgorithm: SignatureAlgorithm;
  private readonly fetcher: FetchLike;
  private readonly now: () => Date;

  constructor(options: CloudinaryProviderOptions) {
    this.cloudName = options.cloudName.trim();
    this.apiKey = options.apiKey.trim();
    this.apiSecret = options.apiSecret;
    this.uploadFolder = options.uploadFolder?.trim() || 'journey-editor';
    this.maxUploadBytes = options.maxUploadBytes ?? 20 * 1024 * 1024;
    this.uploadTtlSeconds = options.uploadTtlSeconds ?? 5 * 60;
    this.signatureAlgorithm = options.signatureAlgorithm ?? 'sha256';
    this.responseSignatureAlgorithm = options.responseSignatureAlgorithm ?? 'sha1';
    this.fetcher = options.fetch ?? fetch;
    this.now = options.now ?? (() => new Date());

    if (!this.cloudName || !this.apiKey || !this.apiSecret) {
      throw new MediaProviderError(
        'INVALID_CONFIGURATION',
        'Cloudinary cloud name, API key, and API secret are required',
      );
    }
    if (!Number.isInteger(this.maxUploadBytes) || this.maxUploadBytes <= 0) {
      throw new MediaProviderError('INVALID_CONFIGURATION', 'Maximum upload size must be positive');
    }
    if (!Number.isInteger(this.uploadTtlSeconds) || this.uploadTtlSeconds <= 0) {
      throw new MediaProviderError('INVALID_CONFIGURATION', 'Upload TTL must be positive');
    }
  }

  async createUploadAuthorization(intent: UploadIntent): Promise<UploadAuthorization> {
    const parsedIntent = UploadIntentSchema.parse(intent);
    if (parsedIntent.bytes > this.maxUploadBytes) {
      throw new MediaProviderError(
        'UPLOAD_TOO_LARGE',
        `Image exceeds the configured ${this.maxUploadBytes}-byte upload limit`,
      );
    }

    const timestamp = Math.floor(this.now().getTime() / 1_000);
    const tags = `upload-session-${parsedIntent.idempotencyKey}`;
    const signedParameters = {
      allowed_formats: 'jpg,jpeg,png,webp,heic,heif',
      folder: this.uploadFolder,
      overwrite: false,
      tags,
      timestamp,
      unique_filename: true,
      use_filename: false,
    };

    return UploadAuthorizationSchema.parse({
      provider: 'cloudinary',
      uploadUrl: `https://api.cloudinary.com/v1_1/${encodeURIComponent(this.cloudName)}/image/upload`,
      expiresAt: new Date((timestamp + this.uploadTtlSeconds) * 1_000).toISOString(),
      parameters: {
        api_key: this.apiKey,
        ...signedParameters,
        signature: createSignature(signedParameters, this.apiSecret, this.signatureAlgorithm),
      },
    });
  }

  /**
   * Cloudinary signs upload responses over public_id and version. Routes may
   * use this inexpensive check before (or in addition to) inspectAsset.
   */
  verifyUploadResult(result: ProviderUploadResult): boolean {
    const parsedResult = ProviderUploadResultSchema.parse(result);
    const expected = createSignature(
      {
        public_id: parsedResult.providerPublicId,
        version: parsedResult.version,
      },
      this.apiSecret,
      this.responseSignatureAlgorithm,
    );

    const expectedBytes = Buffer.from(expected, 'utf8');
    const actualBytes = Buffer.from(parsedResult.signature, 'utf8');
    return expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes);
  }

  buildImageUrl(unparsedInput: ImageDeliveryInput): string {
    const input = ImageDeliveryInputSchema.parse(unparsedInput);
    const transformations = buildImageTransformations(input).join('/');
    const version = input.version === undefined ? '' : `v${input.version}/`;
    const publicId = encodePublicId(input.providerPublicId);
    return `https://res.cloudinary.com/${encodeURIComponent(this.cloudName)}/image/upload/${transformations}/${version}${publicId}`;
  }

  buildVideoUrl(unparsedInput: VideoDeliveryInput): string {
    const input = VideoDeliveryInputSchema.parse(unparsedInput);
    const width = clampMediaWidth(input.width);
    const version = input.version === undefined ? '' : `v${input.version}/`;
    const publicId = encodePublicId(input.providerPublicId);
    return `https://res.cloudinary.com/${encodeURIComponent(this.cloudName)}/video/upload/f_${input.format},q_auto/c_limit,w_${width}/${version}${publicId}.${input.format}`;
  }

  async inspectAsset(providerAssetId: string): Promise<ProviderAsset> {
    const assetId = zodNonEmpty(providerAssetId, 'providerAssetId');
    const url = `https://api.cloudinary.com/v1_1/${encodeURIComponent(this.cloudName)}/resources/${encodeURIComponent(assetId)}`;
    const response = await this.fetcher(url, { headers: this.authorizationHeaders() });
    if (!response.ok) {
      throw new MediaProviderError(
        'ASSET_INSPECTION_FAILED',
        'Cloudinary asset inspection failed',
        response.status,
      );
    }
    return mapCloudinaryResource((await response.json()) as CloudinaryResource);
  }

  async listAssets(cursor?: string): Promise<ProviderAssetPage> {
    const body: Record<string, unknown> = {
      expression: 'resource_type:image OR resource_type:video',
      max_results: 100,
      sort_by: [{ created_at: 'desc' }],
    };
    if (cursor) body.next_cursor = zodNonEmpty(cursor, 'cursor');

    const url = `https://api.cloudinary.com/v1_1/${encodeURIComponent(this.cloudName)}/resources/search`;
    const response = await this.fetcher(url, {
      method: 'POST',
      headers: {
        ...this.authorizationHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new MediaProviderError('ASSET_LIST_FAILED', 'Cloudinary asset listing failed', response.status);
    }

    const data = (await response.json()) as { resources?: CloudinaryResource[]; next_cursor?: unknown };
    return ProviderAssetPageSchema.parse({
      assets: (data.resources ?? []).map(mapCloudinaryResource),
      nextCursor: typeof data.next_cursor === 'string' ? data.next_cursor : undefined,
    });
  }

  async getOriginalExportReference(providerAssetId: string): Promise<ExportReference> {
    const asset = await this.inspectAsset(providerAssetId);
    const version = asset.version === undefined ? '' : `v${asset.version}/`;
    const extension = encodeURIComponent(asset.format);
    return ExportReferenceSchema.parse({
      providerAssetId: asset.providerAssetId,
      providerPublicId: asset.providerPublicId,
      resourceType: asset.resourceType,
      url: `https://res.cloudinary.com/${encodeURIComponent(this.cloudName)}/${asset.resourceType}/upload/${version}${encodePublicId(asset.providerPublicId)}.${extension}`,
    });
  }

  private authorizationHeaders(): HeadersInit {
    return {
      Authorization: `Basic ${Buffer.from(`${this.apiKey}:${this.apiSecret}`).toString('base64')}`,
    };
  }
}

function zodNonEmpty(value: string, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new MediaProviderError('INVALID_INPUT', `${field} is required`);
  }
  return value.trim();
}
