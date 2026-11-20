'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React, { useEffect, useMemo, useState } from 'react';

import { HeldPlacesEditor } from '@/components/editor/HeldPlacesEditor';
import { JourneyVisualEditor, type EditorMedia } from '@/components/editor/JourneyVisualEditor';
import styles from '@/app/admin/admin.module.css';
import { useDraftSave } from '@/lib/client/use-draft-save';
import type {
  JourneyDocument,
  JourneyLocation,
} from '@/lib/journeys/schemas';
import type { MediaPlacement } from '@/lib/media/schemas';
import { journeyReleaseSnapshot } from '@/lib/journeys/release-status';
import type { Journey } from '@/lib/journeys/schemas';

type EditableJourney = {
  _id: string;
  title: string;
  slug: string;
  publishedSlug?: string;
  summary?: string;
  cover?: MediaPlacement | null;
  experiencedAt?: { start: string; end?: string } | null;
  locations?: JourneyLocation[];
  social?: Journey['social'];
  status: 'draft' | 'preview' | 'published' | 'archived';
  editVersion: number;
  draftDocument: JourneyDocument;
};

type SaveResponse = { journey?: EditableJourney; error?: { code?: string; message?: string; details?: unknown } };
type PublishState = { state: 'idle' | 'publishing' | 'published' | 'error'; message?: string; issues?: { message: string }[] };

function sameDraft(left: EditableJourney, right: EditableJourney) {
  return journeyReleaseSnapshot(left) === journeyReleaseSnapshot(right);
}

