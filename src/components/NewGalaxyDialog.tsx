import { useState } from "react";
import { GALAXY_MAP_SIZE, SIZE_SYSTEM_COUNT } from "../lib/generateGalaxy";
import type { GalaxySize } from "../lib/generateGalaxy";
import type { TerritoryMode } from "../types/campaign";

type Step = "method" | "size" | "territory";

export type NewGalaxyOptions =
  | { kind: "empty"; territoryMode: TerritoryMode }
  | { kind: "generated"; size: GalaxySize; territoryMode: TerritoryMode };

type NewGalaxyDialogProps = {
  open: boolean;
  onCancel: () => void;
  onConfirm: (options: NewGalaxyOptions) => void;
};

export function NewGalaxyDialog({
  open,
  onCancel,
  onConfirm,
}: NewGalaxyDialogProps) {
  const [step, setStep] = useState<Step>("method");
  const [size, setSize] = useState<GalaxySize>("medium");
  const [pendingKind, setPendingKind] = useState<"empty" | "generated">(
    "generated",
  );
  const [territoryMode, setTerritoryMode] =
    useState<TerritoryMode>("soi");

  if (!open) return null;

  const resetAnd = (fn: () => void) => {
    fn();
    setStep("method");
    setSize("medium");
    setPendingKind("generated");
    setTerritoryMode("soi");
  };

  const goTerritory = (kind: "empty" | "generated") => {
    setPendingKind(kind);
    setStep("territory");
  };

  const confirm = () => {
    resetAnd(() => {
      if (pendingKind === "empty") {
        onConfirm({ kind: "empty", territoryMode });
      } else {
        onConfirm({ kind: "generated", size, territoryMode });
      }
    });
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-void/75"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-galaxy-title"
    >
      <div className="hud-panel w-full max-w-sm p-4 shadow-xl space-y-4">
        <div className="flex items-start justify-between gap-3">
          <h2
            id="new-galaxy-title"
            className="font-display text-sm text-cyan uppercase tracking-[0.14em]"
          >
            New galaxy map
          </h2>
          <button
            type="button"
            className="text-muted hover:text-cyan text-lg leading-none px-1"
            onClick={() => resetAnd(onCancel)}
            aria-label="Cancel"
          >
            ×
          </button>
        </div>

        {step === "method" ? (
          <>
            <p className="text-xs text-muted leading-relaxed">
              Generate stars automatically, or start empty and place each system
              yourself.
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                className="hud-btn hud-btn-active w-full"
                onClick={() => setStep("size")}
              >
                Generate a galaxy
              </button>
              <button
                type="button"
                className="hud-btn w-full"
                onClick={() => goTerritory("empty")}
              >
                Empty map — place stars manually
              </button>
            </div>
          </>
        ) : step === "size" ? (
          <>
            <p className="text-xs text-muted leading-relaxed">
              How large should the generated galaxy be? The map border scales
              with your choice.
            </p>
            <div className="flex flex-col gap-2">
              {(
                [
                  ["small", "Small"],
                  ["medium", "Medium"],
                  ["large", "Large"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={`hud-btn w-full text-left ${
                    size === value ? "hud-btn-active" : ""
                  }`}
                  onClick={() => setSize(value)}
                >
                  <span className="font-display uppercase tracking-wider text-[11px]">
                    {label}
                  </span>
                  <span className="block text-[10px] text-muted mt-0.5">
                    ~{SIZE_SYSTEM_COUNT[value]} systems · map{" "}
                    {GALAXY_MAP_SIZE[value]}
                  </span>
                </button>
              ))}
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                className="hud-btn flex-1"
                onClick={() => setStep("method")}
              >
                Back
              </button>
              <button
                type="button"
                className="hud-btn hud-btn-active flex-1"
                onClick={() => goTerritory("generated")}
              >
                Next
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-xs text-muted leading-relaxed">
              How should faction borders look? You can switch this later on an
              existing map.
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                className={`hud-btn w-full text-left ${
                  territoryMode === "soi" ? "hud-btn-active" : ""
                }`}
                onClick={() => setTerritoryMode("soi")}
              >
                <span className="font-display uppercase tracking-wider text-[11px]">
                  Spheres of influence
                </span>
                <span className="block text-[10px] text-muted mt-0.5">
                  Circles meeting at midpoints (as round as sectors get)
                </span>
              </button>
              <button
                type="button"
                className={`hud-btn w-full text-left ${
                  territoryMode === "voronoi" ? "hud-btn-active" : ""
                }`}
                onClick={() => setTerritoryMode("voronoi")}
              >
                <span className="font-display uppercase tracking-wider text-[11px]">
                  Sector tiles
                </span>
                <span className="block text-[10px] text-muted mt-0.5">
                  Clean Voronoi puzzle pieces from each star
                </span>
              </button>
              <button
                type="button"
                className={`hud-btn w-full text-left ${
                  territoryMode === "voronoi_soft" ? "hud-btn-active" : ""
                }`}
                onClick={() => setTerritoryMode("voronoi_soft")}
              >
                <span className="font-display uppercase tracking-wider text-[11px]">
                  Soft sectors
                </span>
                <span className="block text-[10px] text-muted mt-0.5">
                  Rounded tiles with empty gaps; same faction merges
                </span>
              </button>
              <button
                type="button"
                className={`hud-btn w-full text-left ${
                  territoryMode === "voronoi_shaky" ? "hud-btn-active" : ""
                }`}
                onClick={() => setTerritoryMode("voronoi_shaky")}
              >
                <span className="font-display uppercase tracking-wider text-[11px]">
                  Shaky sectors
                </span>
                <span className="block text-[10px] text-muted mt-0.5">
                  Voronoi tiles with organic wobble borders
                </span>
              </button>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                className="hud-btn flex-1"
                onClick={() =>
                  setStep(pendingKind === "generated" ? "size" : "method")
                }
              >
                Back
              </button>
              <button
                type="button"
                className="hud-btn hud-btn-active flex-1"
                onClick={confirm}
              >
                Create
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
