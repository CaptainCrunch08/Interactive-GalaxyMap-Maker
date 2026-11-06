import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

/**
 * Local controlled draft that commits to an external sink on idle / blur /
 * unmount — keeps typing off the Zustand campaign hot path.
 */
export function useDebouncedDraft<T extends Record<string, unknown>>(
  sourceKey: string,
  initial: T,
  commit: (draft: T) => void,
  delayMs = 500,
): {
  draft: T;
  setDraft: Dispatch<SetStateAction<T>>;
  patchDraft: (partial: Partial<T>) => void;
  flush: () => void;
  onBlurFlush: () => void;
} {
  const [draft, setDraftState] = useState<T>(initial);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const commitRef = useRef(commit);
  commitRef.current = commit;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);

  const clearTimer = () => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const flush = useCallback(() => {
    clearTimer();
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    commitRef.current(draftRef.current);
  }, []);

  // Reset on record switch; flush pending edits for the previous key first.
  useEffect(() => {
    dirtyRef.current = false;
    setDraftState(initial);
    draftRef.current = initial;

    return () => {
      clearTimer();
      if (!dirtyRef.current) return;
      dirtyRef.current = false;
      commitRef.current(draftRef.current);
    };
    // intentionally only when sourceKey changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey]);

  const schedule = useCallback(() => {
    dirtyRef.current = true;
    clearTimer();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      flush();
    }, delayMs);
  }, [delayMs, flush]);

  const patchDraft = useCallback(
    (partial: Partial<T>) => {
      // Sync ref before setState so flush() can run in the same tick (e.g. selects).
      const next = { ...draftRef.current, ...partial };
      draftRef.current = next;
      setDraftState(next);
      schedule();
    },
    [schedule],
  );

  const setDraft: Dispatch<SetStateAction<T>> = (action) => {
    const next =
      typeof action === "function"
        ? (action as (p: T) => T)(draftRef.current)
        : action;
    draftRef.current = next;
    setDraftState(next);
    schedule();
  };

  return {
    draft,
    setDraft,
    patchDraft,
    flush,
    onBlurFlush: flush,
  };
}
