import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock('next/image', () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => <img {...props} />,
}));

import { PhotosWorkspace } from '@/app/admin/(protected)/photos/PhotosWorkspace';
import type { PhotosPageDocument } from '@/lib/photos/schemas';

function photoFixtures(count: number) {
  const media = Array.from({ length: count }, (_, index) => ({
    id: `media-${index}`,
    originalFilename: `photo-${index}.jpg`,
    width: 1200,
    height: 800,
    source: `https://images.test/photo-${index}.jpg`,
    resourceType: 'image' as const,
  }));
  const document: PhotosPageDocument = {
    schemaVersion: 1,
    blocks: media.map((asset, index) => ({ id: `block-${index}`, type: 'media', mediaAssetId: asset.id, decorative: true })),
  };
  return { media, document };
}

describe('PhotosWorkspace sections', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('inserts a section at the chosen gap and returns to its header with Done', () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'gap-section' });
    const { document, media } = photoFixtures(3);
    render(<PhotosWorkspace initialDocument={document} initialDraftVersion={0} initialHasUnpublishedChanges={false} media={media} />);

    fireEvent.click(screen.getByRole('button', { name: 'Insert point after photo-0.jpg' }));
    fireEvent.click(screen.getByRole('button', { name: 'Insert section here' }));
    const heading = screen.getByRole('textbox', { name: 'Section heading' });
    fireEvent.change(heading, { target: { value: 'A new ' } });
    expect(heading).toHaveValue('A new ');
    fireEvent.change(heading, { target: { value: 'A new section' } });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(screen.queryByRole('textbox', { name: 'Section heading' })).toBeNull();
    expect(within(screen.getByRole('region', { name: 'Photographs' })).getByRole('button', { name: 'Edit photo photo-0.jpg' })).toBeTruthy();
    const section = screen.getByRole('region', { name: 'A new section' });
    expect(within(section).getAllByRole('button', { name: /Edit photo/ }).map((button) => button.getAttribute('aria-label'))).toEqual(['Edit photo photo-1.jpg', 'Edit photo photo-2.jpg']);
    fireEvent.click(screen.getByRole('button', { name: 'A new section' }));
    expect(screen.getByRole('textbox', { name: 'Section heading' })).toHaveValue('A new section');
  });

  it('loads only the next batch when scrolling reaches the canvas sentinel', async () => {
    const { document, media } = photoFixtures(60);
    let intersect: IntersectionObserverCallback | undefined;
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback: IntersectionObserverCallback) { intersect = callback; }
      observe() {}
      disconnect() {}
    });
    const fetchMock = vi.fn(async (input: string) => {
      const ids = new URL(input, 'http://localhost').searchParams.getAll('id');
      return { ok: true, json: async () => ({ mediaById: Object.fromEntries(media.filter((asset) => ids.includes(asset.id)).map((asset) => [asset.id, asset])) }) };
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<PhotosWorkspace initialDocument={document} initialDraftVersion={0} initialHasUnpublishedChanges={false} media={media.slice(0, 24)} />);
    expect(screen.getAllByRole('button', { name: /Edit photo/ })).toHaveLength(24);
    expect(fetchMock).not.toHaveBeenCalled();

    // Trigger the same boundary as native IntersectionObserver, using a UI event
    // so React flushes the newly visible batch synchronously.
    const loadButton = screen.getByRole('button', { name: 'Load more photos' });
    loadButton.addEventListener('focus', () => intersect?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
    fireEvent.focus(loadButton);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit photo photo-47.jpg' })).toBeTruthy());
    expect(screen.getAllByRole('button', { name: /Edit photo/ })).toHaveLength(48);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(new URL(fetchMock.mock.calls[0][0], 'http://localhost').searchParams.getAll('id')).toEqual(media.slice(24, 48).map((asset) => asset.id));
    expect(screen.queryByRole('button', { name: 'Edit photo photo-48.jpg' })).toBeNull();
  });

  it('keeps the loaded photos and lets a failed batch be retried', async () => {
    const { document, media } = photoFixtures(25);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: { message: 'Temporary failure' } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ mediaById: { [media[24].id]: media[24] } }) });
    vi.stubGlobal('fetch', fetchMock);
    render(<PhotosWorkspace initialDocument={document} initialDraftVersion={0} initialHasUnpublishedChanges={false} media={media.slice(0, 24)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Load more photos' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Retry loading photos' }));
    await screen.findByRole('button', { name: 'Edit photo photo-24.jpg' });
    expect(screen.getAllByRole('button', { name: /Edit photo/ })).toHaveLength(25);
    expect(screen.queryByText(/This upload is unavailable/)).toBeNull();
  });

  it('shows publish issues and opens the affected photo for correction', async () => {
    const { document, media } = photoFixtures(1);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ error: { message: 'Fix this photo before publishing.', details: [{ blockId: 'block-0', message: 'Add alt text or mark this photo decorative.' }] } }),
    }));
    render(<PhotosWorkspace initialDocument={document} initialDraftVersion={0} initialHasUnpublishedChanges media={media} />);
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Fix this photo before publishing.');
    fireEvent.click(screen.getByRole('button', { name: 'Edit: Add alt text or mark this photo decorative.' }));
    expect(screen.getByRole('complementary', { name: 'Selected photo inspector' })).toHaveTextContent('photo-0.jpg');
    expect(screen.getByRole('button', { name: 'Publish' })).not.toBeDisabled();
  });

  it('renders a section inserted into an empty draft so it can be edited and removed', () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'new-section-block' });
    render(
      <PhotosWorkspace
        initialDocument={{ schemaVersion: 1, blocks: [] }}
        initialDraftVersion={0}
        initialHasUnpublishedChanges={false}
        media={[]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Insert section at top' }));

    const heading = screen.getByRole('textbox', { name: 'Section heading' });
    expect(heading).toHaveFocus();
    fireEvent.change(heading, { target: { value: 'Field notes' } });
    expect(heading).toHaveValue('Field notes');
    expect(screen.getByRole('button', { name: 'Remove section break' })).toBeTruthy();
  });

  it('inserts a new toolbar section at the top of existing media', () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'trailing-section-block' });
    const { container } = render(
      <PhotosWorkspace
        initialDocument={{
          schemaVersion: 1,
          blocks: [{ id: 'existing-media-block', type: 'media', mediaAssetId: 'existing-media', decorative: true }],
        }}
        initialDraftVersion={0}
        initialHasUnpublishedChanges={false}
        media={[{
          id: 'existing-media',
          originalFilename: 'existing.jpg',
          width: 1200,
          height: 800,
          source: 'https://images.test/existing.jpg',
          resourceType: 'image',
        }]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Insert section at top' }));

    expect(screen.getByRole('button', { name: 'Edit photo existing.jpg' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Section heading' })).toHaveFocus();
    expect(Array.from(container.querySelectorAll<HTMLElement>('[data-block-id]'), (element) => element.dataset.blockId)).toEqual([
      'trailingsectionblock',
      'existing-media-block',
    ]);
  });

  it('keeps multi-selection actions in the toolbar and drags selected photos together', () => {
    const transferred = new Map<string, string>();
    const dataTransfer = {
      dropEffect: 'none',
      effectAllowed: 'none',
      getData: (type: string) => transferred.get(type) ?? '',
      setData: (type: string, value: string) => transferred.set(type, value),
    };
    render(
      <PhotosWorkspace
        initialDocument={{
          schemaVersion: 1,
          blocks: [
            { id: 'first-section', type: 'section', title: 'First' },
            { id: 'one-block', type: 'media', mediaAssetId: 'one', decorative: true },
            { id: 'two-block', type: 'media', mediaAssetId: 'two', decorative: true },
            { id: 'second-section', type: 'section', title: 'Second' },
            { id: 'three-block', type: 'media', mediaAssetId: 'three', decorative: true },
          ],
        }}
        initialDraftVersion={0}
        initialHasUnpublishedChanges={false}
        media={[
          { id: 'one', originalFilename: 'one.jpg', width: 1200, height: 800, source: 'https://images.test/one.jpg', resourceType: 'image' },
          { id: 'two', originalFilename: 'two.jpg', width: 1200, height: 800, source: 'https://images.test/two.jpg', resourceType: 'image' },
          { id: 'three', originalFilename: 'three.jpg', width: 1200, height: 800, source: 'https://images.test/three.jpg', resourceType: 'image' },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select one.jpg' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select two.jpg' }));
    expect(screen.getByText('Drag any selected photo to move the selection together.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove selected from page' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete selected uploads…' })).toBeTruthy();

    fireEvent.dragStart(screen.getByRole('button', { name: 'Reorder one.jpg; drag or use arrow keys' }), { dataTransfer });
    fireEvent.dragOver(screen.getByRole('button', { name: 'Second' }), { dataTransfer });
    fireEvent.drop(screen.getByRole('button', { name: 'Second' }), { dataTransfer });

    expect(within(screen.getByRole('region', { name: 'Second' })).getAllByRole('button', { name: /Edit photo/ }).map((button) => button.getAttribute('aria-label'))).toEqual([
      'Edit photo one.jpg',
      'Edit photo two.jpg',
      'Edit photo three.jpg',
    ]);
    expect(screen.getByText('2 photos moved together.')).toBeTruthy();
  });

  it('selects photos from the image and moves the selection to a chosen section', () => {
    render(
      <PhotosWorkspace
        initialDocument={{
          schemaVersion: 1,
          blocks: [
            { id: 'first-section', type: 'section', title: 'First' },
            { id: 'one-block', type: 'media', mediaAssetId: 'one', decorative: true },
            { id: 'two-block', type: 'media', mediaAssetId: 'two', decorative: true },
            { id: 'second-section', type: 'section', title: 'Second' },
            { id: 'three-block', type: 'media', mediaAssetId: 'three', decorative: true },
          ],
        }}
        initialDraftVersion={0}
        initialHasUnpublishedChanges={false}
        media={[
          { id: 'one', originalFilename: 'one.jpg', width: 1200, height: 800, source: 'https://images.test/one.jpg', resourceType: 'image' },
          { id: 'two', originalFilename: 'two.jpg', width: 1200, height: 800, source: 'https://images.test/two.jpg', resourceType: 'image' },
          { id: 'three', originalFilename: 'three.jpg', width: 1200, height: 800, source: 'https://images.test/three.jpg', resourceType: 'image' },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Select photo one.jpg' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select photo two.jpg' }));
    expect(screen.queryByRole('complementary', { name: 'Selected photo inspector' })).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Select one.jpg' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Select two.jpg' })).toBeChecked();

    fireEvent.change(screen.getByLabelText('Move to'), { target: { value: 'second-section' } });
    fireEvent.click(screen.getByRole('button', { name: 'Move' }));

    expect(within(screen.getByRole('region', { name: 'First' })).queryByRole('button', { name: /Edit photo/ })).toBeNull();
    expect(within(screen.getByRole('region', { name: 'Second' })).getAllByRole('button', { name: /Edit photo/ }).map((button) => button.getAttribute('aria-label'))).toEqual([
      'Edit photo one.jpg',
      'Edit photo two.jpg',
      'Edit photo three.jpg',
    ]);
    expect(screen.getByText('2 photos moved to Second.')).toBeTruthy();
  });

  it('opens photo details only from the Edit button', () => {
    const { document, media } = photoFixtures(1);
    render(<PhotosWorkspace initialDocument={document} initialDraftVersion={0} initialHasUnpublishedChanges={false} media={media} />);

    fireEvent.click(screen.getByRole('button', { name: 'Select photo photo-0.jpg' }));
    expect(screen.queryByRole('complementary', { name: 'Selected photo inspector' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Reorder photo-0.jpg; drag or use arrow keys' }));
    expect(screen.queryByRole('complementary', { name: 'Selected photo inspector' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Edit photo photo-0.jpg' }));
    expect(screen.getByRole('complementary', { name: 'Selected photo inspector' })).toHaveTextContent('photo-0.jpg');
  });

  it('folds a section and its photographs without changing other sections', () => {
    render(
      <PhotosWorkspace
        initialDocument={{
          schemaVersion: 1,
          blocks: [
            { id: 'first-section', type: 'section', title: 'First' },
            { id: 'one-block', type: 'media', mediaAssetId: 'one', decorative: true },
            { id: 'two-block', type: 'media', mediaAssetId: 'two', decorative: true },
            { id: 'second-section', type: 'section', title: 'Second' },
            { id: 'three-block', type: 'media', mediaAssetId: 'three', decorative: true },
          ],
        }}
        initialDraftVersion={0}
        initialHasUnpublishedChanges={false}
        media={[
          { id: 'one', originalFilename: 'one.jpg', width: 1200, height: 800, source: 'https://images.test/one.jpg', resourceType: 'image' },
          { id: 'two', originalFilename: 'two.jpg', width: 1200, height: 800, source: 'https://images.test/two.jpg', resourceType: 'image' },
          { id: 'three', originalFilename: 'three.jpg', width: 1200, height: 800, source: 'https://images.test/three.jpg', resourceType: 'image' },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Collapse section First' }));
    expect(within(screen.getByRole('region', { name: 'First' })).queryByRole('button', { name: /Edit photo/ })).toBeNull();
    expect(within(screen.getByRole('region', { name: 'Second' })).getByRole('button', { name: 'Edit photo three.jpg' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Expand section First' }));
    expect(within(screen.getByRole('region', { name: 'First' })).getAllByRole('button', { name: /Edit photo/ })).toHaveLength(2);
  });

  it('does not expose a filename as alt text for a decorative media block', () => {
    const { container } = render(
      <PhotosWorkspace
        initialDocument={{
          schemaVersion: 1,
          blocks: [{ id: 'decorative-block', type: 'media', mediaAssetId: 'decorative-media', decorative: true }],
        }}
        initialDraftVersion={0}
        initialHasUnpublishedChanges={false}
        media={[{
          id: 'decorative-media',
          originalFilename: 'private-filename.jpg',
          width: 1200,
          height: 800,
          altText: 'Stored asset description',
          source: 'https://images.test/decorative.jpg',
          resourceType: 'image',
        }]}
      />,
    );

    expect(container.querySelector('img')?.getAttribute('alt')).toBe('');
  });

  it('closes the selected media inspector without changing the page', () => {
    render(
      <PhotosWorkspace
        initialDocument={{
          schemaVersion: 1,
          blocks: [{ id: 'media-block', type: 'media', mediaAssetId: 'media', decorative: true }],
        }}
        initialDraftVersion={0}
        initialHasUnpublishedChanges={false}
        media={[{
          id: 'media',
          originalFilename: 'panam.jpg',
          width: 1200,
          height: 800,
          source: 'https://images.test/panam.jpg',
          resourceType: 'image',
        }]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit photo panam.jpg' }));
    expect(screen.getByRole('complementary', { name: 'Selected photo inspector' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Close selected media inspector' }));
    expect(screen.queryByRole('complementary', { name: 'Selected photo inspector' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Edit photo panam.jpg' })).toBeTruthy();
  });

  it('drags an existing photo into another section', () => {
    const transferred = new Map<string, string>();
    const dataTransfer = {
      dropEffect: 'none',
      effectAllowed: 'none',
      getData: (type: string) => transferred.get(type) ?? '',
      setData: (type: string, value: string) => transferred.set(type, value),
    };
    render(
      <PhotosWorkspace
        initialDocument={{
          schemaVersion: 1,
          blocks: [
            { id: 'first-section', type: 'section', title: 'First' },
            { id: 'first-photo', type: 'media', mediaAssetId: 'one', decorative: true },
            { id: 'second-section', type: 'section', title: 'Second' },
            { id: 'second-photo', type: 'media', mediaAssetId: 'two', decorative: true },
          ],
        }}
        initialDraftVersion={0}
        initialHasUnpublishedChanges={false}
        media={[
          { id: 'one', originalFilename: 'one.jpg', width: 1200, height: 800, source: 'https://images.test/one.jpg', resourceType: 'image' },
          { id: 'two', originalFilename: 'two.jpg', width: 1200, height: 800, source: 'https://images.test/two.jpg', resourceType: 'image' },
        ]}
      />,
    );

    const handle = screen.getByRole('button', { name: 'Reorder one.jpg; drag or use arrow keys' });
    const secondHeader = screen.getByRole('button', { name: 'Second' });
    fireEvent.dragStart(handle, { dataTransfer });
    fireEvent.dragOver(secondHeader, { clientY: 1, dataTransfer });
    fireEvent.drop(secondHeader, { clientY: 1, dataTransfer });

    expect(within(screen.getByRole('region', { name: 'First' })).queryByRole('button', { name: 'Edit photo one.jpg' })).toBeNull();
    expect(within(screen.getByRole('region', { name: 'Second' })).getAllByRole('button', { name: /Edit photo/ }).map((button) => button.getAttribute('aria-label'))).toEqual([
      'Edit photo one.jpg',
      'Edit photo two.jpg',
    ]);
    expect(screen.getByText('one.jpg moved.')).toBeTruthy();

    fireEvent.keyDown(screen.getByRole('button', { name: 'Reorder one.jpg; drag or use arrow keys' }), { key: 'ArrowDown' });
    expect(within(screen.getByRole('region', { name: 'Second' })).getAllByRole('button', { name: /Edit photo/ }).map((button) => button.getAttribute('aria-label'))).toEqual([
      'Edit photo two.jpg',
      'Edit photo one.jpg',
    ]);
    expect(screen.getByText('one.jpg moved later.')).toBeTruthy();
  });
});
