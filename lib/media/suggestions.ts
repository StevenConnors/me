import type { Collection } from 'mongodb';

import { getMediaLibraryCollections } from '@/lib/db/collections';
import { MediaCollectionNotFoundError, MediaCollectionSchema, type MediaCollection } from '@/lib/media/collections';
import { MediaAssetSchema, type MediaAsset } from '@/lib/media/schemas';
import type { MediaEnrichment } from '@/lib/media/enrichment';
import { getCloudinaryMediaProvider } from '@/lib/media/provider';
import { z } from 'zod';

export const DismissSuggestionsSchema = z.object({
  dismissedMediaAssetIds: z.array(z.string().trim().min(1)).max(500),
}).strict().refine(({ dismissedMediaAssetIds }) => new Set(dismissedMediaAssetIds).size === dismissedMediaAssetIds.length, 'Media IDs must be unique');

export type MediaSuggestion = { media: MediaAsset & { previewUrl?: string }; reasons: string[] };
const MAX_SUGGESTIONS = 100;

function normalizeTerm(value: string): string {
  const term = value.normalize('NFKD').toLocaleLowerCase().replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/gi, '').trim();
  if (term.length > 4 && term.endsWith('ies')) return `${term.slice(0, -3)}y`;
  if (term.length > 3 && term.endsWith('s') && !term.endsWith('ss')) return term.slice(0, -1);
  return term;
}

function tokens(value: string): Set<string> {
  return new Set(value.split(/[^a-z0-9]+/i).map(normalizeTerm).filter(Boolean));
}

function containsAllTerms(query: Set<string>, text: string): boolean {
  const words = tokens(text);
  return query.size > 0 && Array.from(query).every((term) => words.has(term));
}

function countryName(code: string) {
  try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code; }
  catch { return code; }
}

export class MediaCollectionSuggestionsRepository {
  constructor(
    readonly collections: Collection<MediaCollection>,
    readonly mediaAssets: Collection<MediaAsset>,
    readonly enrichments: Collection<MediaEnrichment>,
  ) {}

  static async connect() {
    const { collections, mediaAssets, mediaEnrichments } = await getMediaLibraryCollections();
    return new MediaCollectionSuggestionsRepository(collections, mediaAssets, mediaEnrichments);
  }

  async list(collectionId: string): Promise<MediaSuggestion[]> {
    const collection = await this.findCollection(collectionId);
    const dismissed = new Set(collection.dismissedMediaAssetIds ?? []);
    const excluded = new Set(collection.mediaAssetIds.concat(Array.from(dismissed)));
    const rule = collection.suggestionRule ?? { kind: 'subject' as const, query: collection.name };
    const query = rule.kind === 'subject' ? tokens(rule.query) : new Set<string>();
    const top: Array<{ media: MediaAsset; reasons: string[]; score: number }> = [];
    const cursor = this.mediaAssets.find({ status: 'ready', resourceType: 'image' }).sort({ _id: 1 });
    const batchSize = 250;
    let batch: MediaAsset[] = [];
    const processBatch = async (assets: MediaAsset[]) => {
      const eligible = assets.filter(({ _id }) => !excluded.has(_id));
      if (!eligible.length) return;
      const enrichments = await this.enrichments.find({ mediaAssetId: { $in: eligible.map(({ _id }) => _id) } }).toArray();
      const enrichmentById = new Map(enrichments.map((item) => [item.mediaAssetId, item]));
      for (const media of eligible) {
        const enrichment = enrichmentById.get(media._id);
        let score = 0;
        const reasons: string[] = [];
        if (rule.kind === 'country') {
          if (enrichment?.countryCode?.toUpperCase() === rule.countryCode) {
            score = 100;
            reasons.push(`Taken in ${countryName(rule.countryCode)}`);
          }
        } else {
          const conceptText = enrichment?.concepts.join(' ') ?? '';
          if (containsAllTerms(query, conceptText)) {
            score += 100;
            reasons.push(`AI identified ${enrichment?.concepts.join(', ')}`);
          }
          if (containsAllTerms(query, enrichment?.description ?? '')) {
            score += 50;
            reasons.push('Matches image description');
          }
          const authorText = [media.title, media.caption, media.altText, ...media.tags.filter((tag) => !tag.toLowerCase().startsWith('upload-session-'))].filter(Boolean).join(' ');
          if (containsAllTerms(query, authorText)) {
            score += 20;
            reasons.push('Matches media details');
          }
        }
        if (!score) continue;
        top.push({ media: MediaAssetSchema.parse(media), reasons, score });
      }
      top.sort((a, b) => b.score - a.score || a.media._id.localeCompare(b.media._id));
      top.length = Math.min(top.length, MAX_SUGGESTIONS);
    };
    for await (const asset of cursor) {
      batch.push(asset);
      if (batch.length === batchSize) { await processBatch(batch); batch = []; }
    }
    if (batch.length) await processBatch(batch);
    let provider: ReturnType<typeof getCloudinaryMediaProvider> | null = null;
    try { provider = getCloudinaryMediaProvider(); } catch { /* Suggestions remain useful without delivery credentials. */ }
    return top.slice(0, MAX_SUGGESTIONS).map(({ media, reasons }) => ({
      media: {
        ...media,
        ...(provider ? { previewUrl: provider.buildImageUrl({ providerPublicId: media.providerPublicId, version: media.version, width: 768, sourceWidth: media.width, sourceHeight: media.height }) } : {}),
      },
      reasons,
    }));
  }

  async dismiss(collectionId: string, ids: string[]): Promise<void> {
    const collection = await this.findCollection(collectionId);
    await this.collections.updateOne({ _id: collection._id }, { $addToSet: { dismissedMediaAssetIds: { $each: ids } }, $set: { updatedAt: new Date() } });
  }

  private async findCollection(id: string): Promise<MediaCollection> {
    const collection = await this.collections.findOne({ _id: id });
    if (!collection) throw new MediaCollectionNotFoundError(id);
    return MediaCollectionSchema.parse(collection);
  }
}
