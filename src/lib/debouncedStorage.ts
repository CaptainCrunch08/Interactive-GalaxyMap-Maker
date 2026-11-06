/**
 * Persist storage that debounces JSON.stringify + localStorage writes.
 *
 * Zustand's createJSONStorage stringifies on every set() before our old
 * string debounce ran — multi-MB maps froze the UI while typing. This
 * keeps the object pending and only serializes on flush.
 */

const DEFAULT_DELAY_MS = 450;

type Pending = { name: string; value: unknown };

export function createDebouncedPersistStorage(delayMs = DEFAULT_DELAY_MS): {
  getItem: (name: string) => unknown | null;
  setItem: (name: string, value: unknown) => void;
  removeItem: (name: string) => void;
  flush: () => void;
} {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: Pending | null = null;

  const writeNow = (name: string, value: unknown) => {
    try {
      localStorage.setItem(name, JSON.stringify(value));
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
        if (pending && pending.name === name) return pending.value;
        const raw = localStorage.getItem(name);
        return raw == null ? null : JSON.parse(raw);
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

/** @deprecated Prefer createDebouncedPersistStorage (object-level debounce). */
export function createDebouncedJSONStorage(
  delayMs = DEFAULT_DELAY_MS,
): {
  getItem: (name: string) => string | null;
  setItem: (name: string, value: string) => void;
  removeItem: (name: string) => void;
  flush: () => void;
} {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: { name: string; value: string } | null = null;

  const writeNow = (name: string, value: string) => {
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
