import { useEffect, useRef, useState } from "react";
import type { ReactZoomPanPinchRef } from "react-zoom-pan-pinch";
import { GALAXY_SIZE } from "../types/campaign";

const MAX_SCALE = 2.5;
const ABSOLUTE_MIN_SCALE = 0.02;
const FIT_PADDING = 0.92;
/** Slightly snappier than before — still eased, less “floaty”. */
const ZOOM_LERP = 0.22;
const ZOOM_SENSITIVITY = 0.00115;
/** Base pan speed (px/sec) at scale 1. */
const PAN_SPEED = 520;
/** Ignore sub-pixel scale chatter before notifying React. */
const SCALE_NOTIFY_EPS = 0.002;

function isTypingTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function fitScaleForViewport(
  width: number,
  height: number,
  worldSize: number = GALAXY_SIZE,
) {
  if (width <= 0 || height <= 0) return ABSOLUTE_MIN_SCALE;
  const fit = (Math.min(width, height) / worldSize) * FIT_PADDING;
  return clamp(fit, ABSOLUTE_MIN_SCALE, MAX_SCALE);
}

type ZoomAnchor = {
  /** World-space point under the cursor at wheel time. */
  worldX: number;
  worldY: number;
  /** Wrapper-local screen point to keep that world point under. */
  screenX: number;
  screenY: number;
};

/**
 * Stellaris-style continuous camera: WASD pan + eased wheel zoom toward cursor.
 *
 * Important: never call setTransform while react-zoom-pan-pinch is panning —
 * that desyncs startCoords and causes the “flung across the map” bug.
 */
