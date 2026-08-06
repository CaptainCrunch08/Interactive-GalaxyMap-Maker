import { useEffect, useState } from "react";
import {
  legendSwatch,
  TERRAIN_KIND_LABELS,
  TERRAIN_KIND_ORDER,
  type TerrainKind,
} from "../../lib/planetTerrain";
import { fillAllTileTerrain } from "../../lib/terrainGenerate";
import type { PlanetClassification } from "../../types/campaign";

type SelectAllTilesDialogProps = {
  open: boolean;
  classification: PlanetClassification;
  initialKind?: TerrainKind | null;
  onCancel: () => void;
  onConfirm: (tileTerrain: Record<string, string>) => void;
};

export function SelectAllTilesDialog({
  open,
  classification,
  initialKind = null,
  onCancel,
  onConfirm,
}: SelectAllTilesDialogProps) {
  const [kind, setKind] = useState<TerrainKind>(
    initialKind && TERRAIN_KIND_ORDER.includes(initialKind)
      ? initialKind
      : "wasteland",
  );

  useEffect(() => {
    if (!open) return;
    if (initialKind && TERRAIN_KIND_ORDER.includes(initialKind)) {
      setKind(initialKind);
    }
  }, [open, initialKind]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-void/75"
      role="dialog"
      aria-modal="true"
      aria-labelledby="select-all-tiles-title"
    >
      <div className="hud-panel w-full max-w-sm max-h-[min(92vh,640px)] overflow-y-auto p-4 shadow-xl space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2
              id="select-all-tiles-title"
              className="font-display text-sm text-cyan uppercase tracking-[0.14em]"
            >
              Select all
            </h2>
            <p className="text-[11px] text-muted mt-1 leading-relaxed">
              Cover every hex on this world with one tile type.
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

        <div className="flex flex-wrap gap-1">
          {TERRAIN_KIND_ORDER.map((k) => (
            <button
              key={k}
              type="button"
              className={`hud-btn flex items-center gap-1.5 ${
                kind === k ? "hud-btn-active" : ""
              }`}
              onClick={() => setKind(k)}
            >
              <span
                className="inline-block w-2.5 h-2.5 rounded-sm border border-white/20"
                style={{ background: legendSwatch(k, classification) }}
              />
              {TERRAIN_KIND_LABELS[k]}
            </button>
          ))}
        </div>

        <div className="flex gap-2 pt-1">
          <button type="button" className="hud-btn flex-1" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="hud-btn hud-btn-active flex-1"
            onClick={() => onConfirm(fillAllTileTerrain(kind))}
          >
            Apply {TERRAIN_KIND_LABELS[kind]}
          </button>
        </div>
      </div>
    </div>
  );
}
