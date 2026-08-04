import { useRef, useState } from "react";
import {
  FACTION_ARMY_TYPE_LABELS,
  FACTION_ARMY_TYPE_ORDER,
  type FactionArmyType,
} from "../../types/campaign";
import { getSymbolCatalog } from "../../lib/symbolCatalog";
import {
  factionSymbolIds,
  symbolOwnerMap,
} from "../../lib/factionSymbols";
import { useCampaignStore } from "../../store/useCampaignStore";

const inputClass = "hud-input";

export function EditGalaxyFactionsPanel() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [importForFactionId, setImportForFactionId] = useState<string | null>(
    null,
  );
  const campaign = useCampaignStore((s) => s.campaign);
  const addFaction = useCampaignStore((s) => s.addFaction);
  const updateFaction = useCampaignStore((s) => s.updateFaction);
  const deleteFaction = useCampaignStore((s) => s.deleteFaction);
  const addSymbol = useCampaignStore((s) => s.addSymbol);
  const updateSymbol = useCampaignStore((s) => s.updateSymbol);
  const deleteSymbol = useCampaignStore((s) => s.deleteSymbol);
  const assignFactionSymbol = useCampaignStore((s) => s.assignFactionSymbol);
  const unassignFactionSymbol = useCampaignStore(
    (s) => s.unassignFactionSymbol,
  );
  const setFactionPrimarySymbol = useCampaignStore(
    (s) => s.setFactionPrimarySymbol,
  );
  const catalog = getSymbolCatalog();
  const owners = symbolOwnerMap(campaign.factions);

  const applyCatalogSymbol = (factionId: string, catalogKey: string) => {
    const entry = catalog.find((c) => c.catalogKey === catalogKey);
    if (!entry) return;
    const existing = (campaign.symbols ?? []).find(
      (s) => s.name === entry.name && s.imageDataUrl === entry.imageDataUrl,
    );
    const ownerOfExisting = existing
      ? owners.get(existing.id)
      : undefined;
    if (existing && ownerOfExisting && ownerOfExisting !== factionId) {
      alert(
        `“${entry.name}” is already assigned to another faction. Unassign it there first, or import a copy.`,
      );
      return;
    }
    const symbolId =
      existing?.id ?? addSymbol(entry.name, entry.imageDataUrl);
    const faction = campaign.factions.find((f) => f.id === factionId);
    const asPrimary =
      !faction?.defaultSymbolId ||
      factionSymbolIds(faction).length === 0;
    assignFactionSymbol(factionId, symbolId, asPrimary);
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-sm text-cyan uppercase tracking-[0.14em]">
            Factions
          </h3>
          <p className="text-xs text-muted mt-1">
            Create factions, set colors, army types, and symbols. Each symbol
            can belong to only one faction; mark one as the primary emblem.
          </p>
        </div>
        <button
          type="button"
          className="hud-btn"
          onClick={() => addFaction()}
        >
          + Add faction
        </button>
      </div>

      {campaign.factions.length === 0 ? (
        <p className="text-sm text-muted">No factions yet.</p>
      ) : (
        <ul className="space-y-4 max-w-3xl">
          {campaign.factions.map((f) => {
            const ownedIds = factionSymbolIds(f);
            const owned = ownedIds
              .map((id) => (campaign.symbols ?? []).find((s) => s.id === id))
              .filter(Boolean);
            const unowned = (campaign.symbols ?? []).filter(
              (s) => !owners.has(s.id),
            );
            return (
              <li
                key={f.id}
                className="hud-panel p-4 space-y-3 border border-panel-border"
              >
                <div className="flex gap-3 items-center">
                  <input
                    type="color"
                    className="w-10 h-10 rounded cursor-pointer border-0 bg-transparent shrink-0"
                    value={f.color}
                    onChange={(e) =>
                      updateFaction(f.id, { color: e.target.value })
                    }
                    title="Faction color"
                  />
                  <input
                    className={inputClass + " flex-1"}
                    value={f.name}
                    onChange={(e) =>
                      updateFaction(f.id, { name: e.target.value })
                    }
                  />
                  <button
                    type="button"
                    className="text-xs text-crimson shrink-0 hud-btn"
                    onClick={() => {
                      if (
                        confirm(
                          `Delete faction “${f.name}”? Ownership and armies for this faction will be cleared.`,
                        )
                      ) {
                        deleteFaction(f.id);
                      }
                    }}
                  >
                    Delete
                  </button>
                </div>

                <label className="block text-[10px] uppercase tracking-wider text-muted">
                  Leader
                  <input
                    className={inputClass + " mt-1"}
                    value={f.leader ?? ""}
                    placeholder="Named commander or sovereign"
                    onChange={(e) =>
                      updateFaction(f.id, { leader: e.target.value })
                    }
                  />
                </label>

                <label className="block text-[10px] uppercase tracking-wider text-muted">
                  Army type
                  <select
                    className={inputClass + " mt-1"}
                    value={f.armyType ?? "infantry"}
                    onChange={(e) =>
                      updateFaction(f.id, {
                        armyType: e.target.value as FactionArmyType,
                      })
                    }
                  >
                    {FACTION_ARMY_TYPE_ORDER.map((t) => (
                      <option key={t} value={t}>
                        {FACTION_ARMY_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </label>

                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted mb-2">
                    Faction symbols
                  </p>
                  {owned.length === 0 ? (
                    <p className="text-xs text-muted mb-2">
                      No symbols assigned. Pick from the catalog or library
                      below.
                    </p>
                  ) : (
                    <ul className="space-y-2 mb-3">
                      {owned.map((sym) => {
                        if (!sym) return null;
                        const isPrimary = f.defaultSymbolId === sym.id;
                        return (
                          <li
                            key={sym.id}
                            className={`flex items-center gap-2 rounded border p-1.5 ${
                              isPrimary
                                ? "border-cyan/70 bg-cyan/5"
                                : "border-panel-border/80"
                            }`}
                          >
                            <img
                              src={sym.imageDataUrl}
                              alt=""
                              className="w-9 h-9 object-contain rounded bg-void/60 border border-panel-border"
                            />
                            <span className="text-xs text-star flex-1 truncate">
                              {sym.name}
                              {isPrimary ? (
                                <span className="text-cyan ml-2 uppercase tracking-wider text-[9px]">
                                  Primary
                                </span>
                              ) : null}
                            </span>
                            {!isPrimary && (
                              <button
                                type="button"
                                className="hud-btn text-[10px] shrink-0"
                                onClick={() =>
                                  setFactionPrimarySymbol(f.id, sym.id)
                                }
                              >
                                Set primary
                              </button>
                            )}
                            <button
                              type="button"
                              className="text-xs text-muted shrink-0"
                              title="Remove from faction"
                              onClick={() =>
                                unassignFactionSymbol(f.id, sym.id)
                              }
                            >
                              Remove
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  {unowned.length > 0 && (
                    <label className="block text-[10px] uppercase tracking-wider text-muted mb-2">
                      Assign from library
                      <select
                        className={inputClass + " mt-1"}
                        value=""
                        onChange={(e) => {
                          const id = e.target.value;
                          if (!id) return;
                          assignFactionSymbol(
                            f.id,
                            id,
                            ownedIds.length === 0,
                          );
                        }}
                      >
                        <option value="">Choose unassigned symbol…</option>
                        {unowned.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>

                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted mb-2">
                    Symbol catalog
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {catalog.map((c) => {
                      const existing = (campaign.symbols ?? []).find(
                        (s) =>
                          s.name === c.name &&
                          s.imageDataUrl === c.imageDataUrl,
                      );
                      const takenBy =
                        existing && owners.get(existing.id) !== f.id
                          ? campaign.factions.find(
                              (x) => x.id === owners.get(existing.id),
                            )?.name
                          : undefined;
                      const alreadyOwned =
                        existing && owners.get(existing.id) === f.id;
                      return (
                        <button
                          key={c.catalogKey}
                          type="button"
                          className={`w-11 h-11 rounded border bg-void/50 p-1 ${
                            alreadyOwned
                              ? "border-cyan"
                              : takenBy
                                ? "border-panel-border opacity-40 cursor-not-allowed"
                                : "border-panel-border hover:border-cyan"
                          }`}
                          title={
                            takenBy
                              ? `${c.name} (used by ${takenBy})`
                              : alreadyOwned
                                ? `${c.name} (assigned)`
                                : c.name
                          }
                          disabled={Boolean(takenBy)}
                          onClick={() =>
                            applyCatalogSymbol(f.id, c.catalogKey)
                          }
                        >
                          <img
                            src={c.imageDataUrl}
                            alt={c.name}
                            className="w-full h-full object-contain"
                          />
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      className="hud-btn h-11"
                      onClick={() => {
                        setImportForFactionId(f.id);
                        fileRef.current?.click();
                      }}
                    >
                      Import…
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <section className="max-w-3xl space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-sm text-cyan uppercase tracking-[0.14em]">
            Symbol library
          </h3>
          <button
            type="button"
            className="hud-btn"
            onClick={() => {
              setImportForFactionId(null);
              fileRef.current?.click();
            }}
          >
            + Import symbol
          </button>
        </div>
        <p className="text-xs text-muted">
          PNG, JPEG, WebP, or SVG — max 512 KB. Images are normalized to 128×128.
          Symbols assigned to a faction cannot be used by another.
        </p>
        {(campaign.symbols ?? []).length === 0 ? (
          <p className="text-xs text-muted">No imported symbols yet.</p>
        ) : (
          <ul className="space-y-2">
            {(campaign.symbols ?? []).map((sym) => {
              const ownerId = owners.get(sym.id);
              const owner = campaign.factions.find((f) => f.id === ownerId);
              return (
                <li
                  key={sym.id}
                  className="flex items-center gap-2 rounded border border-panel-border/80 p-1.5"
                >
                  <img
                    src={sym.imageDataUrl}
                    alt=""
                    className="w-9 h-9 object-contain rounded bg-void/60 border border-panel-border"
                  />
                  <input
                    className={inputClass + " flex-1"}
                    style={{ fontSize: "0.75rem" }}
                    value={sym.name}
                    onChange={(e) =>
                      updateSymbol(sym.id, { name: e.target.value })
                    }
                  />
                  <span className="text-[10px] text-muted shrink-0 max-w-[7rem] truncate">
                    {owner ? owner.name : "Unassigned"}
                  </span>
                  <button
                    type="button"
                    className="text-xs text-crimson shrink-0"
                    onClick={() => deleteSymbol(sym.id)}
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          void import("../../lib/symbolImport").then(
            async ({ importFactionSymbol }) => {
              try {
                const { name, imageDataUrl } = await importFactionSymbol(file);
                const id = addSymbol(name, imageDataUrl);
                if (importForFactionId) {
                  const faction = useCampaignStore
                    .getState()
                    .campaign.factions.find(
                      (x) => x.id === importForFactionId,
                    );
                  assignFactionSymbol(
                    importForFactionId,
                    id,
                    !faction || factionSymbolIds(faction).length === 0,
                  );
                }
              } catch (err) {
                alert(
                  err instanceof Error
                    ? err.message
                    : "Could not import that image.",
                );
              }
            },
          );
          e.target.value = "";
          setImportForFactionId(null);
        }}
      />
    </div>
  );
}
