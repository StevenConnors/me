'use client';

import { Node, mergeAttributes } from '@tiptap/core';
import FileHandler from '@tiptap/extension-file-handler';
import StarterKit from '@tiptap/starter-kit';
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps, useEditor } from '@tiptap/react';
import type { Editor, JSONContent } from '@tiptap/core';
import { useEffect, useMemo, useRef, useState } from 'react';

import styles from './JourneyVisualEditor.module.css';
import type { LegacyTiptapDocumentV1 } from '@/lib/journeys/schemas';
import type { MediaPlacement } from '@/lib/media/schemas';
import { uploadMedia } from '@/lib/client/upload-media';

export type EditorMedia = {
  id: string;
  title: string;
  previewUrl?: string;
  width: number;
  height: number;
  altText?: string;
};

type MediaMap = Record<string, EditorMedia>;

const imageMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

function defaultPlacement(mediaAssetId: string): MediaPlacement {
  return {
    mediaAssetId,
    role: 'story',
    layout: { desktop: 'wide', mobile: 'full' },
    decorative: true,
  };
}

function NodeClassName({ selected, className }: { selected: boolean; className?: string }) {
  return `${styles.node}${selected ? ` ${styles.nodeSelected}` : ''}${className ? ` ${className}` : ''}`;
}

function PhotographNodeView({ node, updateAttributes, selected, extension }: NodeViewProps) {
  const placement = node.attrs.placement as MediaPlacement;
  const media = (extension.options.getMedia as (id: string) => EditorMedia | undefined)(placement.mediaAssetId);
  const [cropTarget, setCropTarget] = useState<'desktop' | 'mobile'>('desktop');
  const activeCrop = placement.crop?.[cropTarget];

  function updatePlacement(change: Partial<MediaPlacement>) {
    updateAttributes({ placement: { ...placement, ...change } });
  }

  function updateFocal(axis: 'x' | 'y', rawValue: string) {
    const value = Number(rawValue) / 100;
    const current = activeCrop?.focalPoint ?? { x: .5, y: .5 };
    updatePlacement({
      crop: {
        ...placement.crop,
        [cropTarget]: {
          mode: 'focal-fill',
          aspectRatio: activeCrop?.aspectRatio ?? (cropTarget === 'mobile' ? 4 / 5 : 4 / 3),
          ...activeCrop,
          focalPoint: { ...current, [axis]: value },
        },
      },
    });
  }

  const objectPosition = activeCrop?.focalPoint
    ? `${activeCrop.focalPoint.x * 100}% ${activeCrop.focalPoint.y * 100}%`
    : '50% 50%';

  return (
    <NodeViewWrapper className={NodeClassName({ selected, className: styles.photo })} data-layout={placement.layout.desktop}>
      {media?.previewUrl ? (
        <img src={media.previewUrl} alt={placement.decorative !== false ? '' : placement.altTextOverride ?? media.altText ?? ''} style={{ objectPosition }} />
      ) : (
        <div className={styles.missingMedia}>Media {placement.mediaAssetId} is saved, but its editor preview is unavailable.</div>
      )}
      <div className={styles.nodeInspector} contentEditable={false}>
        <span className={styles.nodeLabel}>{media?.title ?? 'Photograph'}</span>
        <select
          className={styles.nodeSelect}
          aria-label="Desktop image layout"
          value={placement.layout.desktop}
          onChange={(event) => updatePlacement({ layout: { ...placement.layout, desktop: event.target.value as MediaPlacement['layout']['desktop'] } })}
        >
          {['inline', 'wide', 'full', 'left', 'right', 'pair'].map((layout) => <option key={layout} value={layout}>{layout}</option>)}
        </select>
        <select className={styles.nodeSelect} aria-label="Crop target" value={cropTarget} onChange={(event) => setCropTarget(event.target.value as 'desktop' | 'mobile')}>
          <option value="desktop">desktop crop</option>
          <option value="mobile">mobile crop</option>
        </select>
        <select
          className={styles.nodeSelect}
          aria-label="Mobile image layout"
          value={placement.layout.mobile}
          onChange={(event) => updatePlacement({ layout: { ...placement.layout, mobile: event.target.value as MediaPlacement['layout']['mobile'] } })}
        >
          {['inline', 'wide', 'full', 'stack'].map((layout) => <option key={layout} value={layout}>{layout} mobile</option>)}
        </select>
        <label className={styles.rangeGroup}>X <input className={styles.range} type="range" min="0" max="100" value={Math.round((activeCrop?.focalPoint?.x ?? .5) * 100)} onChange={(event) => updateFocal('x', event.target.value)} /></label>
        <label className={styles.rangeGroup}>Y <input className={styles.range} type="range" min="0" max="100" value={Math.round((activeCrop?.focalPoint?.y ?? .5) * 100)} onChange={(event) => updateFocal('y', event.target.value)} /></label>
      </div>
      {(placement.captionOverride || media?.title) && <figcaption className={styles.caption}>{placement.captionOverride ?? media?.title}</figcaption>}
    </NodeViewWrapper>
  );
}

