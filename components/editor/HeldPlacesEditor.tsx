'use client';

import StarterKit from '@tiptap/starter-kit';
import { EditorContent, useEditor } from '@tiptap/react';
import React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';

import styles from './HeldPlacesEditor.module.css';
import type { EditorMedia } from './JourneyVisualEditor';
import { uploadMedia } from '@/lib/client/upload-media';
import type {
  HeldPlacesChapter,
  HeldPlacesDocumentV2,
  HeldPlacesMedia,
  RestrictedRichTextDocument,
} from '@/lib/journeys/schemas';

type Props = {
  document: HeldPlacesDocumentV2;
  media: EditorMedia[];
  journeyId: string;
  onChange: (document: HeldPlacesDocumentV2) => void;
};

export function HeldPlacesEditor({ document, media, journeyId, onChange }: Props) {
  const [availableMedia, setAvailableMedia] = useState(media);
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [uploadState, setUploadState] = useState('');
  const draggedChapter = useRef<string | null>(null);
  const mediaById = useMemo(
    () => new Map(availableMedia.map((asset) => [asset.id, asset])),
    [availableMedia],
  );

  useEffect(() => setAvailableMedia(media), [media]);

  function updateChapters(chapters: HeldPlacesChapter[]) {
    onChange({ ...document, chapters });
  }

  function updateChapter(id: string, change: Partial<HeldPlacesChapter>) {
    updateChapters(document.chapters.map((chapter) =>
      chapter.id === id ? { ...chapter, ...change } : chapter,
    ));
  }

  function moveChapter(id: string, direction: -1 | 1) {
    const currentIndex = document.chapters.findIndex((chapter) => chapter.id === id);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= document.chapters.length) return;
    const chapters = [...document.chapters];
    const [chapter] = chapters.splice(currentIndex, 1);
    chapters.splice(nextIndex, 0, chapter);
    updateChapters(chapters);
  }

  function reorderChapter(sourceId: string, targetId: string) {
    if (sourceId === targetId) return;
    const chapters = [...document.chapters];
    const sourceIndex = chapters.findIndex((chapter) => chapter.id === sourceId);
    const targetIndex = chapters.findIndex((chapter) => chapter.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const [chapter] = chapters.splice(sourceIndex, 1);
    chapters.splice(targetIndex, 0, chapter);
    updateChapters(chapters);
  }

  function addChapter() {
    updateChapters([...document.chapters, emptyChapter()]);
  }

  function duplicateChapter(chapter: HeldPlacesChapter) {
    const copy: HeldPlacesChapter = {
      ...chapter,
      id: crypto.randomUUID(),
      body: JSON.parse(JSON.stringify(chapter.body)) as RestrictedRichTextDocument,
      media: chapter.media.map((item) => ({ ...item, crop: item.crop ? {
        desktop: item.crop.desktop ? { ...item.crop.desktop } : undefined,
        mobile: item.crop.mobile ? { ...item.crop.mobile } : undefined,
      } : undefined })),
    };
    const index = document.chapters.findIndex(({ id }) => id === chapter.id);
    const chapters = [...document.chapters];
    chapters.splice(index + 1, 0, copy);
    updateChapters(chapters);
  }

  function addSelectedMedia(chapter: HeldPlacesChapter) {
    const existing = new Set(chapter.media.map(({ mediaAssetId }) => mediaAssetId));
    const additions = (selected[chapter.id] ?? [])
      .filter((id) => !existing.has(id))
      .map((mediaAssetId) => ({ mediaAssetId }));
    if (additions.length) updateChapter(chapter.id, { media: [...chapter.media, ...additions] });
  }

  async function uploadFiles(chapter: HeldPlacesChapter, files: FileList | null) {
    if (!files?.length) return;
    const additions: HeldPlacesMedia[] = [];
    for (const file of Array.from(files)) {
      setUploadState(`Uploading ${file.name}…`);
      try {
        const uploaded = await uploadMedia(file, { intendedJourneyId: journeyId });
        const editorMedia: EditorMedia = {
          id: uploaded._id,
          title: uploaded.originalFilename,
          previewUrl: URL.createObjectURL(file),
          width: uploaded.width,
          height: uploaded.height,
        };
        setAvailableMedia((current) =>
          current.some(({ id }) => id === editorMedia.id)
            ? current
            : [...current, editorMedia],
        );
        additions.push({ mediaAssetId: uploaded._id });
        setUploadState(`${file.name} is ready.`);
      } catch (error) {
        setUploadState(error instanceof Error ? error.message : 'Upload failed.');
      }
    }
    if (additions.length) {
      updateChapter(chapter.id, { media: [...chapter.media, ...additions] });
    }
  }

  return (
    <section aria-label="Held Places chapter editor" className={styles.editor}>
      <div className={styles.intro}>
        <div>
          <p className={styles.kicker}>Held Places template</p>
          <h2>Chapters, prose, and photographs.</h2>
          <p>The page composition is fixed. Fill each chapter, arrange its photographs, and preview at both widths.</p>
        </div>
        <button className={styles.primaryButton} onClick={addChapter} type="button">Add chapter</button>
      </div>

      <div className={styles.chapterList}>
        {document.chapters.map((chapter, chapterIndex) => (
          <section
            className={styles.chapterCard}
            draggable
            key={chapter.id}
            onDragOver={(event) => event.preventDefault()}
            onDragStart={() => { draggedChapter.current = chapter.id; }}
            onDrop={() => {
              if (draggedChapter.current) reorderChapter(draggedChapter.current, chapter.id);
              draggedChapter.current = null;
            }}
          >
            <header className={styles.chapterHeader}>
              <div>
                <span className={styles.dragHandle} aria-hidden="true">⠿</span>
                <span>Chapter {String(chapterIndex + 1).padStart(2, '0')}</span>
              </div>
              <div className={styles.rowActions}>
                <button aria-label={`Move chapter ${chapterIndex + 1} up`} disabled={chapterIndex === 0} onClick={() => moveChapter(chapter.id, -1)} type="button">↑</button>
                <button aria-label={`Move chapter ${chapterIndex + 1} down`} disabled={chapterIndex === document.chapters.length - 1} onClick={() => moveChapter(chapter.id, 1)} type="button">↓</button>
                <button onClick={() => duplicateChapter(chapter)} type="button">Duplicate</button>
                <button disabled={document.chapters.length === 1} onClick={() => updateChapters(document.chapters.filter(({ id }) => id !== chapter.id))} type="button">Remove</button>
              </div>
            </header>

            <div className={styles.field}>
              <label htmlFor={`heading-${chapter.id}`}>Chapter heading <span>(optional)</span></label>
              <input
                id={`heading-${chapter.id}`}
                maxLength={200}
                onChange={(event) => updateChapter(chapter.id, { heading: event.target.value || undefined })}
                placeholder="A place, moment, or turn in the journey"
                value={chapter.heading ?? ''}
              />
            </div>

            <div className={styles.field}>
              <span className={styles.fieldLabel}>Chapter text</span>
              <ChapterBodyEditor
                document={chapter.body}
                onChange={(body) => updateChapter(chapter.id, { body })}
              />
            </div>

            <div className={styles.mediaSection}>
              <div className={styles.mediaPicker}>
                <label htmlFor={`media-${chapter.id}`}>Add photographs from the library</label>
                <select
                  aria-describedby={`media-help-${chapter.id}`}
                  id={`media-${chapter.id}`}
                  multiple
                  onChange={(event) => setSelected((current) => ({
                    ...current,
                    [chapter.id]: Array.from(event.target.selectedOptions, (option) => option.value),
                  }))}
                  value={selected[chapter.id] ?? []}
                >
                  {availableMedia.map((asset) => <option key={asset.id} value={asset.id}>{asset.title}</option>)}
                </select>
                <p id={`media-help-${chapter.id}`}>Hold Command or Control to choose more than one.</p>
                <div className={styles.mediaPickerActions}>
                  <button disabled={!selected[chapter.id]?.length} onClick={() => addSelectedMedia(chapter)} type="button">Add selected</button>
                  <label className={styles.uploadButton}>
                    Upload photographs
                    <input accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple onChange={(event) => void uploadFiles(chapter, event.target.files)} type="file" />
                  </label>
                </div>
              </div>

              {chapter.media.length ? (
                <div className={styles.mediaList}>
                  {chapter.media.map((placement, mediaIndex) => (
                    <MediaEditor
                      asset={mediaById.get(placement.mediaAssetId)}
                      index={mediaIndex}
                      key={`${placement.mediaAssetId}-${mediaIndex}`}
                      onChange={(next) => updateChapter(chapter.id, {
                        media: chapter.media.map((item, index) => index === mediaIndex ? next : item),
                      })}
                      onMove={(direction) => {
                        const nextIndex = mediaIndex + direction;
                        if (nextIndex < 0 || nextIndex >= chapter.media.length) return;
                        const next = [...chapter.media];
                        const [item] = next.splice(mediaIndex, 1);
                        next.splice(nextIndex, 0, item);
                        updateChapter(chapter.id, { media: next });
                      }}
                      onRemove={() => updateChapter(chapter.id, {
                        media: chapter.media.filter((_, index) => index !== mediaIndex),
                      })}
                      placement={placement}
                      total={chapter.media.length}
                    />
                  ))}
                </div>
              ) : (
                <p className={styles.emptyMedia}>No photographs yet. One image stays still; two or more become the template carousel.</p>
              )}
            </div>
          </section>
        ))}
      </div>
      <button className={styles.addChapterButton} onClick={addChapter} type="button">+ Add another chapter</button>
      {uploadState ? <p className={styles.uploadStatus} role="status">{uploadState}</p> : null}
    </section>
  );
}

