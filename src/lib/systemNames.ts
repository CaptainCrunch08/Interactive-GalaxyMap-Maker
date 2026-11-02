/** Procedural star-system name parts (shared by galaxy gen and manual add). */
const NAME_A = [
  "Ash",
  "Black",
  "Crimson",
  "Dawn",
  "Ember",
  "Frost",
  "Ghost",
  "Hollow",
  "Iron",
  "Jade",
  "Kron",
  "Lumen",
  "Mire",
  "Null",
  "Obsidian",
  "Pale",
  "Quasar",
  "Rift",
  "Sable",
  "Thorn",
  "Umbral",
  "Void",
  "Wraith",
  "Xenos",
  "Yonder",
  "Zenith",
];

const NAME_B = [
  "reach",
  "gate",
  "march",
  "spire",
  "well",
  "deep",
  "flare",
  "hold",
  "crown",
  "wake",
  "shard",
  "veil",
  "forge",
  "haven",
  "exodus",
  "prime",
  "nexus",
  "cluster",
  "expanse",
  "terminus",
];

export function systemNameKey(name: string): string {
  return name.trim().toLowerCase();
}

function pick<T>(rng: () => number, list: T[]): T {
  return list[Math.floor(rng() * list.length)]!;
}

/**
 * Pick a procedural name not already in `used` (case-insensitive keys).
 * Mutates `used` to include the chosen key.
 */
export function allocateUniqueSystemName(
  used: Set<string>,
  rng: () => number = Math.random,
): string {
  for (let attempt = 0; attempt < 120; attempt++) {
    const name = `${pick(rng, NAME_A)} ${pick(rng, NAME_B)}`;
    const key = systemNameKey(name);
    if (!used.has(key)) {
      used.add(key);
      return name;
    }
  }
  let n = used.size + 1;
  while (used.has(systemNameKey(`System ${n}`))) n += 1;
  const fallback = `System ${n}`;
  used.add(systemNameKey(fallback));
  return fallback;
}

/** Build a used-name set from existing systems (case-insensitive). */
export function usedSystemNameKeys(
  names: Iterable<string>,
  ignoreName?: string,
): Set<string> {
  const ignore = ignoreName ? systemNameKey(ignoreName) : null;
  const used = new Set<string>();
  for (const name of names) {
    const key = systemNameKey(name);
    if (!key) continue;
    if (ignore && key === ignore) continue;
    used.add(key);
  }
  return used;
}

/**
 * Return `desired` if free; otherwise append a numeric suffix until unique.
 */
export function ensureUniqueSystemName(
  desired: string,
  existingNames: Iterable<string>,
  ignoreName?: string,
): string {
  const used = usedSystemNameKeys(existingNames, ignoreName);
  const base = desired.trim() || "System";
  if (!used.has(systemNameKey(base))) return base;
  for (let i = 2; i < 10_000; i++) {
    const candidate = `${base} ${i}`;
    if (!used.has(systemNameKey(candidate))) return candidate;
  }
  return `${base} ${Date.now().toString(36)}`;
}