function GalleryNodeView({ node, selected, extension }: NodeViewProps) {
  const items = node.attrs.items as MediaPlacement[];
  const template = node.attrs.template as string;
  const getMedia = extension.options.getMedia as (id: string) => EditorMedia | undefined;

  return (
    <NodeViewWrapper className={NodeClassName({ selected })}>
      <div className={styles.gallery} data-template={template}>
        {items.map((placement) => {
          const media = getMedia(placement.mediaAssetId);
          return <figure key={placement.mediaAssetId}>{media?.previewUrl ? <img src={media.previewUrl} alt={placement.decorative !== false ? '' : placement.altTextOverride ?? media.altText ?? ''} /> : <div className={styles.galleryEmpty}>{media?.title ?? placement.mediaAssetId}</div>}</figure>;
        })}
      </div>
      <div className={styles.nodeInspector} contentEditable={false}><span className={styles.nodeLabel}>Gallery · {items.length} photographs</span><span /></div>
    </NodeViewWrapper>
  );
}

function UploadNodeView({ node, selected }: NodeViewProps) {
  return <NodeViewWrapper className={NodeClassName({ selected, className: styles.upload })} data-failed={node.attrs.status === 'failed' ? 'true' : undefined}>{node.attrs.status === 'failed' ? 'Image upload failed. Remove this block and try again.' : 'Uploading image…'}</NodeViewWrapper>;
}

function replacePendingUpload(editor: Editor, clientId: string, content: JSONContent) {
  let position: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'mediaUpload' && node.attrs.uploadSessionId === clientId) position = pos;
  });
  if (position === null) return;
  editor.commands.command(({ tr, state }) => {
    const pendingNode = state.doc.nodeAt(position as number);
    if (!pendingNode) return false;
    tr.replaceWith(position as number, (position as number) + pendingNode.nodeSize, state.schema.nodeFromJSON(content));
    return true;
  });
}

function createExtensions(getMedia: (id: string) => EditorMedia | undefined, journeyId: string, onUpload: (media: EditorMedia) => void, onStatus: (message: string, isError?: boolean) => void) {
  const Photograph = Node.create({
    name: 'photograph', group: 'block', atom: true, draggable: true,
    addAttributes: () => ({ placement: { default: null } }),
    parseHTML: () => [{ tag: 'journey-photograph' }],
    renderHTML: ({ HTMLAttributes }) => ['journey-photograph', mergeAttributes(HTMLAttributes)],
    addNodeView: () => ReactNodeViewRenderer(PhotographNodeView),
  }).configure({ getMedia });
  const Gallery = Node.create({
    name: 'gallery', group: 'block', atom: true, draggable: true,
    addAttributes: () => ({ template: { default: 'two-equal' }, items: { default: [] } }),
    parseHTML: () => [{ tag: 'journey-gallery' }],
    renderHTML: ({ HTMLAttributes }) => ['journey-gallery', mergeAttributes(HTMLAttributes)],
    addNodeView: () => ReactNodeViewRenderer(GalleryNodeView),
  }).configure({ getMedia });
  const MediaUpload = Node.create({
    name: 'mediaUpload', group: 'block', atom: true,
    addAttributes: () => ({ uploadSessionId: { default: '' }, status: { default: 'pending' } }),
    parseHTML: () => [{ tag: 'journey-media-upload' }],
    renderHTML: ({ HTMLAttributes }) => ['journey-media-upload', mergeAttributes(HTMLAttributes)],
    addNodeView: () => ReactNodeViewRenderer(UploadNodeView),
  });

  async function handleFiles(editor: Editor, files: File[], position: number) {
    for (const file of files.filter((candidate) => imageMimeTypes.includes(candidate.type))) {
      const clientId = crypto.randomUUID();
      editor.commands.insertContentAt(position, { type: 'mediaUpload', attrs: { uploadSessionId: clientId, status: 'pending' } });
      onStatus(`Uploading ${file.name}…`);
      try {
        const uploaded = await uploadMedia(file, { intendedJourneyId: journeyId });
        const previewUrl = URL.createObjectURL(file);
        const media = { id: uploaded._id, title: uploaded.originalFilename, width: uploaded.width, height: uploaded.height, previewUrl };
        onUpload(media);
        replacePendingUpload(editor, clientId, { type: 'photograph', attrs: { placement: defaultPlacement(uploaded._id) } });
        onStatus(`${file.name} is ready.`);
      } catch (error) {
        editor.commands.command(({ tr, state }) => {
          let failedAt: number | null = null;
          state.doc.descendants((node, pos) => { if (node.type.name === 'mediaUpload' && node.attrs.uploadSessionId === clientId) failedAt = pos; });
          if (failedAt !== null) tr.setNodeMarkup(failedAt, state.schema.nodes.mediaUpload, { uploadSessionId: clientId, status: 'failed' });
          return true;
        });
        onStatus(error instanceof Error ? error.message : 'The image upload failed.', true);
      }
      position += 1;
    }
  }

  return [
    StarterKit.configure({ heading: { levels: [2, 3] } }),
    Photograph,
    Gallery,
    MediaUpload,
    FileHandler.configure({
      allowedMimeTypes: imageMimeTypes,
      onDrop: (editor, files, pos) => { void handleFiles(editor, files, pos); },
      onPaste: (editor, files) => { void handleFiles(editor, files, editor.state.selection.from); },
    }),
  ];
}

