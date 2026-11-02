/**
 * localStorage wrapper that debounces writes. Typing / dragging can fire
 * dozens of zustand persist updates per second; serializing multi-MB maps
 * synchronously on each one freezes the UI.
 */

const DEFAULT_DELAY_MS = 450;

type StorageValue = string;

export function createDebouncedJSONStorage(
  delayMs = DEFAULT_DELAY_MS,
): {
  getItem: (name: string) => StorageValue | null;
  setItem: (name: string, value: StorageValue) => void;
  removeItem: (name: string) => void;
  /** Flush any pending write immediately (e.g. before unload). */
  flush: () => void;
} {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: { name: string; value: StorageValue } | null = null;

  const writeNow = (name: string, value: StorageValue) => {
    try {
      localStorage.setItem(name, value);
    } catch (err) {
      console.warn("[galaxy] localStorage setItem failed", err);
    }
  };

  const flush = () => {
    if (timer != null) {
      clearTimeout(timer);
      timer = null;
    }
    if (!pending) return;
    const { name, value } = pending;
    pending = null;
    writeNow(name, value);
  };

  if (typeof window !== "undefined") {
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flush();
    });
  }

  return {
    getItem: (name) => {
      try {
        // Prefer the latest pending write over a stale disk value.
        if (pending && pending.name === name) return pending.value;
        return localStorage.getItem(name);
      } catch {
        return null;
      }
    },
    setItem: (name, value) => {
      pending = { name, value };
      if (timer != null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        flush();
      }, delayMs);
    },
    removeItem: (name) => {
      if (pending?.name === name) pending = null;
      if (timer != null) {
        clearTimeout(timer);
        timer = null;
      }
      try {
        localStorage.removeItem(name);
      } catch {
        /* ignore */
      }
    },
    flush,
  };
}
