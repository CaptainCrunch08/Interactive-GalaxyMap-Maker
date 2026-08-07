import { useEffect, useMemo, useState } from "react";
import {
  legendSwatch,
  TERRAIN_KIND_LABELS,
  TERRAIN_KIND_ORDER,
  type TerrainKind,
} from "../../lib/planetTerrain";
import {
  equalTerrainPercents,
  generateTileTerrainByPercents,
  sumTerrainPercents,
} from "../../lib/terrainGenerate";
import type { PlanetClassification } from "../../types/campaign";

type RegenerateTilesDialogProps = {
  open: boolean;
  classification: PlanetClassification;
  /** City / district / structure tiles to keep off ocean/lava/toxic. */
  reservedTiles?: number[];
  /** City hub tiles — prefer urban. */
  cityHubTiles?: number[];
  onCancel: () => void;
  onConfirm: (tileTerrain: Record<string, string>) => void;
};

export function RegenerateTilesDialog({
  open,
  classification,
  reservedTiles = [],
  cityHubTiles = [],
  onCancel,
  onConfirm,
}: RegenerateTilesDialogProps) {
  const [percents, setPercents] = useState<Record<TerrainKind, number>>(
    equalTerrainPercents,
  );

  useEffect(() => {
    if (open) setPercents(equalTerrainPercents());
  }, [open]);

  const total = useMemo(() => sumTerrainPercents(percents), [percents]);
  const valid = total > 0;

  if (!open) return null;

  const setPercent = (kind: TerrainKind, value: number) => {
    const n = Math.max(0, Math.min(100, Math.round(value)));
    setPercents((prev) => ({ ...prev, [kind]: n }));
  };

  const normalizeTo100 = () => {
    const sum = sumTerrainPercents(percents);
    if (sum <= 0) {
      setPercents(equalTerrainPercents());
      return;
    }
    const next = { ...percents };
    let rem = 100;
    for (let i = 0; i < TERRAIN_KIND_ORDER.length; i++) {
      const kind = TERRAIN_KIND_ORDER[i]!;
      if (i === TERRAIN_KIND_ORDER.length - 1) {
        next[kind] = Math.max(0, rem);
      } else {
        const v = Math.round(((percents[kind] ?? 0) / sum) * 100);
        next[kind] = v;
        rem -= v;
      }
    }
    setPercents(next);
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-void/75"
      role="dialog"
      aria-modal="true"
      aria-labelledby="regen-tiles-title"
    >
      <div className="hud-panel w-full max-w-lg max-h-[min(92vh,760px)] overflow-y-auto p-4 shadow-xl space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2
              id="regen-tiles-title"
              className="font-display text-sm text-cyan uppercase tracking-[0.14em]"
            >
              Regenerate tiles
            </h2>
            <p className="text-[11px] text-muted mt-1 leading-relaxed">
              Higher % makes larger continuous regions (oceans, continents);
              lower % makes more scattered smaller patches (lakes, groves).
              Ice and tundra seed from the poles; jungle takes the equator
              before forest; agri/forest/jungle prefer coasts near water.
              Cities, districts, and structures stay on land (no ocean, lava,
              or chem spill). Weights need not sum to 100.
            </p>
          </div>
          <button
            type="button"
            className="text-muted hover:text-cyan text-lg leading-none px-1"
            onClick={onCancel}
            aria-label="Cancel"
          >
            ×
          </button>
        </div>

        <div className="flex items-center justify-between text-[10px] text-muted">
          <span>
            Total weight:{" "}
            <span className={total === 100 ? "text-cyan" : "text-brass"}>
              {total}%
            </span>
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              className="hud-btn"
              onClick={() => setPercents(equalTerrainPercents())}
            >
              Equal
            </button>
            <button type="button" className="hud-btn" onClick={normalizeTo100}>
              Normalize
            </button>
          </div>
        </div>

        <ul className="space-y-3">
          {TERRAIN_KIND_ORDER.map((kind) => {
            const label = TERRAIN_KIND_LABELS[kind];
            const color = legendSwatch(kind, classification);
            const value = percents[kind] ?? 0;
            const sliderId = `regen-tile-${kind}`;
            return (
              <li key={kind} className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block w-3.5 h-3.5 rounded-sm border border-white/25 shrink-0 shadow-sm"
                    style={{ background: color }}
                    title={label}
                    aria-hidden
                  />
                  <label
                    htmlFor={sliderId}
                    className="flex-1 text-xs text-star font-medium truncate"
                  >
                    {label}
                  </label>
                  <span className="text-[11px] text-cyan tabular-nums w-10 text-right">
                    {value}%
                  </span>
                </div>
                <input
                  id={sliderId}
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={value}
                  onChange={(e) => setPercent(kind, Number(e.target.value))}
                  className="hud-range w-full"
                  style={{
                    // Accent the filled track with the tile's own color.
                    accentColor: color,
                  }}
                  aria-label={`${label} tile percentage`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={value}
                  aria-valuetext={`${label} ${value} percent`}
                />
              </li>
            );
          })}
        </ul>

        <div className="flex gap-2 pt-1">
          <button type="button" className="hud-btn flex-1" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="hud-btn hud-btn-active flex-1"
            disabled={!valid}
            onClick={() =>
              onConfirm(
                generateTileTerrainByPercents(percents, undefined, undefined, {
                  reservedTiles,
                  cityHubTiles,
                }),
              )
            }
          >
            Generate
          </button>
        </div>
      </div>
    </div>
  );
}