export function JourneyVisualEditor({ document, media, journeyId, onChange }: { document: LegacyTiptapDocumentV1; media: EditorMedia[]; journeyId: string; onChange: (document: LegacyTiptapDocumentV1) => void }) {
  const [availableMedia, setAvailableMedia] = useState(media);
  const [selectedMediaId, setSelectedMediaId] = useState(media[0]?.id ?? '');
  const mediaRef = useRef<MediaMap>(Object.fromEntries(media.map((asset) => [asset.id, asset])));
  const onChangeRef = useRef(onChange);
  const [uploadStatus, setUploadStatus] = useState<{ message: string; isError?: boolean } | null>(null);

  useEffect(() => {
    setAvailableMedia(media);
    setSelectedMediaId((current) => current || media[0]?.id || '');
    mediaRef.current = Object.fromEntries(media.map((asset) => [asset.id, asset]));
  }, [media]);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  const extensions = useMemo(() => createExtensions(
    (id) => mediaRef.current[id],
    journeyId,
    (asset) => {
      mediaRef.current[asset.id] = asset;
      setAvailableMedia((current) => current.some((item) => item.id === asset.id) ? current : [...current, asset]);
      setSelectedMediaId(asset.id);
    },
    (message, isError) => setUploadStatus({ message, isError }),
  ), [journeyId]);

  const editor = useEditor({
    immediatelyRender: false,
    extensions,
    content: document.content,
    editorProps: { attributes: { 'data-placeholder': 'Start writing this journey…' } },
    onUpdate: ({ editor: updatedEditor }) => onChangeRef.current({ schemaVersion: 1, editor: 'tiptap', content: updatedEditor.getJSON() as LegacyTiptapDocumentV1['content'] }),
  });

  if (!editor) return null;
  const activeEditor = editor;
  function insertPhoto() {
    if (!selectedMediaId) return;
    activeEditor.chain().focus().insertContent({ type: 'photograph', attrs: { placement: defaultPlacement(selectedMediaId) } }).run();
  }

  function insertGallery() {
    if (!selectedMediaId) return;
    activeEditor.chain().focus().insertContent({ type: 'gallery', attrs: { template: 'two-equal', items: [defaultPlacement(selectedMediaId)] } }).run();
  }

  return (
    <section className={styles.editor} aria-label="Journey writing canvas">
      <div className={styles.toolbar}>
        <button className={editor.isActive('bold') ? styles.toolActive : styles.tool} type="button" onClick={() => editor.chain().focus().toggleBold().run()} aria-label="Bold">B</button>
        <button className={editor.isActive('italic') ? styles.toolActive : styles.tool} type="button" onClick={() => editor.chain().focus().toggleItalic().run()} aria-label="Italic">I</button>
        <button className={editor.isActive('heading', { level: 2 }) ? styles.toolActive : styles.tool} type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>Heading</button>
        <button className={editor.isActive('blockquote') ? styles.toolActive : styles.tool} type="button" onClick={() => editor.chain().focus().toggleBlockquote().run()}>Quote</button>
        <button className={styles.tool} type="button" onClick={() => editor.chain().focus().setHorizontalRule().run()}>Divider</button>
        <select className={styles.mediaPicker} aria-label="Choose media to insert" value={selectedMediaId} onChange={(event) => setSelectedMediaId(event.target.value)}>
          <option value="">Select media…</option>
          {availableMedia.map((asset) => <option value={asset.id} key={asset.id}>{asset.title}</option>)}
        </select>
        <button className={styles.tool} type="button" onClick={insertPhoto} disabled={!selectedMediaId}>Add photo</button>
        <button className={styles.tool} type="button" onClick={insertGallery} disabled={!selectedMediaId}>Add gallery</button>
      </div>
      <div className={styles.canvas}><EditorContent editor={editor} /></div>
      {uploadStatus && <p className={styles.status} data-error={uploadStatus.isError ? 'true' : undefined}>{uploadStatus.message}</p>}
    </section>
  );
}
