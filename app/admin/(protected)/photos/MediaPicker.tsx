'use client';

import React from 'react';
import { UnifiedMediaPicker, type UnifiedMedia } from '@/components/media/UnifiedMediaPicker';

export type PickerMedia = UnifiedMedia;

export function MediaPicker(props: {
  open: boolean;
  placedMediaIds: Set<string>;
  onClose: () => void;
  onInsert: (media: PickerMedia[]) => void;
  onUpload: (files: File[]) => void;
}) {
  if (!props.open) return null;
  return <UnifiedMediaPicker onClose={props.onClose} onInsert={props.onInsert} onUpload={props.onUpload} placedMediaIds={props.placedMediaIds} variant="dialog" />;
}
