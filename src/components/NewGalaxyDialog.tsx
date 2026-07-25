import { useState } from "react";
import { GALAXY_MAP_SIZE, SIZE_SYSTEM_COUNT } from "../lib/generateGalaxy";
import type { GalaxySize } from "../lib/generateGalaxy";

type Step = "method" | "size";

type NewGalaxyDialogProps = {
  open: boolean;
  onCancel: () => void;
  onConfirm: (options: { kind: "empty" } | { kind: "generated"; size: GalaxySize }) => void;
};

export function NewGalaxyDialog({
  open,
  onCancel,
  onConfirm,
}: NewGalaxyDialogProps) {
  const [step, setStep] = useState<Step>("method");
  const [size, setSize] = useState<GalaxySize>("medium");

  if (!open) return null;

  const resetAnd = (fn: () => void) => {
    fn();
    setStep("method");
    setSize("medium");
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
                onClick={() => resetAnd(() => onConfirm({ kind: "empty" }))}
              >
                Empty map — place stars manually
              </button>
            </div>
          </>
        ) : (
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
                onClick={() =>
                  resetAnd(() => onConfirm({ kind: "generated", size }))
                }
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
