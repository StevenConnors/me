import { z } from 'zod';

import { MediaIdSchema } from '@/lib/media/schemas';
import { PhotosBlockIdSchema } from '@/lib/photos/schemas';

const SourceIdSchema = z.string().trim().min(1).max(200);
const optionalText = (maximum: number) => z.string().trim().min(1).max(maximum).optional();

export const ApplePhotosSyncPhotoSchema = z
  .object({
    sourcePhotoId: SourceIdSchema,
    /** Changes when the photo is edited in Photos.app; a new value means a new upload. */
    sourceVersion: SourceIdSchema,
    mediaAssetId: MediaIdSchema,
    cover: z.boolean().default(false),
    caption: optionalText(2_000),
    altText: optionalText(1_000),
  })
  .strict();

export const ApplePhotosSyncAlbumSchema = z
  .object({
    sourceAlbumId: SourceIdSchema,
    title: z.string().trim().min(1).max(500),
    photos: z.array(ApplePhotosSyncPhotoSchema).max(500),
  })
  .strict();

export const ApplePhotosSyncRequestSchema = z
  .object({ albums: z.array(ApplePhotosSyncAlbumSchema).max(100) })
  .strict()
  .superRefine((request, context) => {
    const albumIds = new Set<string>();
    request.albums.forEach((album, index) => {
      if (albumIds.has(album.sourceAlbumId)) {
        context.addIssue({ code: 'custom', path: ['albums', index, 'sourceAlbumId'], message: 'Album IDs must be unique' });
      }
      albumIds.add(album.sourceAlbumId);
    });
  });

export type ApplePhotosSyncRequest = z.output<typeof ApplePhotosSyncRequestSchema>;

export const ApplePhotosImportedAlbumSchema = z
  .object({ sourceAlbumId: SourceIdSchema, sectionBlockId: PhotosBlockIdSchema })
  .strict();

export const ApplePhotosImportedPhotoSchema = z
  .object({
    sourcePhotoId: SourceIdSchema,
    sourceVersion: SourceIdSchema,
    mediaAssetId: MediaIdSchema,
    /** The block this import placed; kept after the photo leaves the folder so a lost removal can be retried. */
    blockId: PhotosBlockIdSchema.optional(),
    /** Whether Photos.app had the cover tag at the last sync, so a cover is only applied when the tag is added. */
    cover: z.boolean().optional(),
  })
  .strict();

export type ApplePhotosImportedAlbum = z.infer<typeof ApplePhotosImportedAlbumSchema>;
export type ApplePhotosImportedPhoto = z.infer<typeof ApplePhotosImportedPhotoSchema>;

/** Maps Photos.app identifiers to the media assets and draft blocks they created. */
export const ApplePhotosImportStateSchema = z
  .object({
    _id: z.literal('apple-photos'),
    schemaVersion: z.literal(1),
    albums: z.array(ApplePhotosImportedAlbumSchema),
    photos: z.array(ApplePhotosImportedPhotoSchema),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .strict();

export type ApplePhotosImportState = z.infer<typeof ApplePhotosImportStateSchema>;