function ChapterBodyEditor({
  document,
  onChange,
}: {
  document: RestrictedRichTextDocument;
  onChange: (document: RestrictedRichTextDocument) => void;
}) {
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit.configure({
      blockquote: false,
      bulletList: false,
      code: false,
      codeBlock: false,
      heading: false,
      horizontalRule: false,
      listItem: false,
      orderedList: false,
      strike: false,
      underline: false,
      link: { openOnClick: false },
    })],
    content: document,
    editorProps: { attributes: { 'data-placeholder': 'Write the prose for this chapter…' } },
    onUpdate: ({ editor: current }) => {
      onChangeRef.current(current.getJSON() as RestrictedRichTextDocument);
    },
  });

  useEffect(() => {
    if (!editor || editor.isFocused) return;
    const next = JSON.stringify(document);
    if (JSON.stringify(editor.getJSON()) !== next) {
      editor.commands.setContent(document, { emitUpdate: false });
    }
  }, [document, editor]);

  if (!editor) return null;
  return (
    <div className={styles.richText}>
      <div className={styles.richToolbar}>
        <button aria-pressed={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} type="button"><strong>B</strong></button>
        <button aria-pressed={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} type="button"><em>I</em></button>
        <button onClick={() => {
          const href = window.prompt('Link URL (http, https, or mailto)');
          if (!href || !/^(https?:|mailto:)/i.test(href)) return;
          editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
        }} type="button">Link</button>
        <button disabled={!editor.isActive('link')} onClick={() => editor.chain().focus().unsetLink().run()} type="button">Unlink</button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

function MediaEditor({
  placement,
  asset,
  index,
  total,
  onChange,
  onMove,
  onRemove,
}: {
  placement: HeldPlacesMedia;
  asset?: EditorMedia;
  index: number;
  total: number;
  onChange: (placement: HeldPlacesMedia) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  function setFocal(viewport: 'desktop' | 'mobile', axis: 'x' | 'y', value: number) {
    const current = placement.crop?.[viewport];
    const focalPoint = current?.focalPoint ?? { x: .5, y: .5 };
    onChange({
      ...placement,
      crop: {
        ...placement.crop,
        [viewport]: {
          mode: 'focal-fill',
          aspectRatio: viewport === 'mobile' ? 4 / 5 : 4 / 3,
          ...current,
          focalPoint: { ...focalPoint, [axis]: value },
        },
      },
    });
  }

  return (
    <article className={styles.mediaCard}>
      <div className={styles.mediaPreview}>
        {asset?.previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img alt="" src={asset.previewUrl} />
        ) : <span>Preview unavailable</span>}
      </div>
      <div className={styles.mediaFields}>
        <div className={styles.mediaCardHeader}>
          <strong>{asset?.title ?? placement.mediaAssetId}</strong>
          <span>{index + 1} / {total}</span>
        </div>
        <label>Alt text
          <textarea disabled={placement.decorative} maxLength={1000} onChange={(event) => onChange({ ...placement, altTextOverride: event.target.value || undefined })} placeholder={asset?.altText ?? 'Describe what matters in the photograph'} value={placement.altTextOverride ?? ''} />
        </label>
        <label>Caption <span>(optional)</span>
          <input maxLength={2000} onChange={(event) => onChange({ ...placement, captionOverride: event.target.value || undefined })} placeholder="A quiet note beneath the photograph" value={placement.captionOverride ?? ''} />
        </label>
        <label className={styles.decorative}><input checked={placement.decorative ?? false} onChange={(event) => onChange({ ...placement, decorative: event.target.checked || undefined, altTextOverride: event.target.checked ? undefined : placement.altTextOverride })} type="checkbox" /> Decorative image</label>
        <div className={styles.focalGrid}>
          {(['desktop', 'mobile'] as const).map((viewport) => (
            <fieldset key={viewport}>
              <legend>{viewport} focal point</legend>
              <label>X <input aria-label={`${viewport} focal point horizontal`} max="100" min="0" onChange={(event) => setFocal(viewport, 'x', Number(event.target.value) / 100)} type="range" value={(placement.crop?.[viewport]?.focalPoint?.x ?? .5) * 100} /></label>
              <label>Y <input aria-label={`${viewport} focal point vertical`} max="100" min="0" onChange={(event) => setFocal(viewport, 'y', Number(event.target.value) / 100)} type="range" value={(placement.crop?.[viewport]?.focalPoint?.y ?? .5) * 100} /></label>
            </fieldset>
          ))}
        </div>
        <div className={styles.mediaActions}>
          <button aria-label={`Move photograph ${index + 1} earlier`} disabled={index === 0} onClick={() => onMove(-1)} type="button">← Earlier</button>
          <button aria-label={`Move photograph ${index + 1} later`} disabled={index === total - 1} onClick={() => onMove(1)} type="button">Later →</button>
          <button onClick={onRemove} type="button">Remove</button>
        </div>
      </div>
    </article>
  );
}

function emptyChapter(): HeldPlacesChapter {
  return {
    id: crypto.randomUUID(),
    body: { type: 'doc', content: [] },
    media: [],
  };
}
