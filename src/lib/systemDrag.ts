/** Track live star-system drag so territory layers can defer expensive rebuilds. */

type Listener = () => void;

let depth = 0;
const listeners = new Set<Listener>();

function notify() {
  for (const fn of listeners) fn();
}

export function beginSystemDrag(): void {
  depth += 1;
  if (depth === 1) notify();
}

export function endSystemDrag(): void {
  if (depth <= 0) return;
  depth -= 1;
  if (depth === 0) notify();
}

export function isSystemDragging(): boolean {
  return depth > 0;
}

export function subscribeSystemDrag(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
