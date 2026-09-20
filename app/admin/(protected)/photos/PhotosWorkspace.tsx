'use client';

import Image from 'next/image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { PhotosPageView, type PhotoSection, type PublicPhoto } from '@/components/photos/PhotosPageView';
import { uploadMedia } from '@/lib/client/upload-media';
import {
  insertMedia,
  insertSection,
  moveMedia,
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
  unavailable?: boolean;
};

type SaveState = 'saved' | 'saving' | 'error' | 'conflict';
type UploadState = 'idle' | 'uploading' | 'error';
type PhotosApiPage = {
  draftDocument: PhotosPageDocument;
  draftVersion: number;
  hasUnpublishedChanges: boolean;
};
type DeletionPlanItem = {
  id: string;
  filename: string;
  classification: 'ready_to_delete' | 'publish_removal_first' | 'used_by_journey' | 'not_found';
  result?: 'deleted' | 'protected' | 'not_found' | 'failed';
};

function documentEqual(left: PhotosPageDocument, right: PhotosPageDocument) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function newBlockId() {
  return crypto.randomUUID().replace(/-/g, '');
}

function dateFromFile(file: File) {
  if (!file.lastModified) return undefined;
  const date = new Date(file.lastModified);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function documentPhotos(document: PhotosPageDocument, mediaById: Map<string, EditorMedia>): EditorCanvasPhoto[] {
  let pendingSection: { id: string; title?: string; text?: string } | undefined;
  const photos: EditorCanvasPhoto[] = [];
  for (const block of document.blocks) {
    if (block.type === 'section') {
      pendingSection = { id: block.id, ...(block.title ? { title: block.title } : {}), ...(block.text ? { text: block.text } : {}) };
      continue;
    }
    const asset = mediaById.get(block.mediaAssetId);
    photos.push({
      id: block.mediaAssetId,
      blockId: block.id,
      source: asset?.source ?? '',
      alt: block.altText ?? block.caption ?? asset?.altText ?? asset?.caption ?? asset?.originalFilename ?? 'Unavailable media',
      width: asset?.width ?? 1,
      height: asset?.height ?? 1,
      originalFilename: asset?.originalFilename ?? `Unavailable upload (${block.mediaAssetId})`,
      ...(block.caption ? { caption: block.caption } : {}),
      ...(block.displayDate ? { captureDate: block.displayDate } : {}),
      kind: asset?.resourceType ?? 'image',
      ...(pendingSection ? {
        sectionBreak: { ...(pendingSection.title ? { title: pendingSection.title } : {}), ...(pendingSection.text ? { text: pendingSection.text } : {}) },
        sectionBlockId: pendingSection.id,
      } : {}),
      ...(!asset || !asset.source ? { unavailable: true } : {}),
    });
    pendingSection = undefined;
  }
  return photos;
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
  const [selectedMediaBlockIds, setSelectedMediaBlockIds] = useState<Set<string>>(new Set());
  const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop');
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [hasUnpublishedChanges, setHasUnpublishedChanges] = useState(initialHasUnpublishedChanges);
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [uploadMessage, setUploadMessage] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [deletionPlan, setDeletionPlan] = useState<DeletionPlanItem[] | null>(null);
  const [deletionMessage, setDeletionMessage] = useState('');

  const mediaById = useMemo(() => new Map(media.map((asset) => [asset.id, asset])), [media]);
  const photos = useMemo(() => documentPhotos(document, mediaById), [document, mediaById]);
  const activeBlock = document.blocks.find((block) => block.id === activeBlockId);
  const activeMediaBlock = isMediaBlock(activeBlock) ? activeBlock : null;

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
    setActiveBlockId(blockId);
  }

  function undo() {
    if (historyIndex <= 0) return;
    const next = history[historyIndex - 1];
    documentRef.current = next;
    setDocument(next);
    setHistoryIndex(historyIndex - 1);
    scheduleSave();
  }

  function redo() {
    if (historyIndex >= history.length - 1) return;
    const next = history[historyIndex + 1];
    documentRef.current = next;
    setDocument(next);
    setHistoryIndex(historyIndex + 1);
    scheduleSave();
  }

  function addSection() {
    const section: PhotosSectionBlock = { id: newBlockId(), type: 'section' };
    applyDocument(insertSection(documentRef.current, activeBlockId, section));
    setActiveBlockId(section.id);
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
          ...(dateFromFile(file) ? { captureDate: dateFromFile(file) } : {}),
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
      if (inserted) setActiveBlockId(inserted.id);
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
    if (inserted) setActiveBlockId(inserted.id);
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
    if (!await flushDraft()) return;
    setSaveState('saving');
    try {
      const response = await fetch('/api/admin/photos-page/publish', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedVersion: versionRef.current }),
      });
      const payload = await response.json();
      if (response.status === 409) { conflictRef.current = true; setSaveState('conflict'); return; }
      if (!response.ok) throw new Error(payload?.error?.message ?? 'Unable to publish the Photos page');
      const page = payload.page as PhotosApiPage;
      versionRef.current = page.draftVersion;
      lastSavedDocumentRef.current = page.draftDocument;
      setHasUnpublishedChanges(page.hasUnpublishedChanges);
      setSaveState('saved');
      router.refresh();
    } catch (error) { console.error(error); setSaveState('error'); }
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

  function replaceLocalDocument(page: PhotosApiPage) {
    conflictRef.current = false;
    documentRef.current = page.draftDocument;
    lastSavedDocumentRef.current = page.draftDocument;
    versionRef.current = page.draftVersion;
    setDocument(page.draftDocument);
    setHistory([page.draftDocument]);
    setHistoryIndex(0);
    setSelectedMediaBlockIds(new Set());
    setActiveBlockId(null);
    setHasUnpublishedChanges(page.hasUnpublishedChanges);
    setSaveState('saved');
  }

  async function reloadServerDraft() {
    setSaveState('saving');
    try {
      const response = await fetch('/api/admin/photos-page');
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? 'Unable to reload the server draft');
      replaceLocalDocument(payload.page as PhotosApiPage);
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
    setMedia(initialMedia);
  }, [initialMedia]);

  function renderTile(photo: PublicPhoto & { index: number }) {
    const editorPhoto = photo as EditorCanvasPhoto & { index: number };
    const selected = selectedMediaBlockIds.has(editorPhoto.blockId);
    return <article className={styles.editorTile} data-selected={selected || undefined} key={editorPhoto.blockId}>
      <button aria-label={`Edit ${editorPhoto.kind === 'video' ? 'video' : 'photo'} ${editorPhoto.originalFilename}`} className={styles.editorImageButton} onClick={() => setActiveBlockId(editorPhoto.blockId)} type="button">
        {editorPhoto.unavailable ? <span className={styles.unavailable}>This upload is unavailable. Remove it before publishing.</span> : <Image alt={editorPhoto.alt} height={editorPhoto.height} sizes="(max-width: 700px) 50vw, (max-width: 1100px) 33vw, 25vw" src={editorPhoto.source} width={editorPhoto.width} />}
      </button>
      <label className={styles.selectTile}><input checked={selected} onChange={() => toggleMediaSelection(editorPhoto.blockId)} type="checkbox" /><span className="sr-only">Select {editorPhoto.originalFilename}</span></label>
      {editorPhoto.kind === 'video' ? <span className={styles.videoBadge}>Video</span> : null}
      <button className={styles.editTile} onClick={() => setActiveBlockId(editorPhoto.blockId)} type="button">Edit</button>
    </article>;
  }

  function renderSection(section: PhotoSection) {
    const block = section.sectionBlockId ? document.blocks.find((item) => item.id === section.sectionBlockId) : undefined;
    if (!block || block.type !== 'section') return <>{section.sectionBreak?.title ? <h2>{section.sectionBreak.title}</h2> : null}{section.sectionBreak?.text ? <p>{section.sectionBreak.text}</p> : null}</>;
    const selected = activeBlockId === block.id;
    return <div className={styles.sectionEditor} data-selected={selected || undefined}>
      {selected ? <>
        <label>Section heading<input autoFocus maxLength={500} onChange={(event) => applyDocument(updateSectionBlock(documentRef.current, block.id, { title: event.target.value.trim() || undefined }))} placeholder="Optional heading" value={block.title ?? ''} /></label>
        <label>Section note<textarea maxLength={2_000} onChange={(event) => applyDocument(updateSectionBlock(documentRef.current, block.id, { text: event.target.value.trim() || undefined }))} placeholder="Optional note" value={block.text ?? ''} /></label>
        <span className={styles.inlineActions}><button onClick={() => applyDocument(moveSectionGroup(documentRef.current, block.id, 'before'))} type="button">Move earlier</button><button onClick={() => applyDocument(moveSectionGroup(documentRef.current, block.id, 'after'))} type="button">Move later</button><button onClick={() => { applyDocument(removeSection(documentRef.current, block.id)); setActiveBlockId(null); }} type="button">Remove section break</button></span>
      </> : <button className={styles.sectionSelect} onClick={() => setActiveBlockId(block.id)} type="button">{block.title ? <h2>{block.title}</h2> : <span className={styles.blankSection}>Blank section break</span>}{block.text ? <p>{block.text}</p> : null}</button>}
    </div>;
  }

  return <div className={styles.workspace}>
    <div className={styles.toolbar}>
      <span className={styles.viewportButtons} aria-label="Preview viewport"><button aria-pressed={viewport === 'desktop'} onClick={() => setViewport('desktop')} type="button">Desktop</button><button aria-pressed={viewport === 'mobile'} onClick={() => setViewport('mobile')} type="button">Mobile</button></span>
      <span className={styles.historyButtons}><button disabled={historyIndex === 0} onClick={undo} type="button">Undo</button><button disabled={historyIndex === history.length - 1} onClick={redo} type="button">Redo</button></span>
      <span aria-live="polite" className={styles.saveState} data-state={saveState}>{saveState === 'saving' ? 'Saving…' : saveState === 'conflict' ? 'Draft changed elsewhere' : saveState === 'error' ? 'Could not save' : hasUnpublishedChanges ? 'Unpublished changes' : 'Published'}</span>
      <span className={styles.primaryActions}>
        <button disabled={uploadState === 'uploading'} onClick={() => setPickerOpen(true)} type="button">{uploadState === 'uploading' ? 'Uploading…' : 'Add media'}</button><button onClick={addSection} type="button">Insert section</button><button disabled={saveState === 'saving' || saveState === 'conflict' || !hasUnpublishedChanges} onClick={() => void publish()} type="button">Publish</button><button disabled={saveState === 'saving' || !hasUnpublishedChanges} onClick={() => void discard()} type="button">Discard</button>
      </span>
    </div>
    {uploadMessage ? <p className={styles.uploadStatus} data-error={uploadState === 'error' || undefined}>{uploadMessage}</p> : null}
    {saveState === 'conflict' ? <aside className={styles.conflict} role="alert">Another editor saved this page. Your local layout is preserved. <button onClick={() => void reloadServerDraft()} type="button">Reload server draft</button><button onClick={() => void replaceServerDraft()} type="button">Replace server draft with mine</button></aside> : null}
    {selectedMediaBlockIds.size ? <div className={styles.bulkBar}><span>{selectedMediaBlockIds.size} selected</span><span className={styles.bulkActions}><button onClick={() => { applyDocument(removeMediaBlocks(documentRef.current, selectedMediaBlockIds)); setSelectedMediaBlockIds(new Set()); setActiveBlockId(null); }} type="button">Remove from page</button><button onClick={() => void requestDeletionPlan()} type="button">Delete uploads…</button></span></div> : null}
    <div className={styles.authoringShell} data-viewport={viewport}><div className={styles.canvasFrame}>{photos.length ? <PhotosPageView intro="A collection of moments, arranged in the order they belong." onOpen={() => undefined} photos={photos} renderSection={renderSection} renderTile={renderTile} /> : <section className={styles.emptyCanvas}><h2>Photos, soon.</h2><p>Add uploads or insert a section to start shaping this page.</p></section>}</div></div>
    {activeMediaBlock ? <aside className={styles.inspector} aria-label="Selected photo inspector">
      <p className={styles.inspectorEyebrow}>Selected media</p><strong>{mediaById.get(activeMediaBlock.mediaAssetId)?.originalFilename ?? 'Unavailable upload'}</strong>
      <label>Display date<input max="9999-12-31" onChange={(event) => applyDocument(updateMediaBlock(documentRef.current, activeMediaBlock.id, { displayDate: event.target.value || undefined }))} type="date" value={activeMediaBlock.displayDate ?? ''} /></label>
      <label>Caption<input maxLength={2_000} onChange={(event) => applyDocument(updateMediaBlock(documentRef.current, activeMediaBlock.id, { caption: event.target.value.trim() || undefined }))} placeholder="Optional text beneath the photo" value={activeMediaBlock.caption ?? ''} /></label>
      <label>Alt text<input aria-invalid={!activeMediaBlock.decorative && !activeMediaBlock.altText || undefined} maxLength={1_000} onChange={(event) => applyDocument(updateMediaBlock(documentRef.current, activeMediaBlock.id, { altText: event.target.value.trim() || undefined }))} placeholder="Describe the image" value={activeMediaBlock.altText ?? ''} /></label>
      <label className={styles.decorative}><input checked={activeMediaBlock.decorative} onChange={(event) => applyDocument(updateMediaBlock(documentRef.current, activeMediaBlock.id, { decorative: event.target.checked }))} type="checkbox" /> Decorative image</label>
      {!activeMediaBlock.decorative && !activeMediaBlock.altText ? <p className={styles.fieldError}>Alt text is required before publishing.</p> : null}
      <span className={styles.inspectorActions}><button onClick={() => applyDocument(moveMedia(documentRef.current, activeMediaBlock.id, 'before'))} type="button">Move earlier</button><button onClick={() => applyDocument(moveMedia(documentRef.current, activeMediaBlock.id, 'after'))} type="button">Move later</button><button onClick={() => { applyDocument(removeMediaBlocks(documentRef.current, [activeMediaBlock.id])); setActiveBlockId(null); }} type="button">Remove from page</button></span>
    </aside> : null}
    <p aria-live="polite" className="sr-only">{selectedMediaBlockIds.size ? `${selectedMediaBlockIds.size} photos selected` : ''}</p>
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
