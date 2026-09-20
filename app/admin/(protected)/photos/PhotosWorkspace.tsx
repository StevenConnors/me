'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';

import styles from '@/app/admin/admin.module.css';
import { uploadMedia } from '@/lib/client/upload-media';

type SectionBreak = { title?: string; text?: string };

type EditorPhoto = {
  id: string;
  originalFilename: string;
  width: number;
  height: number;
  captureDate?: string;
  caption?: string;
  altText?: string;
  photoSectionBreak?: SectionBreak;
  source?: string;
};

type UploadState = 'idle' | 'uploading' | 'complete' | 'error';

function dateFromFile(file: File) {
  if (!file.lastModified) return undefined;
  const date = new Date(file.lastModified);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function PhotosWorkspace({ photos }: { photos: EditorPhoto[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [uploadMessage, setUploadMessage] = useState('');

  async function uploadBatch(files: File[]) {
    setUploadState('uploading');
    const failures: string[] = [];

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      setUploadMessage(`Uploading ${index + 1} of ${files.length}: ${file.name}`);
      try {
        const media = await uploadMedia(file);
        const response = await fetch(`/api/admin/media/${media._id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            showInPhotos: true,
            ...(dateFromFile(file) ? { captureDate: dateFromFile(file) } : {}),
          }),
        });
        if (!response.ok) throw new Error('Could not add the image to Photos');
      } catch (error) {
        console.error(error);
        failures.push(file.name);
      }
    }

    router.refresh();
    if (failures.length) {
      setUploadState('error');
      setUploadMessage(`${failures.length} image${failures.length === 1 ? '' : 's'} could not be added: ${failures.join(', ')}`);
    } else {
      setUploadState('complete');
      setUploadMessage(`${files.length} photo${files.length === 1 ? '' : 's'} added to Photos.`);
    }
  }

  return (
    <>
      <section className={styles.panel}>
        <p className={styles.eyebrow}>Add photographs</p>
        <p className={styles.empty}>Choose one or many images. Their file date is used as a starting point for “date taken”; correct it below whenever needed.</p>
        <input
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          hidden
          multiple
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            if (files.length) void uploadBatch(files);
            event.currentTarget.value = '';
          }}
          ref={inputRef}
          type="file"
        />
        <button className={styles.button} disabled={uploadState === 'uploading'} onClick={() => inputRef.current?.click()} type="button">
          {uploadState === 'uploading' ? 'Adding photos…' : 'Add photos'}
        </button>
        {uploadState !== 'idle' ? <p className={styles.status} data-state={uploadState === 'error' ? 'error' : uploadState === 'complete' ? 'saved' : undefined}>{uploadMessage}</p> : null}
      </section>

      <div className={styles.toolbar}>
        <span className={styles.eyebrow}>Photos tab · {photos.length} {photos.length === 1 ? 'image' : 'images'}</span>
        <span className={styles.meta}>Most recent first</span>
      </div>
      {photos.length ? (
        <section className={styles.photoList} aria-label="Photos tab editor">
          {photos.map((photo) => <PhotoCard key={photo.id} photo={photo} />)}
        </section>
      ) : (
        <section className={styles.panel}><p className={styles.empty}>No photos are in the Photos tab yet. Add a batch above; Journey-only media stays in the general Media library.</p></section>
      )}
    </>
  );
}

function PhotoCard({ photo }: { photo: EditorPhoto }) {
  const router = useRouter();
  const [captureDate, setCaptureDate] = useState(photo.captureDate ?? '');
  const [caption, setCaption] = useState(photo.caption ?? '');
  const [altText, setAltText] = useState(photo.altText ?? '');
  const [startsSection, setStartsSection] = useState(Boolean(photo.photoSectionBreak));
  const [sectionTitle, setSectionTitle] = useState(photo.photoSectionBreak?.title ?? '');
  const [sectionText, setSectionText] = useState(photo.photoSectionBreak?.text ?? '');
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState('saving');
    try {
      const response = await fetch(`/api/admin/media/${photo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          captureDate: captureDate || null,
          caption: caption.trim() || null,
          altText: altText.trim() || null,
          photoSectionBreak: startsSection
            ? {
              ...(sectionTitle.trim() ? { title: sectionTitle.trim() } : {}),
              ...(sectionText.trim() ? { text: sectionText.trim() } : {}),
            }
            : null,
        }),
      });
      if (!response.ok) throw new Error('Unable to save photo details');
      setState('saved');
      router.refresh();
    } catch (error) {
      console.error(error);
      setState('error');
    }
  }

  async function removeFromPhotos() {
    setState('saving');
    try {
      const response = await fetch(`/api/admin/media/${photo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ showInPhotos: false, photoSectionBreak: null }),
      });
      if (!response.ok) throw new Error('Unable to remove photo');
      router.refresh();
    } catch (error) {
      console.error(error);
      setState('error');
    }
  }

  return (
    <article className={styles.photoCard}>
      {photo.source ? <Image alt="" className={styles.photoThumbnail} height={photo.height} sizes="(max-width: 768px) 100vw, 40vw" src={photo.source} width={photo.width} /> : <div aria-hidden="true" className={styles.photoThumbnailPlaceholder} />}
      <form className={styles.photoMetadata} onSubmit={(event) => void save(event)}>
        <div className={styles.photoCardHeading}>
          <strong>{photo.originalFilename}</strong>
          <span>{photo.width}×{photo.height}</span>
        </div>
        <div className={styles.photoFieldGrid}>
          <div className={styles.field}>
            <label htmlFor={`photo-date-${photo.id}`}>Date taken</label>
            <input id={`photo-date-${photo.id}`} onChange={(event) => setCaptureDate(event.target.value)} type="date" value={captureDate} />
          </div>
          <div className={styles.field}>
            <label htmlFor={`photo-caption-${photo.id}`}>Caption</label>
            <input id={`photo-caption-${photo.id}`} maxLength={2_000} onChange={(event) => setCaption(event.target.value)} placeholder="Optional text beneath the photo" value={caption} />
          </div>
        </div>
        <div className={styles.field}>
          <label htmlFor={`photo-alt-${photo.id}`}>Alt text</label>
          <input id={`photo-alt-${photo.id}`} maxLength={1_000} onChange={(event) => setAltText(event.target.value)} placeholder="Optional accessible description" value={altText} />
        </div>
        <label className={styles.photoSectionToggle}>
          <input checked={startsSection} onChange={(event) => setStartsSection(event.target.checked)} type="checkbox" />
          <span>Start a new section before this photo</span>
        </label>
        {startsSection ? (
          <div className={styles.photoSectionFields}>
            <div className={styles.field}>
              <label htmlFor={`photo-section-title-${photo.id}`}>Section header</label>
              <input id={`photo-section-title-${photo.id}`} maxLength={500} onChange={(event) => setSectionTitle(event.target.value)} placeholder="Optional heading" value={sectionTitle} />
            </div>
            <div className={styles.field}>
              <label htmlFor={`photo-section-text-${photo.id}`}>Section note</label>
              <textarea id={`photo-section-text-${photo.id}`} maxLength={2_000} onChange={(event) => setSectionText(event.target.value)} placeholder="Optional introductory text" value={sectionText} />
            </div>
          </div>
        ) : null}
        <div className={styles.formFooter}>
          <span className={styles.status} data-state={state === 'error' ? 'error' : state === 'saved' ? 'saved' : undefined}>{state === 'saved' ? 'Saved' : state === 'error' ? 'Could not save' : 'This photo is public'}</span>
          <span className={styles.actionGroup}>
            <button className={styles.quietButton} disabled={state === 'saving'} onClick={() => void removeFromPhotos()} type="button">Remove from Photos</button>
            <button className={styles.button} disabled={state === 'saving'} type="submit">{state === 'saving' ? 'Saving…' : 'Save photo'}</button>
          </span>
        </div>
      </form>
    </article>
  );
}
