import { describe, expect, it } from 'vitest';

import {
  insertMedia,
  insertSection,
  moveMedia,
  moveSectionGroup,
  removeMediaBlocks,
  removeSection,
} from '@/lib/photos/editor-commands';
import type { PhotosPageDocument } from '@/lib/photos/schemas';

const media = (id: string, mediaAssetId = id) => ({
  id,
  type: 'media' as const,
  mediaAssetId,
  decorative: true,
});
const section = (id: string) => ({ id, type: 'section' as const });
const document = (blocks: PhotosPageDocument['blocks']): PhotosPageDocument => ({ schemaVersion: 1, blocks });

describe('Photos editor commands', () => {
  it('uses deterministic insertion points for a selected photo, section, and empty selection', () => {
    const base = document([media('one'), section('section'), media('two')]);
    expect(insertSection(base, 'one', section('before-one')).blocks.map((block) => block.id)).toEqual(['before-one', 'one', 'section', 'two']);
    expect(insertSection(base, 'section', section('after-group')).blocks.map((block) => block.id)).toEqual(['one', 'section', 'two', 'after-group']);
    expect(insertMedia(base, null, [{ id: 'three' }], () => 'new-media').blocks.map((block) => block.id)).toEqual(['one', 'section', 'two', 'new-media']);
  });

  it('moves section groups as a unit and merges media when the break is removed', () => {
    const base = document([media('opening'), section('a'), media('a-one'), media('a-two'), section('b'), media('b-one')]);
    const moved = moveSectionGroup(base, 'b', 'before');
    expect(moved.blocks.map((block) => block.id)).toEqual(['opening', 'b', 'b-one', 'a', 'a-one', 'a-two']);
    expect(removeSection(base, 'a').blocks.map((block) => block.id)).toEqual(['opening', 'a-one', 'a-two', 'b', 'b-one']);
  });

  it('moves media across section boundaries and removes a multi-selection', () => {
    const base = document([media('one'), section('section'), media('two'), media('three')]);
    expect(moveMedia(base, 'one', 'after').blocks.map((block) => block.id)).toEqual(['section', 'one', 'two', 'three']);
    expect(removeMediaBlocks(base, ['one', 'three']).blocks.map((block) => block.id)).toEqual(['section', 'two']);
  });
});
