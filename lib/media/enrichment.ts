import { z } from 'zod';
import { iso1A2Code } from '@rapideditor/country-coder';
import enrichmentPrompt from '@/lib/media/enrichment-prompt.json';
import { isE2ETestMode } from '@/lib/e2e/test-mode';

import type { Collection, UpdateFilter } from 'mongodb';
import { getMediaCollections } from '@/lib/db/collections';
import type { ProviderAsset } from '@/lib/media/providers/MediaProvider';
import type { MediaAsset } from '@/lib/media/schemas';

const nonEmptyString = z.string().trim().min(1);

/** Versioned enrichment stored separately from editor-authored media metadata. */
export const MediaEnrichmentSchema = z.object({
  _id: nonEmptyString.optional(),
  mediaAssetId: nonEmptyString,
  schemaVersion: z.number().int().positive().optional(),
  status: z.enum(['pending', 'ready', 'failed', 'skipped']).optional(),
  source: z.enum(['openai-vision', 'codex-vision', 'gps-only', 'none']).optional(),
  model: nonEmptyString.optional(),
  concepts: z.array(nonEmptyString).default([]),
  description: nonEmptyString.optional(),
  countryCode: z.string().regex(/^[A-Z]{2}$/).optional(),
  updatedAt: z.date(),
  error: nonEmptyString.optional(),
}).strict();

export type MediaEnrichment = z.infer<typeof MediaEnrichmentSchema>;

const VisionOutputSchema = z.object({
  concepts: z.array(z.string()).max(30),
  description: z.string().max(500),
}).strict();

const CURRENT_SCHEMA_VERSION = 1;
const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_VISION_MODEL = 'gpt-4.1-mini';
const REQUEST_TIMEOUT_MS = 25_000;

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type MediaEnrichmentInput = {
  mediaAssetId: string;
  providerAsset: ProviderAsset;
  imageUrl: string;
  metadata?: Record<string, unknown>;
  analyzeImage?: boolean;
};

function normalizeConcepts(values: string[]): string[] {
  return Array.from(new Set(values
    .map((value) => value.normalize('NFKC').toLocaleLowerCase('en-US').trim()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' '))
    .filter(Boolean)))
    .slice(0, 30);
}

function applyCoordinateReference(value: number, reference: unknown): number {
  if (value < 0) return value;
  return typeof reference === 'string' && /^[SW]$/i.test(reference.trim()) ? -value : value;
}

function parseExifCoordinate(value: unknown, reference: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return applyCoordinateReference(value, reference);
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric)) {
    return applyCoordinateReference(numeric, reference);
  }

  // Cloudinary may expose EXIF rational DMS components as "deg/1,min/1,sec/100".
  const parts = trimmed.split(/[ ,]+/).map((part) => {
    const [numerator, denominator = '1'] = part.split('/');
    const n = Number(numerator);
    const d = Number(denominator);
    return Number.isFinite(n) && Number.isFinite(d) && d !== 0 ? n / d : NaN;
  });
  if (parts.length < 3 || parts.slice(0, 3).some((part) => !Number.isFinite(part))) return undefined;
  return applyCoordinateReference(Math.abs(parts[0]) + parts[1] / 60 + parts[2] / 3600, reference);
}

function getCountryCode(metadata?: Record<string, unknown>): string | undefined {
  if (!metadata) return undefined;
  const gps = (metadata.GPS ?? metadata.gps ?? metadata.EXIF ?? metadata.exif) as Record<string, unknown> | undefined;
  const lat = parseExifCoordinate(metadata.GPSLatitude ?? metadata.gps_latitude ?? gps?.GPSLatitude ?? gps?.latitude,
    metadata.GPSLatitudeRef ?? metadata.gps_latitude_ref ?? gps?.GPSLatitudeRef ?? gps?.latitudeRef);
  const lng = parseExifCoordinate(metadata.GPSLongitude ?? metadata.gps_longitude ?? gps?.GPSLongitude ?? gps?.longitude,
    metadata.GPSLongitudeRef ?? metadata.gps_longitude_ref ?? gps?.GPSLongitudeRef ?? gps?.longitudeRef);
  if (lat === undefined || lng === undefined || lat < -90 || lat > 90 || lng < -180 || lng > 180) return undefined;
  return iso1A2Code([lng, lat]) ?? undefined;
}

