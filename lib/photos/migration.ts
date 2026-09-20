import { createHash } from 'node:crypto';
import { ObjectId } from 'mongodb';

import {
  PhotosPageDocumentSchema,
  type PhotosPageBlock,
  type PhotosPageDocument,
} from '@/lib/photos/schemas';
import type { MediaAsset } from '@/lib/media/schemas';

function optionalCopy(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

/**
 * Preserve the existing bounded public query exactly. The caller owns sorting;
 * this function intentionally never sorts the provided records again.
 */
export function createPhotosDocumentFromLegacyMedia(
  photos: MediaAsset[],
  createBlockId: () => string = () => new ObjectId().toHexString(),
): PhotosPageDocument {
  const blocks: PhotosPageBlock[] = [];

  for (const photo of photos) {
    if (photo.photoSectionBreak) {
      blocks.push({
        id: createBlockId(),
        type: 'section',
        ...(optionalCopy(photo.photoSectionBreak.title) ? { title: optionalCopy(photo.photoSectionBreak.title) } : {}),
        ...(optionalCopy(photo.photoSectionBreak.text) ? { text: optionalCopy(photo.photoSectionBreak.text) } : {}),
      });
    }
    const altText = optionalCopy(photo.altText);
    blocks.push({
      id: createBlockId(),
      type: 'media',
      mediaAssetId: photo._id,
      ...(optionalCopy(photo.caption) ? { caption: optionalCopy(photo.caption) } : {}),
      ...(altText ? { altText } : {}),
      decorative: !altText,
      ...(photo.captureDate ? { displayDate: photo.captureDate } : {}),
    });
  }

  return PhotosPageDocumentSchema.parse({ schemaVersion: 1, blocks });
}

/** A stable dry-run digest that excludes generated editing IDs. */
export function photosDocumentDigest(document: PhotosPageDocument): string {
  const semanticBlocks = document.blocks.map((block) => {
    const { id: _id, ...semanticBlock } = block;
    return semanticBlock;
  });
  return createHash('sha256').update(JSON.stringify(semanticBlocks)).digest('hex');
}

export function compareLegacyPhotosDocument(
  legacy: MediaAsset[],
  document: PhotosPageDocument,
): string[] {
  const expected = createPhotosDocumentFromLegacyMedia(
    legacy,
    (() => {
      let value = 0;
      return () => `block-${++value}`;
    })(),
  );
  const expectedSemantic = expected.blocks.map(({ id: _id, ...block }) => block);
  const actualSemantic = document.blocks.map(({ id: _id, ...block }) => block);
  return JSON.stringify(expectedSemantic) === JSON.stringify(actualSemantic)
    ? []
    : ['The Photos document does not semantically match the legacy public ordering'];
}
