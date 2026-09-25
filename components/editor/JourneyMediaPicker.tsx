'use client';

import React from 'react';
import type { EditorMedia } from './JourneyVisualEditor';
import { UnifiedMediaPicker, type UnifiedMedia } from '@/components/media/UnifiedMediaPicker';

export function JourneyMediaPicker({
  placedMediaIds,
  onInsert,
  onClose,
}: {
  placedMediaIds: Set<string>;
  onInsert: (media: EditorMedia[]) => void;
  onClose: () => void;
}) {
  return <UnifiedMediaPicker
    onClose={onClose}
    onInsert={(media: UnifiedMedia[]) => onInsert(media.map((asset) => ({
      id: asset._id,
      resourceType: asset.resourceType,
      title: asset.title || asset.originalFilename,
      width: asset.width,
      height: asset.height,
      altText: asset.altText,
      previewUrl: asset.previewUrl,
      playbackUrl: asset.playbackUrl,
    })))}
    placedMediaIds={placedMediaIds}
    variant="region"
  />;
}
