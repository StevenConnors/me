import 'server-only';

import type { EditorMedia } from '@/components/editor/JourneyVisualEditor';
import { collectMediaPlacements, type JourneyDocument } from '@/lib/journeys/schemas';
import type { MediaProvider } from '@/lib/media/providers/MediaProvider';
import type { MediaRepository } from '@/lib/media/repository';
import type { MediaAsset, MediaPlacement } from '@/lib/media/schemas';

export async function loadJourneyEditorMedia(
  journey: { draftDocument: JourneyDocument; cover?: MediaPlacement | null },
  repository: Pick<MediaRepository, 'list' | 'findByIds'>,
  provider: Pick<MediaProvider, 'buildImageUrl'> | null,
): Promise<EditorMedia[]> {
  const referencedIds = new Set([
    ...(journey.cover ? [journey.cover.mediaAssetId] : []),
    ...collectMediaPlacements(journey.draftDocument).map(({ mediaAssetId }) => mediaAssetId),
  ]);
  // The library's newest page does not necessarily contain placed photographs.
  const [recentAssets, referencedAssets] = await Promise.all([
    repository.list({ limit: 100 }),
    repository.findByIds(referencedIds),
  ]);
  const assets = Array.from(new Map([...recentAssets, ...referencedAssets].map((asset) => [asset._id, asset])).values());
  return assets.filter((asset) => asset.resourceType === 'image').map((asset) => serializeJourneyEditorMedia(asset, provider));
}

export function serializeJourneyEditorMedia(
  asset: MediaAsset,
  provider: Pick<MediaProvider, 'buildImageUrl'> | null,
): EditorMedia {
  return {
    id: asset._id,
    title: asset.title || asset.originalFilename,
    width: asset.width,
    height: asset.height,
    altText: asset.altText,
    previewUrl: provider && asset.resourceType === 'image' && asset.status === 'ready'
      ? provider.buildImageUrl({
        providerPublicId: asset.providerPublicId,
        version: asset.version,
        width: 768,
        sourceWidth: asset.width,
        sourceHeight: asset.height,
      })
      : undefined,
  };
}
