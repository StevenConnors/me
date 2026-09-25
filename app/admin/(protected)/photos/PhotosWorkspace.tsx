'use client';

import Image from 'next/image';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { PhotosPageView, type PhotoSection, type PublicPhoto } from '@/components/photos/PhotosPageView';
import { uploadMedia } from '@/lib/client/upload-media';
import {
  insertMedia,
  moveMedia,
  moveMediaBlocksTo,
  moveMediaTo,
  moveSectionGroup,
  removeMediaBlocks,
  removeSection,
  updateMediaBlock,
  updateSectionBlock,
} from '@/lib/photos/editor-commands';
import type { PhotosMediaBlock, PhotosPageDocument, PhotosSectionBlock } from '@/lib/photos/schemas';

import { MediaPicker, type PickerMedia } from './MediaPicker';
import styles from './photos-workspace.module.css';

type EditorMedia = {
  id: string;
  originalFilename: string;
  width: number;
  height: number;
  captureDate?: string;
  caption?: string;
  altText?: string;
  source?: string;
  resourceType: 'image' | 'video';
};

type EditorCanvasPhoto = PublicPhoto & {
  blockId: string;
  originalFilename: string;
  featuredOnHome?: boolean;
  unavailable?: boolean;
  loading?: boolean;
};

type SaveState = 'saved' | 'saving' | 'error' | 'conflict';
type UploadState = 'idle' | 'uploading' | 'error';
type DropTarget = { blockId: string; position: 'before' | 'after' };
const PHOTO_BATCH_SIZE = 24;
type PhotosApiPage = {
  draftDocument: PhotosPageDocument;
  draftVersion: number;
  hasUnpublishedChanges: boolean;
};
type DeletionPlanItem = {
  id: string;
  filename: string;
  classification: 'ready_to_delete' | 'publish_removal_first' | 'used_by_journey' | 'used_by_collection' | 'not_found';
  result?: 'deleted' | 'protected' | 'not_found' | 'failed';
};

function documentEqual(left: PhotosPageDocument, right: PhotosPageDocument) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function newBlockId() {
  return crypto.randomUUID().replace(/-/g, '');
}

function documentCanvas(
  document: PhotosPageDocument,
  mediaById: Map<string, EditorMedia>,
  loadedMediaIds: Set<string>,
): { photos: EditorCanvasPhoto[]; sections: PhotoSection[] } {
  const photos: EditorCanvasPhoto[] = [];
  const sections: PhotoSection[] = [];
  let activeSection: PhotoSection | undefined;

  for (const block of document.blocks) {
    if (block.type === 'section') {
      activeSection = {
        sectionBlockId: block.id,
        sectionBreak: {
          ...(block.title ? { title: block.title } : {}),
          ...(block.text ? { text: block.text } : {}),
        },
        photos: [],
      };
      sections.push(activeSection);
      continue;
    }

    const asset = mediaById.get(block.mediaAssetId);
    const photo: EditorCanvasPhoto = {
      id: block.mediaAssetId,
      blockId: block.id,
      source: asset?.source ?? '',
      alt: block.decorative ? '' : block.altText ?? block.caption ?? asset?.altText ?? asset?.caption ?? asset?.originalFilename ?? 'Unavailable media',
      width: asset?.width ?? 1,
      height: asset?.height ?? 1,
      originalFilename: asset?.originalFilename ?? `Unavailable upload (${block.mediaAssetId})`,
      featuredOnHome: block.featuredOnHome,
      ...(block.caption ? { caption: block.caption } : {}),
      ...(block.displayDate ? { captureDate: block.displayDate } : {}),
      kind: asset?.resourceType ?? 'image',
      ...(!loadedMediaIds.has(block.mediaAssetId) ? { loading: true } : !asset || !asset.source ? { unavailable: true } : {}),
    };
    const index = photos.length;
    photos.push(photo);
    if (!activeSection) {
      activeSection = { photos: [] };
      sections.push(activeSection);
    }
    activeSection.photos.push({ ...photo, index });
  }
  return { photos, sections };
}

function isMediaBlock(block: PhotosPageDocument['blocks'][number] | undefined): block is PhotosMediaBlock {
  return block?.type === 'media';
}

