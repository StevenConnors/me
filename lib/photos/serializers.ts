import 'server-only';

import {
  hasUnpublishedPhotosChanges,
  type PhotosPage,
  type PhotosPageDocument,
} from '@/lib/photos/schemas';

export type SerializedPhotosPageDocument = PhotosPageDocument;

export type SerializedPhotosPage = {
  id: 'photos';
  schemaVersion: 1;
  draftDocument: SerializedPhotosPageDocument;
  draftVersion: number;
  publishedDocument?: SerializedPhotosPageDocument;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  hasUnpublishedChanges: boolean;
};

/** Converts only plain values suitable for Route Handler and RSC boundaries. */
export function serializePhotosPage(page: PhotosPage): SerializedPhotosPage {
  return {
    id: page._id,
    schemaVersion: page.schemaVersion,
    draftDocument: page.draftDocument,
    draftVersion: page.draftVersion,
    ...(page.publishedDocument ? { publishedDocument: page.publishedDocument } : {}),
    createdAt: page.createdAt.toISOString(),
    updatedAt: page.updatedAt.toISOString(),
    ...(page.publishedAt ? { publishedAt: page.publishedAt.toISOString() } : {}),
    hasUnpublishedChanges: hasUnpublishedPhotosChanges(page),
  };
}
