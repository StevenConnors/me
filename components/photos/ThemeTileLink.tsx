'use client';

import React, { type ReactNode } from 'react';

/** Counts a theme-wall open the same way the gallery does before the viewer loads. */
export function ThemeTileLink({ photoId, label, children }: { photoId: string; label?: string; children: ReactNode }) {
  return <a
    aria-label={label}
    href={`/photos?photo=${encodeURIComponent(photoId)}`}
    onClick={() => {
      try {
        navigator.sendBeacon('/api/photos/open', new Blob([JSON.stringify({ photoId })], { type: 'application/json' }));
      } catch {
        // Photo-open analytics must never block navigation.
      }
    }}
  >{children}</a>;
}