export function useMapCamera(
  transformRef: React.RefObject<ReactZoomPanPinchRef | null>,
  enabled: boolean,
  onScaleChange?: (scale: number) => void,
  worldSize: number = GALAXY_SIZE,
) {
  const keysRef = useRef({ w: false, a: false, s: false, d: false });
  const targetScaleRef = useRef(0.45);
  const zoomAnchorRef = useRef<ZoomAnchor | null>(null);
  const minScaleRef = useRef(ABSOLUTE_MIN_SCALE);
  const worldSizeRef = useRef(worldSize);
  worldSizeRef.current = worldSize;
  const lastNotifiedScaleRef = useRef<number | null>(null);
  const wasPanningRef = useRef(false);
  const [minScale, setMinScale] = useState(ABSOLUTE_MIN_SCALE);
  const onScaleChangeRef = useRef(onScaleChange);
  onScaleChangeRef.current = onScaleChange;

  const notifyScale = (scale: number) => {
    const prev = lastNotifiedScaleRef.current;
    if (prev !== null && Math.abs(prev - scale) < SCALE_NOTIFY_EPS) return;
    lastNotifiedScaleRef.current = scale;
    onScaleChangeRef.current?.(scale);
  };

  useEffect(() => {
    if (!enabled) return;

    const updateMinScale = () => {
      const wrapper = transformRef.current?.instance?.wrapperComponent;
      if (!wrapper) return;
      const rect = wrapper.getBoundingClientRect();
      const next = fitScaleForViewport(
        rect.width,
        rect.height,
        worldSizeRef.current,
      );
      minScaleRef.current = next;
      setMinScale(next);
      if (targetScaleRef.current < next) {
        targetScaleRef.current = next;
      }
    };

    updateMinScale();
    const wrapper = transformRef.current?.instance?.wrapperComponent;
    const observer =
      typeof ResizeObserver !== "undefined" && wrapper
        ? new ResizeObserver(updateMinScale)
        : null;
    if (wrapper && observer) observer.observe(wrapper);
    window.addEventListener("resize", updateMinScale);

    const retry = window.setTimeout(updateMinScale, 50);
    const retry2 = window.setTimeout(updateMinScale, 250);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateMinScale);
      window.clearTimeout(retry);
      window.clearTimeout(retry2);
    };
  }, [enabled, transformRef, worldSize]);

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const k = e.key.toLowerCase();
      if (k === "w" || k === "a" || k === "s" || k === "d") {
        keysRef.current[k] = true;
        e.preventDefault();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "w" || k === "a" || k === "s" || k === "d") {
        keysRef.current[k] = false;
      }
    };
    const onBlur = () => {
      keysRef.current = { w: false, a: false, s: false, d: false };
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    const onWheel = (e: WheelEvent) => {
      const api = transformRef.current;
      const wrapper = api?.instance?.wrapperComponent;
      if (!api || !wrapper) return;
      if (!wrapper.contains(e.target as Node)) return;

      e.preventDefault();
      e.stopPropagation();

      const { scale, positionX, positionY } = api.state;
      const floor = minScaleRef.current;
      const factor = Math.exp(-e.deltaY * ZOOM_SENSITIVITY);
      targetScaleRef.current = clamp(
        targetScaleRef.current * factor,
        floor,
        MAX_SCALE,
      );

      // While the library is dragging, do not re-anchor — applying setTransform
      // mid-pan desyncs its startCoords and flings the camera.
      if (api.instance?.isPanning) {
        zoomAnchorRef.current = null;
        return;
      }

      const rect = wrapper.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      zoomAnchorRef.current = {
        worldX: (screenX - positionX) / scale,
        worldY: (screenY - positionY) / scale,
        screenX,
        screenY,
      };
    };

    window.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => window.removeEventListener("wheel", onWheel, true);
  }, [enabled, transformRef]);

  useEffect(() => {
    if (!enabled) return;

    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const api = transformRef.current;
      if (!api?.instance) return;

      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      const isPanning = Boolean(api.instance.isPanning);

      // Pan just ended — if a zoom is pending, re-anchor on viewport center
      // so the deferred scale change applies cleanly.
      if (wasPanningRef.current && !isPanning) {
        const { scale, positionX, positionY } = api.state;
        targetScaleRef.current = clamp(
          targetScaleRef.current,
          minScaleRef.current,
          MAX_SCALE,
        );
        if (Math.abs(targetScaleRef.current - scale) > 0.0004) {
          const wrapper = api.instance.wrapperComponent;
          if (wrapper) {
            const rect = wrapper.getBoundingClientRect();
            const screenX = rect.width * 0.5;
            const screenY = rect.height * 0.5;
            zoomAnchorRef.current = {
              worldX: (screenX - positionX) / scale,
              worldY: (screenY - positionY) / scale,
              screenX,
              screenY,
            };
          }
        }
      }
      wasPanningRef.current = isPanning;

      // Never fight the library during an active drag.
      if (isPanning) {
        // Drop cursor anchor so a mid-pan setTransform can't resume later
        // with a stale screen lock from before the drag.
        zoomAnchorRef.current = null;
        notifyScale(api.state.scale);
        return;
      }

      const { scale, positionX, positionY } = api.state;
      let nextScale = scale;
      let nextX = positionX;
      let nextY = positionY;
      let dirty = false;

      const keys = keysRef.current;
      const dx = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
      const dy = (keys.s ? 1 : 0) - (keys.w ? 1 : 0);
      if (dx !== 0 || dy !== 0) {
        const len = Math.hypot(dx, dy) || 1;
        const speed = PAN_SPEED * scale * dt;
        nextX -= (dx / len) * speed;
        nextY -= (dy / len) * speed;
        dirty = true;
        // Keyboard pan while zooming: keep world anchor, update screen lock
        // so the zoom point stays under the original wheel pixel.
      }

      const target = targetScaleRef.current;
      if (Math.abs(target - scale) > 0.0004) {
        nextScale = scale + (target - scale) * ZOOM_LERP;
        if (Math.abs(target - nextScale) < 0.0004) nextScale = target;

        const anchor = zoomAnchorRef.current;
        if (anchor) {
          // Fixed screen point from the wheel event (stable; no reconstruct).
          nextX = anchor.screenX - anchor.worldX * nextScale;
          nextY = anchor.screenY - anchor.worldY * nextScale;
        }
        dirty = true;

        if (nextScale === target) {
          zoomAnchorRef.current = null;
        }
      } else if (zoomAnchorRef.current) {
        zoomAnchorRef.current = null;
      }

      if (dirty) {
        api.setTransform(nextX, nextY, nextScale, 0);
        notifyScale(nextScale);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled, transformRef]);

  return {
    minScale,
    maxScale: MAX_SCALE,
    syncTargetScale: (scale: number) => {
      targetScaleRef.current = clamp(scale, minScaleRef.current, MAX_SCALE);
      lastNotifiedScaleRef.current = scale;
      // External sync (init / pinch) should not keep a stale wheel anchor.
      zoomAnchorRef.current = null;
    },
  };
}
