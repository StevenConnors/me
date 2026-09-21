import type {
  PhotosMediaBlock,
  PhotosPageDocument,
  PhotosSectionBlock,
} from '@/lib/photos/schemas';

export type EditorMediaSeed = {
  id: string;
  caption?: string;
  altText?: string;
  captureDate?: string;
};

function copy(document: PhotosPageDocument, blocks: PhotosPageDocument['blocks']): PhotosPageDocument {
  return { ...document, blocks };
}

function indexOfBlock(document: PhotosPageDocument, blockId: string | null): number {
  return blockId ? document.blocks.findIndex((block) => block.id === blockId) : -1;
}

/** Deterministic insertion: selected media before it; selected section after its group; else end. */
export function insertionIndex(document: PhotosPageDocument, activeBlockId: string | null): number {
  const activeIndex = indexOfBlock(document, activeBlockId);
  if (activeIndex < 0) return document.blocks.length;
  if (document.blocks[activeIndex].type === 'media') return activeIndex;
  let index = activeIndex + 1;
  while (index < document.blocks.length && document.blocks[index].type === 'media') index += 1;
  return index;
}

export function insertSection(
  document: PhotosPageDocument,
  activeBlockId: string | null,
  block: PhotosSectionBlock,
): PhotosPageDocument {
  const index = insertionIndex(document, activeBlockId);
  return copy(document, [...document.blocks.slice(0, index), block, ...document.blocks.slice(index)]);
}

export function insertMedia(
  document: PhotosPageDocument,
  activeBlockId: string | null,
  media: EditorMediaSeed[],
  createBlockId: () => string,
): PhotosPageDocument {
  const index = insertionIndex(document, activeBlockId);
  const blocks: PhotosMediaBlock[] = media.map((asset) => {
    const altText = asset.altText?.trim();
    const caption = asset.caption?.trim();
    return {
      id: createBlockId(),
      type: 'media',
      mediaAssetId: asset.id,
      decorative: !altText,
      ...(caption ? { caption } : {}),
      ...(altText ? { altText } : {}),
      ...(asset.captureDate ? { displayDate: asset.captureDate } : {}),
    };
  });
  return copy(document, [...document.blocks.slice(0, index), ...blocks, ...document.blocks.slice(index)]);
}

export function updateMediaBlock(
  document: PhotosPageDocument,
  blockId: string,
  patch: Partial<Omit<PhotosMediaBlock, 'id' | 'type' | 'mediaAssetId'>>,
): PhotosPageDocument {
  return copy(document, document.blocks.map((block) => block.type === 'media' && block.id === blockId
    ? { ...block, ...patch }
    : block,
  ));
}

export function updateSectionBlock(
  document: PhotosPageDocument,
  blockId: string,
  patch: Partial<Omit<PhotosSectionBlock, 'id' | 'type'>>,
): PhotosPageDocument {
  return copy(document, document.blocks.map((block) => block.type === 'section' && block.id === blockId
    ? { ...block, ...patch }
    : block,
  ));
}

export function removeMediaBlocks(document: PhotosPageDocument, blockIds: Iterable<string>): PhotosPageDocument {
  const removed = new Set(blockIds);
  return copy(document, document.blocks.filter((block) => !removed.has(block.id)));
}

/** Removing a section only removes the break, merging its following media into the previous run. */
export function removeSection(document: PhotosPageDocument, sectionId: string): PhotosPageDocument {
  return copy(document, document.blocks.filter((block) => block.id !== sectionId));
}

export function moveMedia(document: PhotosPageDocument, blockId: string, direction: 'before' | 'after'): PhotosPageDocument {
  const from = indexOfBlock(document, blockId);
  if (from < 0 || document.blocks[from].type !== 'media') return document;
  const to = direction === 'before' ? from - 1 : from + 1;
  if (to < 0 || to >= document.blocks.length) return document;
  const blocks = [...document.blocks];
  const [block] = blocks.splice(from, 1);
  blocks.splice(to, 0, block);
  return copy(document, blocks);
}

/** Move one media block relative to any other block, including a section boundary. */
export function moveMediaTo(
  document: PhotosPageDocument,
  blockId: string,
  targetBlockId: string,
  position: 'before' | 'after',
): PhotosPageDocument {
  const from = indexOfBlock(document, blockId);
  const target = indexOfBlock(document, targetBlockId);
  if (from < 0 || target < 0 || blockId === targetBlockId || document.blocks[from].type !== 'media') return document;

  const blocks = [...document.blocks];
  const [block] = blocks.splice(from, 1);
  const targetAfterRemoval = blocks.findIndex((candidate) => candidate.id === targetBlockId);
  blocks.splice(targetAfterRemoval + (position === 'after' ? 1 : 0), 0, block);
  return copy(document, blocks);
}

function groupRanges(document: PhotosPageDocument): Array<{ sectionId?: string; start: number; end: number }> {
  const starts = document.blocks.flatMap((block, index) => block.type === 'section' ? [index] : []);
  const ranges: Array<{ sectionId?: string; start: number; end: number }> = [];
  if (!starts.length || starts[0] > 0) ranges.push({ start: 0, end: starts[0] ?? document.blocks.length });
  starts.forEach((start, index) => {
    const section = document.blocks[start] as PhotosSectionBlock;
    ranges.push({ sectionId: section.id, start, end: starts[index + 1] ?? document.blocks.length });
  });
  return ranges;
}

/** Move an entire section and all following media as one group. */
export function moveSectionGroup(
  document: PhotosPageDocument,
  sectionId: string,
  direction: 'before' | 'after',
): PhotosPageDocument {
  const groups = groupRanges(document);
  const groupIndex = groups.findIndex((group) => group.sectionId === sectionId);
  const swapWith = direction === 'before' ? groupIndex - 1 : groupIndex + 1;
  if (groupIndex < 0 || swapWith < 0 || swapWith >= groups.length) return document;

  const reordered = [...groups];
  [reordered[groupIndex], reordered[swapWith]] = [reordered[swapWith], reordered[groupIndex]];
  return copy(document, reordered.flatMap((group) => document.blocks.slice(group.start, group.end)));
}
