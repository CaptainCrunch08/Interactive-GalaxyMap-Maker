/**
 * Ask the user to name a Custom selection.
 * Returns null if they cancel or submit an empty name.
 */
export function promptCustomLabel(
  noun: string,
  current?: string,
): string | null {
  if (typeof window === "undefined") return null;
  const raw = window.prompt(
    `What is this custom ${noun}?`,
    current?.trim() ?? "",
  );
  if (raw == null) return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}
