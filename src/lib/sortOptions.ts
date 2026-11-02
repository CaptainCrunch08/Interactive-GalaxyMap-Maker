/** Locale-aware A→Z compare for dropdown labels / names. */
export function compareByLabel(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

/** Keys of a label map, sorted by displayed label. */
export function keysSortedByLabel<T extends string>(
  labels: Record<T, string>,
  keys: readonly T[] = Object.keys(labels) as T[],
): T[] {
  return [...keys].sort((a, b) => compareByLabel(labels[a]!, labels[b]!));
}

/** Copy of items sorted by `.name`. */
export function sortedByName<T extends { name: string }>(
  items: readonly T[],
): T[] {
  return [...items].sort((a, b) => compareByLabel(a.name, b.name));
}
