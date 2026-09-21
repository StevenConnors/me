import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock('next/image', () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => <img {...props} />,
}));

import { PhotosWorkspace } from '@/app/admin/(protected)/photos/PhotosWorkspace';

describe('PhotosWorkspace sections', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
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

    fireEvent.click(screen.getByRole('button', { name: 'Insert section' }));

    const heading = screen.getByRole('textbox', { name: 'Section heading' });
    expect(heading).toHaveFocus();
    fireEvent.change(heading, { target: { value: 'Field notes' } });
    expect(heading).toHaveValue('Field notes');
    expect(screen.getByRole('button', { name: 'Remove section break' })).toBeTruthy();
  });

  it('keeps a newly appended section visible after existing media', () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'trailing-section-block' });
    render(
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

    fireEvent.click(screen.getByRole('button', { name: 'Insert section' }));

    expect(screen.getByRole('button', { name: 'Edit photo existing.jpg' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Section heading' })).toHaveFocus();
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
