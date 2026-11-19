import type { Faction, ModelCategoryId } from "../types/campaign";
import {
  DEFAULT_MODEL_CATEGORY,
  MODEL_CATEGORY_IDS,
  formatLoreCount,
  loreFromModels,
  resolveModelCategory,
  type ModelCountDraft,
} from "../lib/modelCasualties";

type Props = {
  title: string;
  accent?: string;
  faction?: Faction | null;
  models: ModelCountDraft;
  onChange: (category: ModelCategoryId, value: string) => void;
};

/**
 * Vertical casualty rows: category (left) · model count · lore deaths (right).
 */
export function BattleCasualtiesEditor({
  title,
  accent,
  faction,
  models,
  onChange,
}: Props) {
  let loreTotal = 0;
  for (const id of MODEL_CATEGORY_IDS) {
    const raw = models[id]?.trim() ?? "";
    const n = raw === "" ? 0 : Number(raw);
    if (!Number.isFinite(n) || n <= 0) continue;
    const { multiplier } = resolveModelCategory(faction, id);
    loreTotal += loreFromModels(n, multiplier);
  }

  return (
    <div
      className="rounded border px-3 py-2.5 space-y-2"
      style={{ borderColor: accent ? `${accent}66` : undefined }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-display uppercase tracking-wider text-[10px] text-muted">
          {title}
        </p>
        <p className="text-[10px] tabular-nums text-brass shrink-0">
          Lore {formatLoreCount(loreTotal)}
        </p>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_4.5rem_minmax(4.5rem,auto)] gap-x-2 gap-y-1.5 items-center">
        <span className="text-[9px] uppercase tracking-wider text-muted">
          Category
        </span>
        <span className="text-[9px] uppercase tracking-wider text-muted text-center">
          Models
        </span>
        <span className="text-[9px] uppercase tracking-wider text-muted text-right">
          Lore deaths
        </span>
        {MODEL_CATEGORY_IDS.map((id) => {
          const { label, multiplier } = resolveModelCategory(faction, id);
          const raw = models[id] ?? "";
          const n = raw.trim() === "" ? 0 : Number(raw);
          const modelsN = Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
          const lore = loreFromModels(modelsN, multiplier);
          const defaultMult = DEFAULT_MODEL_CATEGORY[id].multiplier;
          return (
            <div key={id} className="contents">
              <div className="min-w-0">
                <p className="text-xs text-star truncate" title={label}>
                  {label}
                </p>
                <p className="text-[9px] text-muted tabular-nums">
                  ×{multiplier}
                  {multiplier !== defaultMult ? " (custom)" : ""}
                </p>
              </div>
              <input
                className="hud-input w-full text-center text-sm tabular-nums py-1"
                inputMode="numeric"
                value={raw}
                placeholder="0"
                aria-label={`${label} models killed`}
                onChange={(e) => onChange(id, e.target.value)}
              />
              <p className="text-xs tabular-nums text-muted text-right">
                {formatLoreCount(lore)}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
