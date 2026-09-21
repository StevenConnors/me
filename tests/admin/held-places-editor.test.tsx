import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React, { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { HeldPlacesDocumentV2 } from '@/lib/journeys/schemas';

vi.mock('@tiptap/react', () => ({ useEditor: () => null, EditorContent: () => null }));

import { HeldPlacesEditor } from '@/components/editor/HeldPlacesEditor';

describe('Held Places image selection', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('adds selected photographs with their previews immediately and closes the picker', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ media: [{
        _id: 'media-1', originalFilename: 'Coast.jpg', width: 1600, height: 1200,
        status: 'ready', previewUrl: 'https://images.example/coast.jpg',
      }], nextCursor: null }),
    }));
    const onChange = vi.fn();
    const initial: HeldPlacesDocumentV2 = {
      schemaVersion: 2, template: 'held-places-v1', chapters: [{
        id: 'chapter-1', body: { type: 'doc', content: [] }, media: [],
      }],
    };
    function Harness() {
      const [document, setDocument] = useState(initial);
      return <HeldPlacesEditor document={document} journeyId="journey-1" media={[]} onChange={(next) => { setDocument(next); onChange(next); }} />;
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Choose photographs' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Coast.jpg' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add selected' }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ chapters: [expect.objectContaining({
      media: [{ mediaAssetId: 'media-1', decorative: true }],
    })] }));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Photograph library' })).not.toBeInTheDocument());
    expect(screen.getByRole('presentation')).toHaveAttribute('src', 'https://images.example/coast.jpg');
    expect(screen.queryByText('Preview unavailable')).not.toBeInTheDocument();
  });
});
