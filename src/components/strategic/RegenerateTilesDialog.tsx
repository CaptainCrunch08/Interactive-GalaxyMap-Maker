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
  onCancel: () => void;
  onConfirm: (tileTerrain: Record<string, string>) => void;
};

export function RegenerateTilesDialog({
  open,
  classification,
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

  const setPercent = (kind: TerrainKind, raw: string) => {
    const n = Math.max(0, Math.min(100, Number(raw) || 0));
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
      <div className="hud-panel w-full max-w-md max-h-[min(92vh,720px)] overflow-y-auto p-4 shadow-xl space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2
              id="regen-tiles-title"
              className="font-display text-sm text-cyan uppercase tracking-[0.14em]"
            >
              Regenerate tiles
            </h2>
            <p className="text-[11px] text-muted mt-1 leading-relaxed">
              Set a percentage for each tile type. Weights are normalized when
              generating — they do not need to sum to exactly 100.
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
              {total}
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

        <ul className="space-y-1.5">
          {TERRAIN_KIND_ORDER.map((kind) => (
            <li
              key={kind}
              className="flex items-center gap-2 text-xs"
            >
              <span
                className="inline-block w-2.5 h-2.5 rounded-sm border border-white/20 shrink-0"
                style={{ background: legendSwatch(kind, classification) }}
              />
              <span className="flex-1 text-star truncate">
                {TERRAIN_KIND_LABELS[kind]}
              </span>
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                className="hud-input w-16 text-right tabular-nums"
                value={percents[kind] ?? 0}
                onChange={(e) => setPercent(kind, e.target.value)}
                aria-label={`${TERRAIN_KIND_LABELS[kind]} percent`}
              />
              <span className="text-muted w-3">%</span>
            </li>
          ))}
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
              onConfirm(generateTileTerrainByPercents(percents))
            }
          >
            Generate
          </button>
        </div>
      </div>
    </div>
  );
}