export class MediaEnrichmentService {
  constructor(
    readonly enrichments: Collection<MediaEnrichment>,
    private readonly options: { apiKey?: string; model?: string; fetch?: FetchLike } = {},
    private readonly mediaAssets?: Collection<MediaAsset>,
  ) {}

  static async connect() {
    const { mediaAssets, mediaEnrichments } = await getMediaCollections();
    await mediaEnrichments.createIndex({ mediaAssetId: 1 }, { unique: true });
    return new MediaEnrichmentService(mediaEnrichments, {}, mediaAssets);
  }

  async ensurePending(mediaAssetId: string, now = new Date()): Promise<void> {
    await this.enrichments.updateOne(
      { mediaAssetId },
      { $setOnInsert: MediaEnrichmentSchema.parse({
        mediaAssetId, schemaVersion: CURRENT_SCHEMA_VERSION, status: 'pending', concepts: [], updatedAt: now,
      }) },
      { upsert: true },
    );
  }

  private async save(mediaAssetId: string, record: MediaEnrichment): Promise<boolean> {
    if (this.mediaAssets && !(await this.mediaAssets.findOne({ _id: mediaAssetId }, { projection: { _id: 1 } }))) {
      await this.enrichments.deleteOne({ mediaAssetId });
      return false;
    }
    const protectedVisual = { status: 'ready', source: { $in: ['codex-vision', 'openai-vision'] } };
    if (record.source !== 'codex-vision' && record.source !== 'openai-vision') {
      const current = await this.enrichments.findOne({ mediaAssetId });
      if (current?.status === 'ready' && (current.source === 'codex-vision' || current.source === 'openai-vision')) return true;
    }
    const optionalFields = ['description', 'countryCode', 'model', 'error'];
    const unset: Record<string, ''> = {};
    for (const field of optionalFields) {
      if (!(field in record)) unset[field] = '';
    }
    const filter = { mediaAssetId, $nor: [protectedVisual] };
    const result = await this.enrichments.updateOne(filter, {
      $set: record,
      ...(Object.keys(unset).length ? { $unset: unset } : {}),
    } as UpdateFilter<MediaEnrichment>);
    if (!result.matchedCount) {
      const current = await this.enrichments.findOne({ mediaAssetId });
      if (current?.status === 'ready' && (current.source === 'codex-vision' || current.source === 'openai-vision')) return true;
      if (current) return false;
      try { await this.enrichments.insertOne(record); }
      catch (error) {
        const raced = await this.enrichments.findOne({ mediaAssetId });
        if (!(raced?.status === 'ready' && (raced.source === 'codex-vision' || raced.source === 'openai-vision'))) throw error;
      }
    }
    if (this.mediaAssets && !(await this.mediaAssets.findOne({ _id: mediaAssetId }, { projection: { _id: 1 } }))) {
      await this.enrichments.deleteOne({ mediaAssetId });
      return false;
    }
    return true;
  }

