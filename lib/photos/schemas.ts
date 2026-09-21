import { z } from 'zod';

import { MediaIdSchema } from '@/lib/media/schemas';

const trimmedNonEmpty = (maximum: number) => z.string().trim().min(1).max(maximum);

/**
 * Block IDs are application-owned editing identifiers. They deliberately use
 * the same boundary as media IDs so provider URLs can never become document
 * identities.
 */
export const PhotosBlockIdSchema = MediaIdSchema;

const OptionalSectionTitleSchema = trimmedNonEmpty(500).optional();
const OptionalLongCopySchema = trimmedNonEmpty(2_000).optional();
const OptionalAltTextSchema = trimmedNonEmpty(1_000).optional();

export const PhotosSectionBlockSchema = z
  .object({
    id: PhotosBlockIdSchema,
    type: z.literal('section'),
    title: OptionalSectionTitleSchema,
    text: OptionalLongCopySchema,
  })
  .strict();

export type PhotosSectionBlock = z.infer<typeof PhotosSectionBlockSchema>;

export const PhotosMediaBlockSchema = z
  .object({
    id: PhotosBlockIdSchema,
    type: z.literal('media'),
    mediaAssetId: MediaIdSchema,
    caption: OptionalLongCopySchema,
    altText: OptionalAltTextSchema,
    decorative: z.boolean(),
    displayDate: z.string().date().optional(),
  })
  .strict();

export type PhotosMediaBlock = z.infer<typeof PhotosMediaBlockSchema>;

export const PhotosPageBlockSchema = z.discriminatedUnion('type', [
  PhotosSectionBlockSchema,
  PhotosMediaBlockSchema,
]);

export type PhotosPageBlock = z.infer<typeof PhotosPageBlockSchema>;

/**
 * Structural validation intentionally permits empty section runs while an
 * author is composing. Those draft-only states are rejected at publish time.
 */
export const PhotosPageDocumentSchema = z
  .object({
    schemaVersion: z.literal(1),
    blocks: z.array(PhotosPageBlockSchema).max(600),
  })
  .strict()
  .superRefine((document, context) => {
    const blockIds = new Set<string>();
    const mediaIds = new Set<string>();
    let sectionCount = 0;
    let mediaCount = 0;

    document.blocks.forEach((block, index) => {
      if (blockIds.has(block.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['blocks', index, 'id'],
          message: 'Block IDs must be unique',
        });
      }
      blockIds.add(block.id);

      if (block.type === 'section') {
        sectionCount += 1;
        return;
      }

      mediaCount += 1;
      if (mediaIds.has(block.mediaAssetId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['blocks', index, 'mediaAssetId'],
          message: 'A media asset may appear only once on the Photos page',
        });
      }
      mediaIds.add(block.mediaAssetId);
    });

    if (mediaCount > 500) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['blocks'],
        message: 'A Photos page can contain at most 500 media blocks',
      });
    }
    if (sectionCount > 100) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['blocks'],
        message: 'A Photos page can contain at most 100 section blocks',
      });
    }
  });

export type PhotosPageDocument = z.infer<typeof PhotosPageDocumentSchema>;

export const EmptyPhotosPageDocument: PhotosPageDocument = {
  schemaVersion: 1,
  blocks: [],
};

export const PhotosPageSchema = z
  .object({
    _id: z.literal('photos'),
    schemaVersion: z.literal(1),
    draftDocument: PhotosPageDocumentSchema,
    draftVersion: z.number().int().nonnegative(),
    publishedDocument: PhotosPageDocumentSchema.optional(),
    createdAt: z.date(),
    updatedAt: z.date(),
    publishedAt: z.date().optional(),
  })
  .strict();

export type PhotosPage = z.infer<typeof PhotosPageSchema>;

export type PhotosPublishIssue = {
  blockId: string;
  message: string;
};

/** Validation beyond structural editing rules that must hold before publish. */
export function validatePhotosDocumentForPublishing(
  document: PhotosPageDocument,
): PhotosPublishIssue[] {
  const issues: PhotosPublishIssue[] = [];

  document.blocks.forEach((block, index) => {
    if (block.type === 'section') {
      const following = document.blocks[index + 1];
      if (!following || following.type !== 'media') {
        issues.push({
          blockId: block.id,
          message: `${block.title ? `Section “${block.title}”` : 'This section'} has no photos. Move a photo below it, move the section before a photo, or remove the section.`,
        });
      }
      return;
    }

    if (!block.decorative && !block.altText) {
      issues.push({
        blockId: block.id,
        message: 'Add alt text to this photo, or mark it as decorative, before publishing.',
      });
    }
  });

  return issues;
}

export function hasUnpublishedPhotosChanges(page: PhotosPage): boolean {
  if (!page.publishedDocument) return page.draftDocument.blocks.length > 0;
  return JSON.stringify(page.draftDocument) !== JSON.stringify(page.publishedDocument);
}
