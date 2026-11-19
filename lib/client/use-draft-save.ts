import { useCallback, useEffect, useRef, useState } from 'react';

type SavePhase = 'saved' | 'dirty' | 'saving' | 'error' | 'conflict';
type VersionedDraft<T> = { draft: T; version: number };
type SaveDraft<T> = (snapshot: VersionedDraft<T>) => Promise<VersionedDraft<T> | null>;
// A conflict returns null; a failed action already reported by the editor returns undefined.
type DraftAction<T> = (saved: VersionedDraft<T>, local: T) => Promise<VersionedDraft<T> | null | undefined>;

type DraftState<T> = {
  draft: T;
  saved: VersionedDraft<T>;
  phase: SavePhase;
};

export function useDraftSave<T>({
  initial, debounceMs, persist, equal = Object.is,
}: {
  initial: VersionedDraft<T>;
  debounceMs: number;
  persist: SaveDraft<T>;
  equal?: (left: T, right: T) => boolean;
}) {
  const [state, setState] = useState<DraftState<T>>({ draft: initial.draft, saved: initial, phase: 'saved' });
  const latest = useRef(state);
  const mounted = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef<Promise<VersionedDraft<T> | null> | null>(null);
  const acting = useRef(false);

  const update = useCallback((patch: Partial<DraftState<T>>) => {
    latest.current = { ...latest.current, ...patch };
    if (mounted.current) setState(latest.current);
  }, []);

  const isDirty = useCallback(() => {
    const { draft, saved } = latest.current;
    return draft !== saved.draft && !equal(draft, saved.draft);
  }, [equal]);

  const readDraft = useCallback(() => latest.current.draft, []);

  const cancelTimer = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; cancelTimer(); };
  }, [cancelTimer]);

  const acknowledge = useCallback((saved: VersionedDraft<T>, sent: T, pending: 'dirty' | 'saving') => {
    const local = latest.current.draft;
    const draft = local === sent ? saved.draft : local;
    update({ draft, saved, phase: draft === saved.draft || equal(draft, saved.draft) ? 'saved' : pending });
  }, [equal, update]);

  const drain = useCallback((): Promise<VersionedDraft<T> | null> => {
    cancelTimer();
    if (inFlight.current) return inFlight.current;
    if (latest.current.phase === 'conflict' || !mounted.current) return Promise.resolve(null);
    if (!isDirty() && latest.current.phase !== 'error') return Promise.resolve(latest.current.saved);

    const request = (async () => {
      update({ phase: 'saving' });
      try {
        do {
          const { draft, saved } = latest.current;
          const next = await persist({ draft, version: saved.version });
          if (!next) {
            update({ phase: 'conflict' });
            return null;
          }
          acknowledge(next, draft, 'saving');
        } while (mounted.current && isDirty());
        return mounted.current ? latest.current.saved : null;
      } catch (error) {
        console.error(error);
        update({ phase: 'error' });
        return null;
      }
    })().finally(() => { inFlight.current = null; });
    inFlight.current = request;
    return request;
  }, [acknowledge, cancelTimer, isDirty, persist, update]);

  const schedule = useCallback(() => {
    cancelTimer();
    if (!mounted.current || acting.current || latest.current.phase !== 'dirty') return;
    timer.current = setTimeout(() => { void drain(); }, debounceMs);
  }, [cancelTimer, debounceMs, drain]);

  const edit = useCallback((draft: T) => {
    const { phase, saved } = latest.current;
    if (inFlight.current || phase === 'conflict') {
      update({ draft });
      return;
    }
    update({ draft, phase: draft === saved.draft || equal(draft, saved.draft) ? 'saved' : 'dirty' });
    schedule();
  }, [equal, schedule, update]);

  function flush() {
    return acting.current ? Promise.resolve(null) : drain();
  }

  async function runAction(mode: 'flush' | 'replace', action: DraftAction<T>) {
    if (acting.current) return;
    // Keep autosaves off the version the action is about to use.
    acting.current = true;
    cancelTimer();
    try {
      const saved = mode === 'flush' ? await drain() : await (inFlight.current ?? latest.current.saved);
      if (!saved || !mounted.current) return;
      const sent = readDraft();
      const result = await action(saved, sent);
      if (result === null) update({ phase: 'conflict' });
      else if (result) acknowledge(result, sent, 'dirty');
    } finally {
      acting.current = false;
      schedule();
    }
  }

  return { ...state, edit, readDraft, isDirty, flush, runAction };
}