  async enrich(input: MediaEnrichmentInput, now = new Date()): Promise<MediaEnrichment | null> {
    const apiKey = this.options.apiKey ?? (process.env.MEDIA_ENRICHMENT_MODE === 'openai' && !isE2ETestMode() ? process.env.OPENAI_API_KEY : undefined);
    const countryCode = getCountryCode(input.metadata);
    const selectedModel = this.options.model ?? process.env.MEDIA_ENRICHMENT_OPENAI_MODEL ?? DEFAULT_VISION_MODEL;
    if (!apiKey || input.analyzeImage === false || !input.imageUrl) {
      const record = MediaEnrichmentSchema.parse({
        mediaAssetId: input.mediaAssetId,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        status: input.analyzeImage === false ? (countryCode ? 'ready' : 'skipped') : 'pending',
        concepts: [], ...(countryCode ? { countryCode } : {}), updatedAt: now,
        source: countryCode ? 'gps-only' : 'none',
      });
      return await this.save(input.mediaAssetId, record) ? record : null;
    }
    try {
      const result = await (this.options.fetch ?? fetch)(OPENAI_RESPONSES_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: selectedModel,
          store: false,
          input: [{
            role: 'user',
            content: [
              { type: 'input_text', text: enrichmentPrompt.vision },
              { type: 'input_image', image_url: input.imageUrl, detail: 'low' },
            ],
          }],
          text: {
            format: {
              type: 'json_schema',
              name: 'media_enrichment',
              strict: true,
              schema: {
                type: 'object', additionalProperties: false,
                properties: {
                  concepts: { type: 'array', items: { type: 'string' }, maxItems: 30 },
                  description: { type: 'string' },
                }, required: ['concepts', 'description'],
              },
            },
          },
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!result.ok) throw new Error(`OpenAI enrichment request failed (${result.status})`);
      const response = await result.json() as { output_text?: unknown; output?: Array<{ content?: Array<{ text?: unknown }> }> };
      const text = typeof response.output_text === 'string'
        ? response.output_text
        : response.output?.flatMap((item) => item.content ?? []).find((part) => typeof part.text === 'string')?.text;
      if (typeof text !== 'string') throw new Error('OpenAI response did not contain structured output');
      const vision = VisionOutputSchema.parse(JSON.parse(text));
      const record = MediaEnrichmentSchema.parse({
        mediaAssetId: input.mediaAssetId,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        status: 'ready',
        source: 'openai-vision',
        model: selectedModel,
        concepts: normalizeConcepts(vision.concepts),
        ...(vision.description.trim() ? { description: vision.description.trim() } : {}),
        ...(countryCode ? { countryCode } : {}),
        updatedAt: now,
      });
      return await this.save(input.mediaAssetId, record) ? record : null;
    } catch (error) {
      const failure = {
        mediaAssetId: input.mediaAssetId,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        status: 'failed',
        source: apiKey ? 'openai-vision' : 'gps-only',
        ...(apiKey ? { model: selectedModel } : {}),
        updatedAt: now,
        concepts: [],
        ...(countryCode ? { countryCode } : {}),
        error: error instanceof Error ? error.message.slice(0, 500) : 'Unknown enrichment error',
      } as MediaEnrichment;
      await this.save(input.mediaAssetId, failure);
      throw error;
    }
  }

  async isCurrent(mediaAssetId: string): Promise<boolean> {
    const record = await this.enrichments.findOne({ mediaAssetId });
    const apiKey = this.options.apiKey ?? (process.env.MEDIA_ENRICHMENT_MODE === 'openai' && !isE2ETestMode() ? process.env.OPENAI_API_KEY : undefined);
    if (!record || record.schemaVersion !== CURRENT_SCHEMA_VERSION) return false;
    if (record.status === 'pending' && (record.source === 'gps-only' || record.source === 'none') && !apiKey) return true;
    if (record.status === 'skipped' && !apiKey) return true;
    if (record.status !== 'ready') return false;
    if (record.source === 'codex-vision') return true;
    if (record.source === 'gps-only' || record.source === 'none') return !apiKey;
    if (!apiKey) return record.source === 'openai-vision' || record.source === 'gps-only' || record.source === 'none';
    const model = this.options.model ?? process.env.MEDIA_ENRICHMENT_OPENAI_MODEL ?? DEFAULT_VISION_MODEL;
    return record.source !== 'openai-vision' || record.model === model;
  }

  async markFailed(mediaAssetId: string, error: unknown, now = new Date()): Promise<void> {
    const existing = await this.enrichments.findOne({ mediaAssetId }, { projection: { countryCode: 1 } });
    await this.save(mediaAssetId, {
      mediaAssetId,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      status: 'failed',
      source: existing?.countryCode ? 'gps-only' : 'none',
      updatedAt: now,
      concepts: [],
      ...(existing?.countryCode ? { countryCode: existing.countryCode } : {}),
      error: error instanceof Error ? error.message.slice(0, 500) : 'Unknown enrichment error',
    });
  }
}
