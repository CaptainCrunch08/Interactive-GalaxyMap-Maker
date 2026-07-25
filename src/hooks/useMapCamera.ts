import { useEffect, useRef, useState } from "react";
import type { ReactZoomPanPinchRef } from "react-zoom-pan-pinch";
import { GALAXY_SIZE } from "../types/campaign";

const MAX_SCALE = 2.5;
/** Absolute floor so tiny windows still behave. */
const ABSOLUTE_MIN_SCALE = 0.02;
/** Leave a little margin around the map when fully zoomed out. */
const FIT_PADDING = 0.92;
const ZOOM_LERP = 0.14;
const ZOOM_SENSITIVITY = 0.0011;
/** Base pan speed (px/sec) at scale 1. Multiplied by scale so zoomed-out is slower. */
const PAN_SPEED = 462;

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
  // Uniform fit against the square map size on both axes
  const fit = (Math.min(width, height) / worldSize) * FIT_PADDING;
  return clamp(fit, ABSOLUTE_MIN_SCALE, MAX_SCALE);
}

/**
 * Stellaris-style continuous camera: WASD pan + eased wheel zoom toward cursor.
 * Min zoom is computed so the entire map can fit on screen.
 */
export function useMapCamera(
  transformRef: React.RefObject<ReactZoomPanPinchRef | null>,
  enabled: boolean,
  onScaleChange?: (scale: number) => void,
  worldSize: number = GALAXY_SIZE,
) {
  const keysRef = useRef({ w: false, a: false, s: false, d: false });
  const targetScaleRef = useRef(0.45);
  const zoomAnchorRef = useRef<{ x: number; y: number } | null>(null);
  const minScaleRef = useRef(ABSOLUTE_MIN_SCALE);
  const worldSizeRef = useRef(worldSize);
  worldSizeRef.current = worldSize;
  const [minScale, setMinScale] = useState(ABSOLUTE_MIN_SCALE);
  const onScaleChangeRef = useRef(onScaleChange);
  onScaleChangeRef.current = onScaleChange;

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

    // Wrapper may not exist on first paint — retry briefly
    const retry = window.setTimeout(updateMinScale, 50);
    const retry2 = window.setTimeout(updateMinScale, 200);

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

      const rect = wrapper.getBoundingClientRect();
      const { scale, positionX, positionY } = api.state;
      if (Math.abs(targetScaleRef.current - scale) < 0.0001) {
        targetScaleRef.current = scale;
      }

      const floor = minScaleRef.current;
      const factor = Math.exp(-e.deltaY * ZOOM_SENSITIVITY);
      targetScaleRef.current = clamp(
        targetScaleRef.current * factor,
        floor,
        MAX_SCALE,
      );

      const cursorX = e.clientX - rect.left;
      const cursorY = e.clientY - rect.top;
      zoomAnchorRef.current = {
        x: (cursorX - positionX) / scale,
        y: (cursorY - positionY) / scale,
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
      if (!api) return;

      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

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
        // Slower when zoomed out, faster when zoomed in
        const speed = PAN_SPEED * scale * dt;
        nextX -= (dx / len) * speed;
        nextY -= (dy / len) * speed;
        dirty = true;
      }

      const target = targetScaleRef.current;
      if (Math.abs(target - scale) > 0.0004) {
        nextScale = scale + (target - scale) * ZOOM_LERP;
        if (Math.abs(target - nextScale) < 0.0004) nextScale = target;

        const anchor = zoomAnchorRef.current;
        if (anchor) {
          // Keep the anchored world point fixed on screen while easing zoom
          const cursorX = anchor.x * scale + positionX;
          const cursorY = anchor.y * scale + positionY;
          nextX = cursorX - anchor.x * nextScale;
          nextY = cursorY - anchor.y * nextScale;
        }
        dirty = true;
      }

      if (dirty) {
        api.setTransform(nextX, nextY, nextScale, 0);
        onScaleChangeRef.current?.(nextScale);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled, transformRef]);

  return {
    minScale,
    maxScale: MAX_SCALE,
    syncTargetScale: (scale: number) => {
      targetScaleRef.current = scale;
    },
  };
}
