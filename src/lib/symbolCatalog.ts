/** Built-in faction / army symbol catalog (safe SVG data URLs). */

export type CatalogSymbol = {
  id: string;
  name: string;
  /** Stable catalog id used when copying into a campaign. */
  catalogKey: string;
  imageDataUrl: string;
};

function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function icon(inner: string): string {
  return svgDataUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="128" height="128">
      <rect width="64" height="64" rx="8" fill="#0a1018"/>
      <g fill="none" stroke="#e8f0f8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        ${inner}
      </g>
    </svg>`,
  );
}

const DEFS: { catalogKey: string; name: string; paths: string }[] = [
  {
    catalogKey: "skull",
    name: "Skull",
    paths: `<circle cx="32" cy="28" r="14"/><circle cx="26" cy="26" r="2" fill="#e8f0f8" stroke="none"/><circle cx="38" cy="26" r="2" fill="#e8f0f8" stroke="none"/><path d="M26 36h12M28 42v6M32 42v8M36 42v6"/>`,
  },
  {
    catalogKey: "cog",
    name: "Cog",
    paths: `<circle cx="32" cy="32" r="8"/><path d="M32 12v6M32 46v6M12 32h6M46 32h6M18 18l4 4M42 42l4 4M18 46l4-4M42 22l4-4"/>`,
  },
  {
    catalogKey: "eagle",
    name: "Eagle",
    paths: `<path d="M32 18l4 10 12 2-9 8 3 12-10-6-10 6 3-12-9-8 12-2z"/>`,
  },
  {
    catalogKey: "star",
    name: "Star",
    paths: `<path d="M32 10l5 14h14l-11 9 4 14-12-8-12 8 4-14-11-9h14z"/>`,
  },
  {
    catalogKey: "moon",
    name: "Crescent",
    paths: `<path d="M40 12a20 20 0 1 0 0 40 16 16 0 1 1 0-40z"/>`,
  },
  {
    catalogKey: "cross",
    name: "Cross",
    paths: `<path d="M32 12v40M16 28h32"/>`,
  },
  {
    catalogKey: "fist",
    name: "Fist",
    paths: `<path d="M22 36v-8h4v8h4v-10h4v10h4v-8h4v12c0 6-4 10-12 10s-12-4-12-10z"/><path d="M26 20h4v8h-4zM32 18h4v10h-4zM38 20h4v8h-4z"/>`,
  },
  {
    catalogKey: "flame",
    name: "Flame",
    paths: `<path d="M32 12c4 10-6 14-2 24 8-4 14-12 10-22 8 8 10 18 6 26-4 8-14 12-18 8-6-6-2-20 4-36z"/>`,
  },
  {
    catalogKey: "anchor",
    name: "Anchor",
    paths: `<circle cx="32" cy="16" r="4"/><path d="M32 20v28M20 36c0 10 24 10 24 0M18 48c8 6 20 6 28 0"/>`,
  },
  {
    catalogKey: "shield",
    name: "Shield",
    paths: `<path d="M32 10l18 6v14c0 12-8 20-18 24-10-4-18-12-18-24V16z"/>`,
  },
  {
    catalogKey: "blade",
    name: "Blade",
    paths: `<path d="M32 8l4 20v20l-4 8-4-8V28z"/><path d="M24 28h16"/>`,
  },
  {
    catalogKey: "ring",
    name: "Ringworld",
    paths: `<circle cx="32" cy="32" r="18"/><circle cx="32" cy="32" r="10"/><path d="M32 14v8M32 42v8M14 32h8M42 32h8"/>`,
  },
];

let cached: CatalogSymbol[] | null = null;

export function getSymbolCatalog(): CatalogSymbol[] {
  if (cached) return cached;
  cached = DEFS.map((d) => ({
    id: `catalog:${d.catalogKey}`,
    catalogKey: d.catalogKey,
    name: d.name,
    imageDataUrl: icon(d.paths),
  }));
  return cached;
}

export function findCatalogSymbol(catalogKey: string): CatalogSymbol | undefined {
  return getSymbolCatalog().find((s) => s.catalogKey === catalogKey);
}
