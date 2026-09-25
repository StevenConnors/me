import 'server-only';

import type {
  BuildMediaUrl,
  JourneyMediaAsset,
} from '@/components/journey/types';
import { getCloudinaryMediaProvider } from '@/lib/media/provider';
import { MediaRepository } from '@/lib/media/repository';

export async function loadJourneyMediaPresentation(mediaIds: Iterable<string>) {
  const records = await (await MediaRepository.connect()).findByIds(mediaIds);
  const recordsById = new Map(records.map((asset) => [asset._id, asset]));
  const assets = Object.fromEntries(records.map((asset) => [asset._id, {
    id: asset._id,
    resourceType: asset.resourceType,
    width: asset.width,
    height: asset.height,
    title: asset.title,
    caption: asset.caption,
    altText: asset.altText,
    originalFilename: asset.originalFilename,
  } satisfies JourneyMediaAsset]));
  let provider: ReturnType<typeof getCloudinaryMediaProvider> | null = null;
  try {
    provider = getCloudinaryMediaProvider();
  } catch {
    provider = null;
  }

  const buildMediaUrl: BuildMediaUrl = ({ asset, placement, viewport, width, purpose }) => {
    const record = recordsById.get(asset.id ?? placement.mediaAssetId);
    if (!record || !provider) return null;
    if (record.resourceType === 'video') {
      if (purpose === 'poster') return provider.buildVideoPosterUrl({
        providerPublicId: record.providerPublicId,
        version: record.version,
        width,
      });
      return provider.buildVideoUrl({
        providerPublicId: record.providerPublicId,
        version: record.version,
        width,
        format: record.format === 'webm' ? 'webm' : 'mp4',
      });
    }
    return provider.buildImageUrl({
      providerPublicId: record.providerPublicId,
      version: record.version,
      width,
      sourceWidth: record.width,
      sourceHeight: record.height,
      crop: placement.crop?.[viewport],
    });
  };

  return { assets, buildMediaUrl, records };
}
