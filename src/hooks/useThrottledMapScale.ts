import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Throttle React map-scale updates so pan/zoom does not re-render the full
 * star/fleet tree every transform frame.
 */
export function useThrottledMapScale(
  initial: number,
  intervalMs = 80,
): [number, (scale: number) => void] {
  const [scale, setScale] = useState(initial);
  const pendingRef = useRef<number | null>(null);
  const lastRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current != null) clearTimeout(timerRef.current);
    };
  }, []);

  const setMapScale = useCallback(
    (next: number) => {
      const now = performance.now();
      const elapsed = now - lastRef.current;
      if (elapsed >= intervalMs) {
        lastRef.current = now;
        pendingRef.current = null;
        if (timerRef.current != null) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        setScale(next);
        return;
      }
      pendingRef.current = next;
      if (timerRef.current != null) return;
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        if (pendingRef.current == null) return;
        lastRef.current = performance.now();
        setScale(pendingRef.current);
        pendingRef.current = null;
      }, Math.max(0, intervalMs - elapsed));
    },
    [intervalMs],
  );

  return [scale, setMapScale];
}