async function persistJourney({ draft, version }: { draft: EditableJourney; version: number }) {
  const response = await fetch(`/api/admin/journeys/${draft._id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      expectedEditVersion: version,
      title: draft.title,
      slug: draft.slug,
      summary: draft.summary || null,
      cover: draft.cover ?? null,
      experiencedAt: draft.experiencedAt ?? null,
      locations: draft.locations ?? [],
      draftDocument: draft.draftDocument,
    }),
  });
  if (response.status === 409) return null;
  const payload: SaveResponse = await response.json();
  if (!response.ok || !payload.journey) throw new Error(payload.error?.message ?? 'Save failed');
  return { draft: payload.journey, version: payload.journey.editVersion };
}

export function JourneyWorkspace({ initialJourney, initialPublishedSnapshot, media }: { initialJourney: EditableJourney; initialPublishedSnapshot: string | null; media: EditorMedia[] }) {
  const router = useRouter();
  const { draft: journey, saved: { draft: savedJourney }, phase: saveState, edit, readDraft, isDirty, flush, runAction } = useDraftSave({
    initial: { draft: initialJourney, version: initialJourney.editVersion },
    debounceMs: 1_000,
    persist: persistJourney,
    equal: sameDraft,
  });
  const draftSnapshot = useMemo(() => journeyReleaseSnapshot(journey), [journey]);
  const [publishedSnapshot, setPublishedSnapshot] = useState(initialPublishedSnapshot);
  const [publishState, setPublishState] = useState<PublishState>({ state: 'idle' });
  const [summaryOmissionConfirmed, setSummaryOmissionConfirmed] = useState(false);
  const [deleteState, setDeleteState] = useState<'idle' | 'deleting' | 'error'>('idle');
  const [deleteError, setDeleteError] = useState('');
  const [migrationState, setMigrationState] = useState<'idle' | 'migrating' | 'error'>('idle');
  const releaseBusy = publishState.state === 'publishing' || migrationState === 'migrating';

  useEffect(() => {
    function beforeUnload(event: BeforeUnloadEvent) {
      if (!isDirty()) return;
      event.preventDefault();
      event.returnValue = '';
    }
    function beforeNavigate(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || !isDirty()) return;
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!(link instanceof HTMLAnchorElement) || link.download || (link.target && link.target !== '_self')) return;
      const destination = new URL(link.href);
      if (destination.origin === window.location.origin && destination.pathname === window.location.pathname && destination.search === window.location.search) return;
      if (window.confirm('This journey has unsaved changes. Leave and discard them? Choose Cancel to stay and use Save now to retry.')) return;
      event.preventDefault();
      event.stopPropagation();
    }
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', beforeNavigate, true);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('click', beforeNavigate, true);
    };
  }, [isDirty]);

  function change<K extends keyof Pick<EditableJourney, 'title' | 'slug' | 'summary' | 'cover' | 'experiencedAt' | 'locations' | 'draftDocument'>>(key: K, value: EditableJourney[K]) {
    edit({ ...readDraft(), [key]: value });
  }

  async function publish() {
    setPublishState({ state: 'publishing' });
    try {
      await runAction('flush', async ({ draft, version }) => {
        const response = await fetch(`/api/admin/journeys/${draft._id}/publish`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ expectedEditVersion: version, summaryOmissionConfirmed }),
        });
        if (response.status === 409) return null;
        const payload: SaveResponse = await response.json();
        if (!response.ok || !payload.journey) {
          const issues = Array.isArray(payload.error?.details)
            ? payload.error.details.filter((issue): issue is { message: string } => Boolean(issue && typeof issue === 'object' && 'message' in issue && typeof issue.message === 'string'))
            : undefined;
          setPublishState({ state: 'error', message: payload.error?.message ?? 'Publishing failed.', issues });
          return;
        }
        const published = { ...payload.journey, publishedSlug: payload.journey.publishedSlug ?? draft.slug };
        setPublishedSnapshot(journeyReleaseSnapshot(draft));
        setPublishState({ state: 'published', message: 'Published from a new immutable revision.' });
        return { draft: published, version: published.editVersion };
      });
    } catch (error) {
      console.error(error);
      setPublishState({ state: 'error', message: 'Publishing failed; check your connection and try again.' });
    } finally {
      setPublishState((state) => state.state === 'publishing' ? { state: 'idle' } : state);
    }
  }

  async function deleteJourney() {
    if (!window.confirm('Delete this journey and every published revision? This cannot be undone. Shared media will remain in your library.')) return;
    setDeleteState('deleting');
    setDeleteError('');
    try {
      const response = await fetch(`/api/admin/journeys/${journey._id}`, { method: 'DELETE' });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error?.message ?? 'Unable to delete this journey');
      }
      router.push('/admin/journeys');
      router.refresh();
    } catch (error) {
      console.error(error);
      setDeleteState('error');
      setDeleteError(error instanceof Error ? error.message : 'Unable to delete this journey');
    }
  }

  async function startMigration() {
    if (!window.confirm('Start the Held Places migration? Your current draft will be saved as an immutable checkpoint before the new empty chapter is created. The published journey will not change.')) return;
    setMigrationState('migrating');
    try {
      await runAction('flush', async ({ draft, version }, local) => {
        const response = await fetch(`/api/admin/journeys/${draft._id}/migration`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ expectedEditVersion: version }),
        });
        if (response.status === 409) return null;
        const payload: SaveResponse = await response.json();
        if (!response.ok || !payload.journey) throw new Error(payload.error?.message ?? 'Migration failed');
        // The old canvas cannot be merged into a migrated draft.
        if (readDraft() !== local) return null;
        return { draft: payload.journey, version: payload.journey.editVersion };
      });
      setMigrationState('idle');
    } catch (error) {
      console.error(error);
      setMigrationState('error');
    }
  }

  const saveLabel = {
    dirty: 'Local changes · not saved',
    saving: 'Saving…',
    saved: 'Draft saved',
    error: 'Save failed; try again',
    conflict: 'Another tab changed this journey. Reload before saving again.',
  };

  return (
    <>
      <form className={styles.form} onSubmit={(event) => { event.preventDefault(); void flush(); }}>
        <div className={styles.field}>
          <label htmlFor="journey-title">Title</label>
          <input id="journey-title" value={journey.title} onChange={(event) => change('title', event.target.value)} placeholder="A journey title" maxLength={200} autoFocus />
        </div>
        <div className={styles.field}>
          <label htmlFor="journey-slug">Public slug</label>
          <input id="journey-slug" value={journey.slug} onChange={(event) => change('slug', event.target.value)} placeholder="journey-slug" maxLength={120} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" />
        </div>
        <div className={styles.field}>
          <label htmlFor="journey-summary">Summary <span aria-hidden="true">{journey.draftDocument.schemaVersion === 2 ? '(required for Held Places)' : '(optional)'}</span></label>
          <textarea id="journey-summary" value={journey.summary ?? ''} onChange={(event) => change('summary', event.target.value)} placeholder="A short invitation into the journey." maxLength={500} />
        </div>
        <div className={styles.field}>
          <label htmlFor="journey-cover">Cover image</label>
          <select id="journey-cover" value={journey.cover?.mediaAssetId ?? ''} onChange={(event) => {
            const asset = media.find(({ id }) => id === event.target.value);
            change('cover', event.target.value ? {
              mediaAssetId: event.target.value,
              role: 'cover',
              layout: { desktop: 'full', mobile: 'full' },
              decorative: !asset?.altText,
            } : null);
          }}>
            <option value="">Choose a cover from the media library…</option>
            {media.filter((asset) => asset.resourceType !== 'video').map((asset) => <option key={asset.id} value={asset.id}>{asset.title}</option>)}
          </select>
          {journey.cover ? (
            <div className={styles.coverControls}>
              <label htmlFor="journey-cover-alt">Cover alt text</label>
              <input
                id="journey-cover-alt"
                maxLength={1000}
                onChange={(event) => change('cover', {
                  ...journey.cover!,
                  altTextOverride: event.target.value || undefined,
                  decorative: !event.target.value,
                })}
                placeholder={media.find(({ id }) => id === journey.cover?.mediaAssetId)?.altText ?? 'Describe the cover photograph'}
                value={journey.cover.altTextOverride ?? ''}
              />
              <div className={styles.coverFocalGrid}>
                {(['desktop', 'mobile'] as const).map((viewport) => (
                  <fieldset key={viewport}>
                    <legend>{viewport} focal point</legend>
                    {(['x', 'y'] as const).map((axis) => (
                      <label key={axis}>{axis.toUpperCase()}
                        <input
                          aria-label={`Cover ${viewport} focal point ${axis === 'x' ? 'horizontal' : 'vertical'}`}
                          max="100"
                          min="0"
                          onChange={(event) => {
                            const currentCrop = journey.cover?.crop?.[viewport];
                            const currentPoint = currentCrop?.focalPoint ?? { x: .5, y: .5 };
                            change('cover', {
                              ...journey.cover!,
                              crop: {
                                ...journey.cover?.crop,
                                [viewport]: {
                                  mode: 'focal-fill',
                                  aspectRatio: viewport === 'mobile' ? 1 : 1.15,
                                  ...currentCrop,
                                  focalPoint: { ...currentPoint, [axis]: Number(event.target.value) / 100 },
                                },
                              },
                            });
                          }}
                          type="range"
                          value={(journey.cover?.crop?.[viewport]?.focalPoint?.[axis] ?? .5) * 100}
                        />
                      </label>
                    ))}
                  </fieldset>
                ))}
              </div>
            </div>
          ) : null}
          <span className={styles.fieldHint}>The cover uses the template crop at every width; only its focal point and accessible description are editable.</span>
        </div>
        <div className={styles.field}>
          <label htmlFor="journey-experienced-start">Experienced date <span aria-hidden="true">(optional)</span></label>
          <input
            id="journey-experienced-start"
            onChange={(event) => change('experiencedAt', event.target.value ? {
              start: event.target.value,
              ...(journey.experiencedAt?.end ? { end: journey.experiencedAt.end } : {}),
            } : null)}
            type="date"
            value={journey.experiencedAt?.start ?? ''}
          />
          <input
            aria-label="Experienced end date"
            disabled={!journey.experiencedAt?.start}
            min={journey.experiencedAt?.start}
            onChange={(event) => change('experiencedAt', journey.experiencedAt?.start ? {
              start: journey.experiencedAt.start,
              ...(event.target.value ? { end: event.target.value } : {}),
            } : null)}
            type="date"
            value={journey.experiencedAt?.end ?? ''}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="journey-locations">Locations <span aria-hidden="true">(optional)</span></label>
          <input
            id="journey-locations"
            onChange={(event) => change('locations', event.target.value.split(',').map((label) => label.trim()).filter(Boolean).map((label, index) => ({ id: `location-${index + 1}`, label })))}
            placeholder="Tohoku, Sendai, Matsushima"
            value={(journey.locations ?? []).map(({ label }) => label).join(', ')}
          />
          <span className={styles.fieldHint}>Separate public location labels with commas.</span>
        </div>
        <div className={styles.formFooter}>
          <span aria-live="polite" className={styles.status} data-state={saveState}>{saveLabel[saveState]}</span>
          <div className={styles.actionGroup}>
            <Link className={styles.quietButton} href={`/admin/preview/${journey._id}`}>Preview</Link>
            <button className={styles.button} type="submit" disabled={releaseBusy || saveState === 'saving' || saveState === 'conflict'}>Save now</button>
          </div>
        </div>
      </form>
      {journey.draftDocument.schemaVersion === 2 ? (
        <HeldPlacesEditor
          document={journey.draftDocument}
          media={media}
          journeyId={journey._id}
          onChange={(draftDocument) => change('draftDocument', draftDocument)}
        />
      ) : (
        <>
          <section className={styles.migrationPanel}>
            <div>
              <p className={styles.eyebrow}>Legacy journey</p>
              <h2 className={styles.publishTitle}>Move this draft into Held Places</h2>
              <p className={styles.publishDescription}>A checkpoint preserves the current draft. The public revision stays live while you manually curate the new chapter slots.</p>
            </div>
            <button className={styles.button} disabled={releaseBusy || saveState === 'conflict'} onClick={() => void startMigration()} type="button">{migrationState === 'migrating' ? 'Preparing…' : 'Start Held Places migration'}</button>
            {migrationState === 'error' ? <p className={styles.deleteError} role="alert">Migration failed. Reload and try again.</p> : null}
          </section>
          <p className={styles.eyebrow} style={{ marginTop: 48 }}>Legacy visual canvas</p>
          <h2 className={styles.title} style={{ fontSize: 'clamp(32px, 4vw, 48px)' }}>Write, then place the frame.</h2>
          <p className={styles.lede}>This v1 editor stays available during migration.</p>
          <JourneyVisualEditor
            document={journey.draftDocument}
            media={media}
            journeyId={journey._id}
            onChange={(draftDocument) => change('draftDocument', draftDocument)}
          />
        </>
      )}
      <section className={styles.publishPanel} aria-label="Publish journey">
        <div>
          <p className={styles.eyebrow}>Release</p>
          <p aria-live="polite" className={styles.releaseStatus}>{publishedSnapshot === null ? 'Never published' : draftSnapshot === publishedSnapshot ? 'Live · no unpublished changes' : 'Live · unpublished changes'}</p>
          <h2 className={styles.publishTitle}>{savedJourney.status === 'published' ? 'Publish an updated revision' : 'Ready for the public archive?'}</h2>
          <p className={styles.publishDescription}>Publishing validates the draft, records an immutable revision, and makes that revision the public journey.</p>
          {journey.draftDocument.schemaVersion === 1 && !journey.summary && (
            <label className={styles.checkbox}><input type="checkbox" checked={summaryOmissionConfirmed} onChange={(event) => setSummaryOmissionConfirmed(event.target.checked)} /> This journey intentionally has no summary.</label>
          )}
        </div>
        <div className={styles.actionGroup}>
          <button className={styles.quietButton} type="button" disabled={deleteState === 'deleting'} onClick={() => void deleteJourney()}>{deleteState === 'deleting' ? 'Deleting…' : 'Delete journey'}</button>
          <button className={styles.button} type="button" disabled={releaseBusy || saveState === 'conflict' || deleteState === 'deleting'} onClick={() => void publish()}>{publishState.state === 'publishing' ? 'Publishing…' : savedJourney.status === 'published' ? 'Publish update' : 'Publish journey'}</button>
        </div>
        {publishState.message && <p className={styles.publishMessage} data-state={publishState.state}>{publishState.message}</p>}
        {savedJourney.status === 'published' && <Link className={styles.quietButton} href={`/stories/${savedJourney.publishedSlug ?? savedJourney.slug}`} target="_blank" rel="noreferrer">View public journey ↗</Link>}
        {publishState.issues?.length ? <ul className={styles.publishIssues}>{publishState.issues.map((issue, index) => <li key={`${issue.message}-${index}`}>{issue.message}</li>)}</ul> : null}
        {deleteState === 'error' ? <p className={styles.deleteError} role="alert">{deleteError}</p> : null}
      </section>
      {saveState === 'conflict' && <p className={styles.notice}>Your local document is still in this browser. Copy it before reloading if you need to preserve the unsaved version.</p>}
    </>
  );
}