export function PhotosWorkspace({
  initialDocument,
  initialDraftVersion,
  initialHasUnpublishedChanges,
  media: initialMedia,
}: {
  initialDocument: PhotosPageDocument;
  initialDraftVersion: number;
  initialHasUnpublishedChanges: boolean;
  media: EditorMedia[];
}) {
  const router = useRouter();
  const documentRef = useRef(initialDocument);
  const lastSavedDocumentRef = useRef(initialDocument);
  const versionRef = useRef(initialDraftVersion);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savePromiseRef = useRef<Promise<boolean> | null>(null);
  const conflictRef = useRef(false);
  const [document, setDocument] = useState(initialDocument);
  const [history, setHistory] = useState<PhotosPageDocument[]>([initialDocument]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [media, setMedia] = useState(initialMedia);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [sectionDraft, setSectionDraft] = useState<{ blockId: string; title: string; text: string } | null>(null);
  const [selectedMediaBlockIds, setSelectedMediaBlockIds] = useState<Set<string>>(new Set());
  const [draggedMediaBlockId, setDraggedMediaBlockId] = useState<string | null>(null);
  const [pointerDragActive, setPointerDragActive] = useState(false);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [reorderMessage, setReorderMessage] = useState('');
  const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop');
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [hasUnpublishedChanges, setHasUnpublishedChanges] = useState(initialHasUnpublishedChanges);
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [uploadMessage, setUploadMessage] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [deletionPlan, setDeletionPlan] = useState<DeletionPlanItem[] | null>(null);
  const [deletionMessage, setDeletionMessage] = useState('');
  const [visiblePhotoCount, setVisiblePhotoCount] = useState(PHOTO_BATCH_SIZE);
  const [loadedMediaIds, setLoadedMediaIds] = useState(() => new Set([
    ...initialDocument.blocks.filter(isMediaBlock).slice(0, PHOTO_BATCH_SIZE).map((block) => block.mediaAssetId),
    ...initialMedia.map((asset) => asset.id),
  ]));
  const [mediaLoadState, setMediaLoadState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [mediaRetry, setMediaRetry] = useState(0);
  const [insertionTarget, setInsertionTarget] = useState<DropTarget | null>(null);
  const [publishError, setPublishError] = useState('');
  const [publishIssues, setPublishIssues] = useState<Array<{ blockId: string; message: string }>>([]);
  const [collapsedSectionIds, setCollapsedSectionIds] = useState<Set<string>>(new Set());
  const [moveTargetSectionId, setMoveTargetSectionId] = useState('');
  const canvasRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const dragPreviewRef = useRef<HTMLDivElement>(null);
  const pointerCleanupRef = useRef<(() => void) | null>(null);
  const suppressClickRef = useRef(false);
  const previousPositionsRef = useRef(new Map<string, DOMRect>());

  const mediaById = useMemo(() => new Map(media.map((asset) => [asset.id, asset])), [media]);
  const totalPhotoCount = document.blocks.filter(isMediaBlock).length;
  const featuredPhotoCount = document.blocks.filter((block) => block.type === 'media' && block.featuredOnHome).length;
  const visibleDocument = useMemo(() => {
    let count = 0;
    const end = document.blocks.findIndex((block) => block.type === 'media' && ++count > visiblePhotoCount);
    return end < 0 ? document : { ...document, blocks: document.blocks.slice(0, end) };
  }, [document, visiblePhotoCount]);
  const canvas = useMemo(() => documentCanvas(visibleDocument, mediaById, loadedMediaIds), [visibleDocument, mediaById, loadedMediaIds]);
  const displayedSections = useMemo(() => canvas.sections.map((section) => (
    section.sectionBlockId && collapsedSectionIds.has(section.sectionBlockId)
      ? { ...section, photos: [] }
      : section
  )), [canvas.sections, collapsedSectionIds]);
  const photos = canvas.photos;
  const activeBlock = document.blocks.find((block) => block.id === activeBlockId);
  const activeMediaBlock = isMediaBlock(activeBlock) ? activeBlock : null;
  const draggingSelectionCount = draggedMediaBlockId && selectedMediaBlockIds.has(draggedMediaBlockId)
    ? selectedMediaBlockIds.size
    : 1;

  const scheduleSave = useCallback(() => {
    if (conflictRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      void saveCurrent();
    }, 550);
  // saveCurrent uses refs, so its declaration stays stable for autosave.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveCurrent(): Promise<boolean> {
    if (conflictRef.current) return false;
    if (savePromiseRef.current) return savePromiseRef.current;
    if (documentEqual(documentRef.current, lastSavedDocumentRef.current)) return true;

    const snapshot = documentRef.current;
    const expectedVersion = versionRef.current;
    setSaveState('saving');
    const request = (async () => {
      try {
        const response = await fetch('/api/admin/photos-page/draft', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ expectedVersion, document: snapshot }),
        });
        const payload = await response.json();
        if (response.status === 409) {
          conflictRef.current = true;
          setSaveState('conflict');
          return false;
        }
        if (!response.ok) throw new Error(payload?.error?.message ?? 'Unable to save the Photos draft');
        const page = payload.page as PhotosApiPage;
        lastSavedDocumentRef.current = page.draftDocument;
        versionRef.current = page.draftVersion;
        setHasUnpublishedChanges(page.hasUnpublishedChanges);
        setSaveState('saved');
        return true;
      } catch (error) {
        console.error(error);
        setSaveState('error');
        return false;
      } finally {
        savePromiseRef.current = null;
        if (!conflictRef.current && !documentEqual(documentRef.current, lastSavedDocumentRef.current)) scheduleSave();
      }
    })();
    savePromiseRef.current = request;
    return request;
  }

  const applyDocument = useCallback((next: PhotosPageDocument) => {
    if (documentEqual(next, documentRef.current)) return;
    documentRef.current = next;
    setPublishError('');
    setPublishIssues([]);
    setDocument(next);
    setHistory((current) => {
      const nextHistory = [...current.slice(0, historyIndex + 1), next].slice(-80);
      setHistoryIndex(nextHistory.length - 1);
      return nextHistory;
    });
    scheduleSave();
  }, [historyIndex, scheduleSave]);

  function toggleMediaSelection(blockId: string) {
    setSelectedMediaBlockIds((current) => {
      const next = new Set(current);
      if (next.has(blockId)) next.delete(blockId);
      else next.add(blockId);
      return next;
    });
    setInsertionTarget(null);
  }

  function moveSelectionToSection() {
    if (!moveTargetSectionId || !selectedMediaBlockIds.size) return;
    const next = moveMediaBlocksTo(documentRef.current, selectedMediaBlockIds, moveTargetSectionId, 'after');
    if (documentEqual(next, documentRef.current)) return;
    applyDocument(next);
    setCollapsedSectionIds((current) => {
      if (!current.has(moveTargetSectionId)) return current;
      const expanded = new Set(current);
      expanded.delete(moveTargetSectionId);
      return expanded;
    });
    const section = next.blocks.find((block) => block.id === moveTargetSectionId);
    setReorderMessage(`${selectedMediaBlockIds.size} photo${selectedMediaBlockIds.size === 1 ? '' : 's'} moved to ${section?.type === 'section' && section.title ? section.title : 'the selected section'}.`);
  }

  function selectBlock(blockId: string | null) {
    setActiveBlockId(blockId);
    setInsertionTarget(null);
    const block = documentRef.current.blocks.find((item) => item.id === blockId);
    setSectionDraft(block?.type === 'section' ? { blockId: block.id, title: block.title ?? '', text: block.text ?? '' } : null);
  }

  function editSection(block: PhotosSectionBlock, field: 'title' | 'text', value: string) {
    setSectionDraft((current) => ({
      ...(current?.blockId === block.id ? current : { blockId: block.id, title: block.title ?? '', text: block.text ?? '' }),
      [field]: value,
    }));
    applyDocument(updateSectionBlock(documentRef.current, block.id, { [field]: value.trim() || undefined }));
  }

  function revealBlock(blockId: string, nextDocument = documentRef.current, openEditor = false) {
    const index = nextDocument.blocks.findIndex((block) => block.id === blockId);
    const count = nextDocument.blocks.slice(0, index + 1).filter(isMediaBlock).length;
    setVisiblePhotoCount((current) => Math.max(current, count));
    const section = nextDocument.blocks.slice(0, index + 1).reverse().find((block) => block.type === 'section');
    if (section?.type === 'section') {
      setCollapsedSectionIds((current) => {
        if (!current.has(section.id)) return current;
        const next = new Set(current);
        next.delete(section.id);
        return next;
      });
    }
    if (openEditor) selectBlock(blockId);
    else setInsertionTarget(null);
    requestAnimationFrame(() => Array.from(canvasRef.current?.querySelectorAll<HTMLElement>('[data-block-id]') ?? []).find((element) => element.dataset.blockId === blockId)?.scrollIntoView?.({ block: 'center', behavior: 'smooth' }));
  }

  function clearDragState() {
    setDraggedMediaBlockId(null);
    setDropTarget(null);
    setPointerDragActive(false);
  }

  function positionWithinMedia(element: HTMLElement, x: number) {
    const bounds = element.getBoundingClientRect();
    return x < bounds.left + bounds.width / 2 ? 'before' as const : 'after' as const;
  }

  function startPointerDrag(event: React.PointerEvent<HTMLButtonElement>, blockId: string) {
    if (event.button !== 0) return;
    event.preventDefault();
    pointerCleanupRef.current?.();
    const handle = event.currentTarget;
    handle.focus();
    handle.setPointerCapture?.(event.pointerId);
    const origin = { x: event.clientX, y: event.clientY };
    let point = origin;
    let active = false;
    let frame = 0;
    let target: DropTarget | null = null;
    const draggedIds = selectedMediaBlockIds.has(blockId) && selectedMediaBlockIds.size > 1
      ? new Set(selectedMediaBlockIds)
      : new Set([blockId]);

    const update = () => {
      if (!active) return;
      if (dragPreviewRef.current) dragPreviewRef.current.style.transform = `translate3d(${point.x + 16}px, ${point.y + 16}px, 0)`;
      const edge = 100;
      const scroll = point.y < edge ? -Math.ceil((edge - point.y) / 5) : point.y > window.innerHeight - edge ? Math.ceil((point.y - window.innerHeight + edge) / 5) : 0;
      if (scroll) window.scrollBy(0, scroll);
      let hit = window.document.elementFromPoint(point.x, point.y)?.closest<HTMLElement>('[data-block-id]') ?? null;
      // The gaps are valid drop areas too. Choose the closest visible block.
      if (!hit && canvasRef.current) {
        const canvasBounds = canvasRef.current.getBoundingClientRect();
        if (point.x >= canvasBounds.left && point.x <= canvasBounds.right && point.y >= canvasBounds.top && point.y <= canvasBounds.bottom) {
          let distance = Infinity;
          canvasRef.current.querySelectorAll<HTMLElement>('[data-block-id]').forEach((candidate) => {
            if (candidate.dataset.blockId && draggedIds.has(candidate.dataset.blockId)) return;
            const rect = candidate.getBoundingClientRect();
            const nextDistance = Math.hypot(Math.max(rect.left - point.x, 0, point.x - rect.right), Math.max(rect.top - point.y, 0, point.y - rect.bottom));
            if (nextDistance < distance) { distance = nextDistance; hit = candidate; }
          });
        }
      }
      const targetId = hit?.dataset.blockId;
      target = hit && targetId && !draggedIds.has(targetId) ? {
        blockId: targetId,
        position: hit.dataset.blockType === 'section' ? 'after' : positionWithinMedia(hit, point.x),
      } : null;
      if (target) setCurrentDropTarget(target); else setDropTarget(null);
      frame = requestAnimationFrame(update);
    };
    const move = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== event.pointerId) return;
      point = { x: moveEvent.clientX, y: moveEvent.clientY };
      if (!active && Math.hypot(point.x - origin.x, point.y - origin.y) >= 5) {
        active = true;
        setDraggedMediaBlockId(blockId);
        setPointerDragActive(true);
        frame = requestAnimationFrame(update);
      }
    };
    const cleanup = () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', escape);
      if (handle.hasPointerCapture?.(event.pointerId)) handle.releasePointerCapture(event.pointerId);
      pointerCleanupRef.current = null;
    };
    const finish = (upEvent: PointerEvent) => {
      if (upEvent.pointerId !== event.pointerId) return;
      if (active && target) {
        const next = draggedIds.size > 1
          ? moveMediaBlocksTo(documentRef.current, draggedIds, target.blockId, target.position)
          : moveMediaTo(documentRef.current, blockId, target.blockId, target.position);
        if (!documentEqual(next, documentRef.current)) {
          applyDocument(next);
          setReorderMessage(draggedIds.size > 1 ? `${draggedIds.size} photos moved together.` : `${mediaFilename(blockId)} moved.`);
        }
      }
      if (active) {
        suppressClickRef.current = true;
        setTimeout(() => { suppressClickRef.current = false; }, 0);
      }
      cleanup();
      clearDragState();
    };
    const cancel = () => { cleanup(); clearDragState(); };
    const escape = (keyEvent: KeyboardEvent) => { if (keyEvent.key === 'Escape') cancel(); };
    pointerCleanupRef.current = cleanup;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', escape);
  }

  function mediaFilename(blockId: string) {
    const block = documentRef.current.blocks.find((candidate) => candidate.id === blockId);
    return block?.type === 'media' ? mediaById.get(block.mediaAssetId)?.originalFilename ?? 'Photo' : 'Photo';
  }

  function startMediaDrag(event: React.DragEvent<HTMLButtonElement>, blockId: string) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', blockId);
    setDraggedMediaBlockId(blockId);
    setDropTarget(null);
  }

  function draggedBlockId(event: React.DragEvent<HTMLElement>) {
    return event.dataTransfer.getData('text/plain') || draggedMediaBlockId;
  }

  function draggedBlockIds(primaryBlockId: string) {
    return selectedMediaBlockIds.has(primaryBlockId) && selectedMediaBlockIds.size > 1
      ? new Set(selectedMediaBlockIds)
      : new Set([primaryBlockId]);
  }

  function setCurrentDropTarget(next: DropTarget) {
    setDropTarget((current) => current?.blockId === next.blockId && current.position === next.position ? current : next);
  }

  function dragOverMedia(event: React.DragEvent<HTMLElement>, targetBlockId: string) {
    const dragged = draggedBlockId(event);
    if (!dragged || draggedBlockIds(dragged).has(targetBlockId)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const position = positionWithinMedia(event.currentTarget, event.clientX);
    setCurrentDropTarget({ blockId: targetBlockId, position });
  }

  function dragOverSection(event: React.DragEvent<HTMLElement>, targetBlockId: string) {
    const dragged = draggedBlockId(event);
    if (!dragged || draggedBlockIds(dragged).has(targetBlockId)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setCurrentDropTarget({ blockId: targetBlockId, position: 'after' });
  }

  function completeMediaDrop(event: React.DragEvent<HTMLElement>, targetBlockId: string, position: 'before' | 'after') {
    event.preventDefault();
    const dragged = draggedBlockId(event);
    if (dragged && !draggedBlockIds(dragged).has(targetBlockId)) {
      const draggedIds = draggedBlockIds(dragged);
      const next = draggedIds.size > 1
        ? moveMediaBlocksTo(documentRef.current, draggedIds, targetBlockId, position)
        : moveMediaTo(documentRef.current, dragged, targetBlockId, position);
      const moved = !documentEqual(next, documentRef.current);
      applyDocument(next);
      setActiveBlockId(dragged);
      if (moved) setReorderMessage(draggedIds.size > 1 ? `${draggedIds.size} photos moved together.` : `${mediaFilename(dragged)} moved.`);
    }
    clearDragState();
  }

  function dropOnMedia(event: React.DragEvent<HTMLElement>, targetBlockId: string) {
    completeMediaDrop(event, targetBlockId, positionWithinMedia(event.currentTarget, event.clientX));
  }

  function reorderWithKeyboard(event: React.KeyboardEvent<HTMLButtonElement>, blockId: string) {
    const direction = event.key === 'ArrowUp' || event.key === 'ArrowLeft'
      ? 'before'
      : event.key === 'ArrowDown' || event.key === 'ArrowRight'
        ? 'after'
        : null;
    if (!direction) return;
    event.preventDefault();
    const next = moveMedia(documentRef.current, blockId, direction);
    if (next === documentRef.current) return;
    applyDocument(next);
    setActiveBlockId(blockId);
    setReorderMessage(`${mediaFilename(blockId)} moved ${direction === 'before' ? 'earlier' : 'later'}.`);
  }

  function undo() {
    if (historyIndex <= 0) return;
    const next = history[historyIndex - 1];
    documentRef.current = next;
    setDocument(next);
    setSectionDraft(null);
    setHistoryIndex(historyIndex - 1);
    scheduleSave();
  }

  function redo() {
    if (historyIndex >= history.length - 1) return;
    const next = history[historyIndex + 1];
    documentRef.current = next;
    setDocument(next);
    setSectionDraft(null);
    setHistoryIndex(historyIndex + 1);
    scheduleSave();
  }

  function addSection() {
    const section: PhotosSectionBlock = { id: newBlockId(), type: 'section' };
    const current = documentRef.current;
    const targetIndex = insertionTarget ? current.blocks.findIndex((block) => block.id === insertionTarget.blockId) : -1;
    const index = targetIndex < 0 ? 0 : targetIndex + (insertionTarget?.position === 'after' ? 1 : 0);
    const next = {
      ...current,
      blocks: [...current.blocks.slice(0, index), section, ...current.blocks.slice(index)],
    };
    applyDocument(next);
    revealBlock(section.id, next, true);
  }

  async function uploadBatch(files: File[]) {
    setUploadState('uploading');
    const failures: string[] = [];
    const uploaded: EditorMedia[] = [];
    let insertionFailed = false;
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      setUploadMessage(`Uploading ${index + 1} of ${files.length}: ${file.name}`);
      try {
        const result = await uploadMedia(file);
        uploaded.push({
          id: result._id,
          originalFilename: result.originalFilename,
          width: result.width,
          height: result.height,
          resourceType: result.resourceType,
        });
      } catch (error) {
        console.error(error);
        failures.push(file.name);
      }
    }
    if (uploaded.length) {
      setMedia((current) => [...current, ...uploaded]);
      const next = insertMedia(documentRef.current, activeBlockId, uploaded, newBlockId);
      applyDocument(next);
      const inserted = next.blocks.find((block) => block.type === 'media' && uploaded.some((asset) => asset.id === block.mediaAssetId));
      if (inserted) revealBlock(inserted.id, next);
      if (await flushDraft()) router.refresh();
      else {
        insertionFailed = true;
        setUploadState('error');
        setUploadMessage('The upload completed, but its page insertion could not be saved. Use Add media to insert the upload again.');
      }
    }
    if (failures.length) {
      setUploadState('error');
      setUploadMessage(`${failures.length} upload${failures.length === 1 ? '' : 's'} failed: ${failures.join(', ')}`);
    } else if (!insertionFailed) {
      setUploadState('idle');
      setUploadMessage('');
    }
  }

  async function insertPickedMedia(items: PickerMedia[]) {
    const selected = items.map((item) => ({
      id: item._id,
      originalFilename: item.originalFilename,
      width: item.width,
      height: item.height,
      captureDate: item.captureDate,
      caption: item.caption,
      altText: item.altText,
      resourceType: item.resourceType,
    }));
    setMedia((current) => [...current, ...selected.filter((asset) => !current.some((known) => known.id === asset.id))]);
    const next = insertMedia(documentRef.current, activeBlockId, selected, newBlockId);
    applyDocument(next);
    const inserted = next.blocks.find((block) => block.type === 'media' && selected.some((asset) => asset.id === block.mediaAssetId));
    if (inserted) revealBlock(inserted.id, next);
    setPickerOpen(false);
    if (await flushDraft()) router.refresh();
  }

  async function flushDraft() {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    while (!documentEqual(documentRef.current, lastSavedDocumentRef.current)) {
      if (!await saveCurrent()) return false;
    }
    return true;
  }

  async function requestDeletionPlan() {
    const mediaIds = documentRef.current.blocks.flatMap((block) => (
      block.type === 'media' && selectedMediaBlockIds.has(block.id) ? [block.mediaAssetId] : []
    ));
    if (!mediaIds.length) return;
    setDeletionMessage('');
    try {
      const response = await fetch('/api/admin/media/bulk-delete/plan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mediaIds }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? 'Unable to check these uploads');
      setDeletionPlan(payload.plan as DeletionPlanItem[]);
    } catch (error) {
      console.error(error);
      setDeletionMessage(error instanceof Error ? error.message : 'Unable to check these uploads');
    }
  }

  async function permanentlyDeletePlannedUploads() {
    const readyIds = deletionPlan?.filter((item) => item.classification === 'ready_to_delete').map((item) => item.id) ?? [];
    if (!readyIds.length) return;
    const readySet = new Set(readyIds);
    const blocksToRemove = documentRef.current.blocks.flatMap((block) => block.type === 'media' && readySet.has(block.mediaAssetId) ? [block.id] : []);
    applyDocument(removeMediaBlocks(documentRef.current, blocksToRemove));
    if (!await flushDraft()) {
      setDeletionMessage('The draft removal could not be saved, so no uploads were deleted.');
      return;
    }
    try {
      const response = await fetch('/api/admin/media/bulk-delete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mediaIds: readyIds }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? 'Unable to delete these uploads');
      const results = payload.results as DeletionPlanItem[];
      const deleted = new Set(results.filter((item) => item.result === 'deleted').map((item) => item.id));
      setMedia((current) => current.filter((item) => !deleted.has(item.id)));
      setSelectedMediaBlockIds((current) => new Set(Array.from(current).filter((id) => !blocksToRemove.includes(id))));
      setDeletionPlan(results);
      const failed = results.filter((item) => item.result === 'failed').length;
      setDeletionMessage(failed ? `${failed} upload${failed === 1 ? '' : 's'} could not be deleted and can be retried.` : 'Eligible uploads were permanently deleted.');
      router.refresh();
    } catch (error) {
      console.error(error);
      setDeletionMessage(error instanceof Error ? error.message : 'Unable to delete these uploads');
    }
  }

  async function publish() {
    setPublishError('');
    setPublishIssues([]);
    if (!await flushDraft()) return;
    setSaveState('saving');
    try {
      const response = await fetch('/api/admin/photos-page/publish', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedVersion: versionRef.current }),
      });
      const payload = await response.json();
      if (response.status === 409) { conflictRef.current = true; setSaveState('conflict'); return; }
      if (!response.ok) {
        setPublishError(payload?.error?.message ?? 'Unable to publish the Photos page');
        if (Array.isArray(payload?.error?.details)) {
          setPublishIssues(payload.error.details.filter((issue: { blockId?: unknown; message?: unknown }) => typeof issue.blockId === 'string' && typeof issue.message === 'string'));
        }
        setSaveState('saved');
        return;
      }
      const page = payload.page as PhotosApiPage;
      versionRef.current = page.draftVersion;
      lastSavedDocumentRef.current = page.draftDocument;
      setHasUnpublishedChanges(page.hasUnpublishedChanges);
      setSaveState('saved');
      router.refresh();
    } catch (error) {
      setPublishError(error instanceof Error ? error.message : 'Unable to publish the Photos page');
      setSaveState('saved');
    }
  }

  async function discard() {
    if (!window.confirm('Discard all unpublished Photos page changes? This restores the last published layout.')) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSaveState('saving');
    try {
      const response = await fetch('/api/admin/photos-page/discard', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedVersion: versionRef.current }),
      });
      const payload = await response.json();
      if (response.status === 409) { conflictRef.current = true; setSaveState('conflict'); return; }
      if (!response.ok) throw new Error(payload?.error?.message ?? 'Unable to discard the Photos draft');
      const page = payload.page as PhotosApiPage;
      replaceLocalDocument(page);
    } catch (error) { console.error(error); setSaveState('error'); }
  }

  function replaceLocalDocument(page: PhotosApiPage, resolvedMediaIds?: string[]) {
    conflictRef.current = false;
    documentRef.current = page.draftDocument;
    lastSavedDocumentRef.current = page.draftDocument;
    versionRef.current = page.draftVersion;
    setDocument(page.draftDocument);
    setHistory([page.draftDocument]);
    setHistoryIndex(0);
    setSelectedMediaBlockIds(new Set());
    setActiveBlockId(null);
    setSectionDraft(null);
    setPublishError('');
    setPublishIssues([]);
    setInsertionTarget(null);
    setCollapsedSectionIds(new Set());
    setMoveTargetSectionId('');
    setVisiblePhotoCount(PHOTO_BATCH_SIZE);
    // Discard/replacement responses contain no previews. Keep the cache and let
    // the batch loader resolve any newly visible assets in the restored layout.
    if (resolvedMediaIds) setLoadedMediaIds(new Set(resolvedMediaIds));
    setHasUnpublishedChanges(page.hasUnpublishedChanges);
    setSaveState('saved');
  }

  async function reloadServerDraft() {
    setSaveState('saving');
    try {
      const response = await fetch('/api/admin/photos-page');
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? 'Unable to reload the server draft');
      setMedia(Object.values((payload.mediaById ?? {}) as Record<string, EditorMedia>));
      const page = payload.page as PhotosApiPage;
      replaceLocalDocument(page, page.draftDocument.blocks.filter(isMediaBlock).slice(0, PHOTO_BATCH_SIZE).map((block) => block.mediaAssetId));
    } catch (error) { console.error(error); setSaveState('error'); }
  }

  async function replaceServerDraft() {
    const mine = documentRef.current;
    setSaveState('saving');
    try {
      const serverResponse = await fetch('/api/admin/photos-page');
      const serverPayload = await serverResponse.json();
      if (!serverResponse.ok) throw new Error(serverPayload?.error?.message ?? 'Unable to reload the server draft');
      const serverPage = serverPayload.page as PhotosApiPage;
      const replace = await fetch('/api/admin/photos-page/draft', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedVersion: serverPage.draftVersion, document: mine }),
      });
      const replacePayload = await replace.json();
      if (!replace.ok) throw new Error(replacePayload?.error?.message ?? 'Unable to replace the server draft');
      replaceLocalDocument(replacePayload.page as PhotosApiPage);
    } catch (error) { console.error(error); conflictRef.current = true; setSaveState('conflict'); }
  }

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (documentEqual(documentRef.current, lastSavedDocumentRef.current)) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  // A successful upload refreshes this Server Component with the signed
  // preview URL. Merge those server DTOs without disturbing a local draft.
  useEffect(() => {
    setMedia((current) => [...current.filter((asset) => !initialMedia.some((fresh) => fresh.id === asset.id)), ...initialMedia]);
  }, [initialMedia]);

  useEffect(() => {
    const ids = visibleDocument.blocks.filter(isMediaBlock).map((block) => block.mediaAssetId).filter((id) => !loadedMediaIds.has(id)).slice(0, PHOTO_BATCH_SIZE);
    if (!ids.length) { setMediaLoadState('idle'); return; }
    const controller = new AbortController();
    setMediaLoadState('loading');
    const params = new URLSearchParams(ids.map((id) => ['id', id]));
    void fetch(`/api/admin/photos-page/media?${params}`, { signal: controller.signal }).then(async (response) => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? 'Unable to load more photos');
      if (controller.signal.aborted) return;
      const fresh = Object.values(payload.mediaById ?? {}) as EditorMedia[];
      setMedia((current) => [...current.filter((asset) => !ids.includes(asset.id)), ...fresh]);
      setLoadedMediaIds((current) => new Set([...Array.from(current), ...ids]));
      setMediaLoadState('idle');
    }).catch((error) => {
      if (error.name !== 'AbortError' && !controller.signal.aborted) setMediaLoadState('error');
    });
    return () => controller.abort();
  }, [visibleDocument, loadedMediaIds, mediaRetry]);

  useEffect(() => {
    if (visiblePhotoCount >= totalPhotoCount || mediaLoadState !== 'idle' || !sentinelRef.current || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setVisiblePhotoCount((current) => Math.min(current + PHOTO_BATCH_SIZE, totalPhotoCount));
    }, { rootMargin: '600px 0px' });
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [visiblePhotoCount, totalPhotoCount, mediaLoadState]);

  useEffect(() => () => pointerCleanupRef.current?.(), []);

  useLayoutEffect(() => {
    const positions = new Map<string, DOMRect>();
    canvasRef.current?.querySelectorAll<HTMLElement>('[data-block-id]').forEach((element) => {
      const id = element.dataset.blockId!;
      const rect = element.getBoundingClientRect();
      const previous = previousPositionsRef.current.get(id);
      positions.set(id, rect);
      if (previous && element.animate && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        const x = previous.left - rect.left;
        const y = previous.top - rect.top;
        if (x || y) element.animate([{ transform: `translate(${x}px, ${y}px)` }, { transform: 'translate(0, 0)' }], { duration: 180, easing: 'ease-out' });
      }
    });
    previousPositionsRef.current = positions;
  }, [document, viewport]);

  function renderTile(photo: PublicPhoto & { index: number }) {
    const editorPhoto = photo as EditorCanvasPhoto & { index: number };
    const selected = selectedMediaBlockIds.has(editorPhoto.blockId);
    const currentDrop = dropTarget?.blockId === editorPhoto.blockId ? dropTarget.position : undefined;
    const dragging = draggedMediaBlockId === editorPhoto.blockId
      || Boolean(draggedMediaBlockId && selectedMediaBlockIds.has(draggedMediaBlockId) && selected);
    return <article className={styles.editorTile} data-block-id={editorPhoto.blockId} data-block-type="media" data-dragging={dragging || undefined} data-drop-position={currentDrop} data-selected={selected || undefined} key={editorPhoto.blockId} onDragOver={(event) => dragOverMedia(event, editorPhoto.blockId)} onDrop={(event) => dropOnMedia(event, editorPhoto.blockId)}>
      <button aria-label={`Select ${editorPhoto.kind === 'video' ? 'video' : 'photo'} ${editorPhoto.originalFilename}`} aria-pressed={selected} className={styles.editorImageButton} onClick={() => { if (!suppressClickRef.current) toggleMediaSelection(editorPhoto.blockId); }} type="button">
        {editorPhoto.loading ? <span className={styles.loadingPhoto}>Loading photo…</span> : editorPhoto.unavailable ? <span className={styles.unavailable}>This upload is unavailable. Remove it before publishing.</span> : <Image draggable={false} loading="lazy" alt={editorPhoto.alt} height={editorPhoto.height} sizes="(max-width: 700px) 50vw, (max-width: 1100px) 33vw, 25vw" src={editorPhoto.source} width={editorPhoto.width} />}
      </button>
      <label className={styles.selectTile}><input checked={selected} onChange={() => toggleMediaSelection(editorPhoto.blockId)} type="checkbox" /><span className="sr-only">Select {editorPhoto.originalFilename}</span></label>
      {editorPhoto.featuredOnHome ? <span className={styles.homeBadge}>Homepage</span> : null}
      {editorPhoto.kind === 'video' ? <span className={styles.videoBadge}>Video</span> : null}
      <button aria-label={`Edit ${editorPhoto.kind === 'video' ? 'video' : 'photo'} ${editorPhoto.originalFilename}`} className={styles.editTile} onClick={() => { if (!suppressClickRef.current) selectBlock(editorPhoto.blockId); }} type="button">Edit</button>
      <button aria-label={`Reorder ${editorPhoto.originalFilename}; drag or use arrow keys`} className={styles.dragHandle} draggable onPointerDown={(event) => startPointerDrag(event, editorPhoto.blockId)} onDragEnd={clearDragState} onDragStart={(event) => startMediaDrag(event, editorPhoto.blockId)} onKeyDown={(event) => reorderWithKeyboard(event, editorPhoto.blockId)} title="Drag or use arrow keys to reorder" type="button">↕</button>
      {(['before', 'after'] as const).map((position) => <button aria-label={`Insert point ${position} ${editorPhoto.originalFilename}`} aria-pressed={insertionTarget?.blockId === editorPhoto.blockId && insertionTarget.position === position} className={styles.insertionPoint} data-position={position} key={position} onClick={() => { setInsertionTarget({ blockId: editorPhoto.blockId, position }); setActiveBlockId(null); }} title={`Choose this gap, then Insert section`} type="button"><span>+</span></button>)}
    </article>;
  }

  function renderSection(section: PhotoSection) {
    const block = section.sectionBlockId ? document.blocks.find((item) => item.id === section.sectionBlockId) : undefined;
    if (!block || block.type !== 'section') return <>{section.sectionBreak?.title ? <h2>{section.sectionBreak.title}</h2> : null}{section.sectionBreak?.text ? <p>{section.sectionBreak.text}</p> : null}</>;
    const selected = activeBlockId === block.id;
    const collapsed = collapsedSectionIds.has(block.id);
    const sectionPhotoCount = canvas.sections.find((candidate) => candidate.sectionBlockId === block.id)?.photos.length ?? section.photos.length;
    const sectionName = block.title || 'untitled section';
    const currentDrop = dropTarget?.blockId === block.id ? dropTarget.position : undefined;
    return <div className={styles.sectionEditor} data-block-id={block.id} data-block-type="section" data-collapsed={collapsed || undefined} data-drag-active={draggedMediaBlockId ? true : undefined} data-drop-position={currentDrop} data-selected={selected || undefined} onDragOver={(event) => dragOverSection(event, block.id)} onDrop={(event) => completeMediaDrop(event, block.id, 'after')}>
      {selected ? <>
        <label>Section heading<input autoFocus maxLength={500} onChange={(event) => editSection(block, 'title', event.target.value)} placeholder="Optional heading" value={sectionDraft?.blockId === block.id ? sectionDraft.title : block.title ?? ''} /></label>
        <label>Section note<textarea maxLength={2_000} onChange={(event) => editSection(block, 'text', event.target.value)} placeholder="Optional note" value={sectionDraft?.blockId === block.id ? sectionDraft.text : block.text ?? ''} /></label>
        <span className={styles.inlineActions}><button className={styles.doneButton} onClick={() => selectBlock(null)} type="button">Done</button><button onClick={() => applyDocument(moveSectionGroup(documentRef.current, block.id, 'before'))} type="button">Move earlier</button><button onClick={() => applyDocument(moveSectionGroup(documentRef.current, block.id, 'after'))} type="button">Move later</button><button onClick={() => { applyDocument(removeSection(documentRef.current, block.id)); setActiveBlockId(null); }} type="button">Remove section break</button></span>
      </> : <div className={styles.sectionHeader}>
        <button className={styles.sectionSelect} onClick={() => selectBlock(block.id)} type="button">{block.title ? <h2>{block.title}</h2> : <span className={styles.blankSection}>Blank section break</span>}{block.text ? <p>{block.text}</p> : null}</button>
        <button aria-expanded={!collapsed} aria-label={`${collapsed ? 'Expand' : 'Collapse'} section ${sectionName}`} className={styles.foldSection} onClick={() => setCollapsedSectionIds((current) => {
          const next = new Set(current);
          if (next.has(block.id)) next.delete(block.id); else next.add(block.id);
          return next;
        })} type="button">{collapsed ? `▸ Show ${sectionPhotoCount}` : `▾ Hide ${sectionPhotoCount}`}</button>
      </div>}
    </div>;
  }

  return <div className={styles.workspace}>
    <div className={styles.toolbar}>
      <div className={styles.toolbarMain}>
        <span className={styles.viewportButtons} aria-label="Preview viewport"><button aria-pressed={viewport === 'desktop'} onClick={() => setViewport('desktop')} type="button">Desktop</button><button aria-pressed={viewport === 'mobile'} onClick={() => setViewport('mobile')} type="button">Mobile</button></span>
        <span className={styles.historyButtons}><button disabled={historyIndex === 0} onClick={undo} type="button">Undo</button><button disabled={historyIndex === history.length - 1} onClick={redo} type="button">Redo</button></span>
        <span aria-live="polite" className={styles.saveState} data-state={saveState}>{saveState === 'saving' ? 'Saving…' : saveState === 'conflict' ? 'Draft changed elsewhere' : saveState === 'error' ? 'Could not save' : hasUnpublishedChanges ? 'Unpublished changes' : 'Published'}</span>
        <span className={styles.primaryActions}>
          <button disabled={uploadState === 'uploading'} onClick={() => setPickerOpen(true)} type="button">{uploadState === 'uploading' ? 'Uploading…' : 'Add media'}</button><button onClick={addSection} type="button">Insert section at top</button><button disabled={saveState === 'saving' || saveState === 'conflict' || !hasUnpublishedChanges} onClick={() => void publish()} type="button">Publish</button><button disabled={saveState === 'saving' || !hasUnpublishedChanges} onClick={() => void discard()} type="button">Discard</button>
        </span>
      </div>
      <div className={styles.toolbarContext}>
        <p className={styles.homeSelectionHint}>Homepage: {featuredPhotoCount}/8 selected. Edit a photo to include it. Picks follow the Photos order when published; until then, the first eight photos appear.</p>
        {insertionTarget ? <div className={styles.insertionNotice} role="status">Section will be inserted {insertionTarget.position} {mediaFilename(insertionTarget.blockId)}.<button onClick={addSection} type="button">Insert section here</button><button onClick={() => setInsertionTarget(null)} type="button">Cancel</button></div> : selectedMediaBlockIds.size ? <>
          <strong>{selectedMediaBlockIds.size} selected</strong>
          <span>Drag any selected photo to move the selection together.</span>
          <span className={styles.moveToSection}><label htmlFor="photos-move-to-section">Move to</label><select id="photos-move-to-section" onChange={(event) => setMoveTargetSectionId(event.target.value)} value={moveTargetSectionId}><option value="">Choose a section…</option>{document.blocks.filter((block): block is PhotosSectionBlock => block.type === 'section').map((section, index) => <option key={section.id} value={section.id}>{section.title || `Untitled section ${index + 1}`}</option>)}</select><button disabled={!moveTargetSectionId} onClick={moveSelectionToSection} type="button">Move</button></span>
          <span className={styles.bulkActions}><button onClick={() => { applyDocument(removeMediaBlocks(documentRef.current, selectedMediaBlockIds)); setSelectedMediaBlockIds(new Set()); setActiveBlockId(null); }} type="button">Remove selected from page</button><button onClick={() => void requestDeletionPlan()} type="button">Delete selected uploads…</button><button onClick={() => { setSelectedMediaBlockIds(new Set()); setMoveTargetSectionId(''); }} type="button">Clear selection</button></span>
        </> : <p className={styles.editorHint}>Click photos to select them. Press Edit to change photo details. Use + at a photo edge to insert a section there; “Insert section at top” starts one at the beginning.</p>}
      </div>
    </div>
    {publishError ? <aside className={styles.publishError} role="alert"><p>{publishError}</p>{publishIssues.length ? <ul>{publishIssues.map((issue, index) => <li key={`${issue.blockId}-${index}`}><button onClick={() => revealBlock(issue.blockId, documentRef.current, true)} type="button">Edit: {issue.message}</button></li>)}</ul> : null}</aside> : null}
    {uploadMessage ? <p className={styles.uploadStatus} data-error={uploadState === 'error' || undefined}>{uploadMessage}</p> : null}
    {saveState === 'conflict' ? <aside className={styles.conflict} role="alert">Another editor saved this page. Your local layout is preserved. <button onClick={() => void reloadServerDraft()} type="button">Reload server draft</button><button onClick={() => void replaceServerDraft()} type="button">Replace server draft with mine</button></aside> : null}
    <div className={styles.authoringShell} data-viewport={viewport}><div className={styles.canvasFrame} ref={canvasRef}>{canvas.sections.length ? <PhotosPageView intro="A collection of moments, arranged in the order they belong." onOpen={() => undefined} photos={photos} renderSection={renderSection} renderTile={renderTile} sectionGroups={displayedSections} /> : <section className={styles.emptyCanvas}><h2>Photos, soon.</h2><p>Add uploads or insert a section to start shaping this page.</p></section>}
      {(visiblePhotoCount < totalPhotoCount || mediaLoadState !== 'idle') ? <div className={styles.canvasLoader} ref={sentinelRef}>
        <p aria-live="polite">{mediaLoadState === 'loading' ? 'Loading photos…' : mediaLoadState === 'error' ? 'More photos could not be loaded.' : `${Math.min(visiblePhotoCount, totalPhotoCount)} of ${totalPhotoCount} photos loaded`}</p>
        <button disabled={mediaLoadState === 'loading'} onClick={() => mediaLoadState === 'error' ? setMediaRetry((current) => current + 1) : setVisiblePhotoCount((current) => Math.min(current + PHOTO_BATCH_SIZE, totalPhotoCount))} type="button">{mediaLoadState === 'error' ? 'Retry loading photos' : 'Load more photos'}</button>
      </div> : null}
    </div></div>
    {pointerDragActive ? <div aria-hidden="true" className={styles.dragPreview} ref={dragPreviewRef}>{draggingSelectionCount > 1 ? `${draggingSelectionCount} selected photos` : mediaFilename(draggedMediaBlockId ?? '')}<span>Drop to move{draggingSelectionCount > 1 ? ' together' : ''}</span></div> : null}
    {activeMediaBlock ? <aside className={styles.inspector} aria-label="Selected photo inspector">
      <header className={styles.inspectorHeader}>
        <div><p className={styles.inspectorEyebrow}>Selected media</p><strong>{mediaById.get(activeMediaBlock.mediaAssetId)?.originalFilename ?? 'Unavailable upload'}</strong></div>
        <button aria-label="Close selected media inspector" className={styles.closeInspector} onClick={() => setActiveBlockId(null)} type="button">×</button>
      </header>
      <label>Display date<input max="9999-12-31" onChange={(event) => applyDocument(updateMediaBlock(documentRef.current, activeMediaBlock.id, { displayDate: event.target.value || undefined }))} type="date" value={activeMediaBlock.displayDate ?? ''} /></label>
      <label>Caption<input maxLength={2_000} onChange={(event) => applyDocument(updateMediaBlock(documentRef.current, activeMediaBlock.id, { caption: event.target.value.trim() || undefined }))} placeholder="Optional text beneath the photo" value={activeMediaBlock.caption ?? ''} /></label>
      <label>Alt text<input aria-invalid={!activeMediaBlock.decorative && !activeMediaBlock.altText || undefined} maxLength={1_000} onChange={(event) => applyDocument(updateMediaBlock(documentRef.current, activeMediaBlock.id, { altText: event.target.value.trim() || undefined }))} placeholder="Describe the image" value={activeMediaBlock.altText ?? ''} /></label>
      <label className={styles.decorative}><input checked={Boolean(activeMediaBlock.featuredOnHome)} disabled={!activeMediaBlock.featuredOnHome && featuredPhotoCount >= 8} onChange={(event) => applyDocument(updateMediaBlock(documentRef.current, activeMediaBlock.id, { featuredOnHome: event.target.checked }))} type="checkbox" /> Show on homepage</label>
      <label className={styles.decorative}><input checked={activeMediaBlock.decorative} onChange={(event) => applyDocument(updateMediaBlock(documentRef.current, activeMediaBlock.id, { decorative: event.target.checked }))} type="checkbox" /> Decorative image</label>
      {!activeMediaBlock.decorative && !activeMediaBlock.altText ? <p className={styles.fieldError}>Alt text is required before publishing.</p> : null}
      <span className={styles.inspectorActions}><button onClick={() => applyDocument(moveMedia(documentRef.current, activeMediaBlock.id, 'before'))} type="button">Move earlier</button><button onClick={() => applyDocument(moveMedia(documentRef.current, activeMediaBlock.id, 'after'))} type="button">Move later</button><button onClick={() => { applyDocument(removeMediaBlocks(documentRef.current, [activeMediaBlock.id])); setActiveBlockId(null); }} type="button">Remove from page</button></span>
    </aside> : null}
    <p aria-live="polite" className="sr-only">{reorderMessage || (selectedMediaBlockIds.size ? `${selectedMediaBlockIds.size} photos selected` : '')}</p>
    <MediaPicker onClose={() => setPickerOpen(false)} onInsert={(items) => void insertPickedMedia(items)} onUpload={(files) => { setPickerOpen(false); void uploadBatch(files); }} open={pickerOpen} placedMediaIds={new Set(document.blocks.flatMap((block) => block.type === 'media' ? [block.mediaAssetId] : []))} />
    {deletionPlan ? <div aria-label="Confirm permanent upload deletion" aria-modal="true" className={styles.dialogBackdrop} role="dialog"><section className={styles.deleteDialog}>
      <header><div><p className={styles.inspectorEyebrow}>Permanent deletion</p><h2>Delete uploads?</h2></div><button aria-label="Close deletion confirmation" onClick={() => setDeletionPlan(null)} type="button">×</button></header>
      <p>Ready to delete: {deletionPlan.filter((item) => item.classification === 'ready_to_delete').length}. This permanently removes the Cloudinary originals and cannot be undone.</p>
      <ul>{deletionPlan.map((item) => <li key={item.id}><strong>{item.filename}</strong> — {item.result ?? item.classification.replace(/_/g, ' ')}</li>)}</ul>
      <p className={styles.deleteWarning}>Published page media must first be removed and published. Journey media remains protected.</p>
      {deletionMessage ? <p className={styles.fieldError}>{deletionMessage}</p> : null}
      <footer><button onClick={() => setDeletionPlan(null)} type="button">Cancel</button><button disabled={!deletionPlan.some((item) => item.classification === 'ready_to_delete')} onClick={() => void permanentlyDeletePlannedUploads()} type="button">Permanently delete ready uploads</button></footer>
    </section></div> : null}
  </div>;
}
