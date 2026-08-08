/**
 * Opt-in performance diagnostics.
 * Enable with `?debugPerf=1` or `localStorage.galaxyDebugPerf = "1"`.
 */

const STORAGE_KEY = "galaxyDebugPerf";
const PERSIST_WARN_BYTES = 2 * 1024 * 1024; // 2 MB

let cachedEnabled: boolean | null = null;

export function isPerfDebugEnabled(): boolean {
  if (cachedEnabled != null) return cachedEnabled;
  if (typeof window === "undefined") {
    cachedEnabled = false;
    return false;
  }
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("debugPerf") === "1" || params.get("debugPerf") === "true") {
      cachedEnabled = true;
      return true;
    }
    if (window.localStorage?.getItem(STORAGE_KEY) === "1") {
      cachedEnabled = true;
      return true;
    }
  } catch {
    /* ignore */
  }
  cachedEnabled = false;
  return false;
}

/** Force-refresh the cached flag (e.g. after toggling localStorage). */
export function refreshPerfDebugFlag(): void {
  cachedEnabled = null;
}

export function perfMark(name: string): void {
  if (!isPerfDebugEnabled()) return;
  try {
    performance.mark(name);
  } catch {
    /* ignore */
  }
}

export function perfMeasure(
  label: string,
  startMark: string,
  endMark?: string,
): number | null {
  if (!isPerfDebugEnabled()) return null;
  const end = endMark ?? `${startMark}-end`;
  try {
    if (!endMark) performance.mark(end);
    const entries = performance.measure(label, startMark, end);
    const ms = entries?.duration ?? 0;
    console.info(`[perf] ${label}: ${ms.toFixed(1)}ms`);
    return ms;
  } catch {
    return null;
  } finally {
    try {
      performance.clearMarks(startMark);
      performance.clearMarks(end);
      performance.clearMeasures(label);
    } catch {
      /* ignore */
    }
  }
}

/** Time a synchronous block when debug perf is on. */
export function perfTime<T>(label: string, fn: () => T): T {
  if (!isPerfDebugEnabled()) return fn();
  const start = `${label}-start`;
  perfMark(start);
  try {
    return fn();
  } finally {
    perfMeasure(label, start);
  }
}

export function reportPersistSize(bytes: number, source = "persist"): void {
  const kb = bytes / 1024;
  if (isPerfDebugEnabled()) {
    console.info(`[perf] ${source} payload: ${kb.toFixed(0)} KB (${bytes} bytes)`);
  }
  if (bytes >= PERSIST_WARN_BYTES) {
    console.warn(
      `[galaxy] ${source} is ${(bytes / (1024 * 1024)).toFixed(1)} MB — ` +
        `large maps may slow saves or hit localStorage limits.`,
    );
  }
}

export function utf8ByteLength(text: string): number {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(text).length;
  }
  return text.length * 2;
}

export { PERSIST_WARN_BYTES };
