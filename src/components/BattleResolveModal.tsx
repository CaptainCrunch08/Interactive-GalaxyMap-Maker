import { useEffect, useMemo, useState } from "react";
import { useCampaignStore } from "../store/useCampaignStore";
import {
  armyStrength,
  classifyBattleVictory,
  eligibleSupportArmies,
  VICTORY_KIND_LABELS,
} from "../lib/battleResolve";
import {
  armyStrengthWithFortifications,
  combinedForceStrengthWithFortifications,
  describeFortificationBonus,
} from "../lib/fortificationBonus";
import { charactersOnArmies } from "../lib/characterLocation";
import { buildHexSphere } from "../lib/hexSphere";
import { uniqueFactionIdsFromArmies } from "../lib/battleSides";
import {
  buildSideParticipant,
  emptyModelCountDraft,
  totalLoreFromBreakdown,
  type ModelCountDraft,
} from "../lib/modelCasualties";
import { SETTLEMENT_HEX_FREQUENCY } from "../lib/settlements";
import { getFactionById } from "../lib/territory";
import {
  normalizeCampaignPlay,
  type BattleCharacterFate,
  type Army,
  type CampaignCharacter,
  type ModelCategoryId,
} from "../types/campaign";
import { BattleCasualtiesEditor } from "./BattleCasualtiesEditor";

type FactionModelsMap = Record<string, ModelCountDraft>;

function numOrEmpty(v: string): number {
  if (v.trim() === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toggleId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

const FATE_OPTIONS: { value: BattleCharacterFate; label: string }[] = [
  { value: "survived", label: "Survived" },
  { value: "deceased", label: "Died" },
  { value: "lost", label: "Lost" },
];

function SupportPicker({
  label,
  accent,
  candidates,
  selectedIds,
  onToggle,
}: {
  label: string;
  accent: string;
  candidates: Army[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}) {
  if (candidates.length === 0) {
    return (
      <div className="rounded border border-panel-border/60 px-3 py-2 text-[10px] text-muted">
        {label}: none adjacent
      </div>
    );
  }
  return (
    <div
      className="rounded border px-3 py-2 space-y-1.5"
      style={{ borderColor: `${accent}55` }}
    >
      <p className="font-display uppercase tracking-wider text-[10px] text-muted">
        {label}
      </p>
      <ul className="space-y-1">
        {candidates.map((a) => {
          const checked = selectedIds.includes(a.id);
          return (
            <li key={a.id}>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(a.id)}
                />
                <span className="truncate flex-1 text-star">{a.name}</span>
                <span className="tabular-nums text-muted shrink-0">
                  {armyStrength(a)}%
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function CharacterFateList({
  label,
  accent,
  characters,
  fates,
  onSetFate,
}: {
  label: string;
  accent: string;
  characters: CampaignCharacter[];
  fates: Record<string, BattleCharacterFate>;
  onSetFate: (id: string, fate: BattleCharacterFate) => void;
}) {
  if (characters.length === 0) {
    return (
      <div className="rounded border border-panel-border/60 px-3 py-2 text-[10px] text-muted">
        {label}: none present
      </div>
    );
  }
  return (
    <div
      className="rounded border px-3 py-2 space-y-2"
      style={{ borderColor: `${accent}55` }}
    >
      <p className="font-display uppercase tracking-wider text-[10px] text-muted">
        {label}
      </p>
      <ul className="space-y-2">
        {characters.map((c) => {
          const alreadyDead = c.status === "deceased";
          const fate = alreadyDead
            ? "deceased"
            : (fates[c.id] ?? "survived");
          return (
            <li key={c.id} className="space-y-1">
              <p className="text-xs text-star truncate">
                {c.name}
                {c.title.trim() ? (
                  <span className="text-muted"> · {c.title.trim()}</span>
                ) : null}
              </p>
              {alreadyDead ? (
                <p className="text-[10px]" style={{ color: "#e85a4f" }}>
                  Already deceased
                </p>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {FATE_OPTIONS.map((opt) => {
                    const active = fate === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        className={`hud-btn text-[10px] px-2 py-0.5 ${
                          active ? "hud-btn-active" : ""
                        }`}
                        onClick={() => onSetFate(c.id, opt.value)}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function BattleResolveModal() {
  const pending = useCampaignStore((s) => s.battleResolve);
  const campaign = useCampaignStore((s) => s.campaign);
  const closeBattleResolve = useCampaignStore((s) => s.closeBattleResolve);
  const resolveBattle = useCampaignStore((s) => s.resolveBattle);

  const [attackerVp, setAttackerVp] = useState("0");
  const [defenderVp, setDefenderVp] = useState("0");
  const [attackerModelsByFaction, setAttackerModelsByFaction] =
    useState<FactionModelsMap>({});
  const [defenderModelsByFaction, setDefenderModelsByFaction] =
    useState<FactionModelsMap>({});
  const [attackerLost, setAttackerLost] = useState("0");
  const [defenderLost, setDefenderLost] = useState("0");
  const [attackerSupportIds, setAttackerSupportIds] = useState<string[]>([]);
  const [defenderSupportIds, setDefenderSupportIds] = useState<string[]>([]);
  const [characterFates, setCharacterFates] = useState<
    Record<string, BattleCharacterFate>
  >({});
  const [favorite, setFavorite] = useState(false);
  const [description, setDescription] = useState("");

  const pendingKey = pending
    ? `${pending.planetId}:${pending.attackerArmyId}:${pending.defenderArmyId}`
    : "";

  useEffect(() => {
    if (!pendingKey) return;
    setAttackerVp("0");
    setDefenderVp("0");
    setAttackerModelsByFaction({});
    setDefenderModelsByFaction({});
    setAttackerLost("0");
    setDefenderLost("0");
    setAttackerSupportIds([]);
    setDefenderSupportIds([]);
    setCharacterFates({});
    setFavorite(false);
    setDescription("");
  }, [pendingKey]);

  const context = useMemo(() => {
    if (!pending) return null;
    const planet = campaign.planets.find((p) => p.id === pending.planetId);
    const attacker = planet?.armies?.find(
      (a) => a.id === pending.attackerArmyId,
    );
    const defender = planet?.armies?.find(
      (a) => a.id === pending.defenderArmyId,
    );
    if (!planet || !attacker || !defender) return null;

    const sphere = buildHexSphere(SETTLEMENT_HEX_FREQUENCY);
    const play = normalizeCampaignPlay(campaign.play);
    const acted = new Set(play.movedArmyIds);
    const supportCtx =
      planet.type === "warp_gate" ? planet.id : sphere;
    // Primaries are already committed to this fight; supports cannot have acted.
    const attackerSupports = eligibleSupportArmies(
      planet.armies,
      attacker,
      defender.id,
      supportCtx,
      acted,
      campaign.factions,
    );
    const defenderSupports = eligibleSupportArmies(
      planet.armies,
      defender,
      attacker.id,
      supportCtx,
      acted,
      campaign.factions,
    );

    return {
      planet,
      attacker,
      defender,
      attackerFaction: getFactionById(campaign, attacker.factionId),
      defenderFaction: getFactionById(campaign, defender.factionId),
      attackerSupports,
      defenderSupports,
    };
  }, [pending, campaign]);

  const selectedAtkSupports = useMemo(() => {
    if (!context) return [];
    return context.attackerSupports.filter((a) =>
      attackerSupportIds.includes(a.id),
    );
  }, [context, attackerSupportIds]);
  const selectedDefSupports = useMemo(() => {
    if (!context) return [];
    return context.defenderSupports.filter((a) =>
      defenderSupportIds.includes(a.id),
    );
  }, [context, defenderSupportIds]);

  const attackerFactionIds = useMemo(() => {
    if (!context) return [] as string[];
    return uniqueFactionIdsFromArmies(context.attacker, selectedAtkSupports);
  }, [context, selectedAtkSupports]);
  const defenderFactionIds = useMemo(() => {
    if (!context) return [] as string[];
    return uniqueFactionIdsFromArmies(context.defender, selectedDefSupports);
  }, [context, selectedDefSupports]);

  const atkFactionKey = attackerFactionIds.join("|");
  const defFactionKey = defenderFactionIds.join("|");
  useEffect(() => {
    if (attackerFactionIds.length === 0) return;
    setAttackerModelsByFaction((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const id of attackerFactionIds) {
        if (!next[id]) {
          next[id] = emptyModelCountDraft();
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [atkFactionKey, attackerFactionIds]);
  useEffect(() => {
    if (defenderFactionIds.length === 0) return;
    setDefenderModelsByFaction((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const id of defenderFactionIds) {
        if (!next[id]) {
          next[id] = emptyModelCountDraft();
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [defFactionKey, defenderFactionIds]);

  if (!pending || !context) return null;

  const attackerCharacters = charactersOnArmies(
    campaign.characters,
    context.planet.id,
    [context.attacker.id, ...selectedAtkSupports.map((a) => a.id)],
  ).filter((c) => c.status !== "deceased");
  const defenderCharacters = charactersOnArmies(
    campaign.characters,
    context.planet.id,
    [context.defender.id, ...selectedDefSupports.map((a) => a.id)],
  ).filter((c) => c.status !== "deceased");
  const presentCharacters = [...attackerCharacters, ...defenderCharacters];

  const atkCombined = combinedForceStrengthWithFortifications(
    context.planet,
    context.attacker,
    selectedAtkSupports,
  );
  const defCombined = combinedForceStrengthWithFortifications(
    context.planet,
    context.defender,
    selectedDefSupports,
  );
  const atkFort = describeFortificationBonus(
    context.planet,
    context.attacker,
  );
  const defFort = describeFortificationBonus(
    context.planet,
    context.defender,
  );

  const aVp = numOrEmpty(attackerVp);
  const dVp = numOrEmpty(defenderVp);
  const aLost = Math.max(0, Math.min(100, numOrEmpty(attackerLost)));
  const dLost = Math.max(0, Math.min(100, numOrEmpty(defenderLost)));

  const attackerParticipants = attackerFactionIds.map((factionId) =>
    buildSideParticipant(
      factionId,
      attackerModelsByFaction[factionId] ?? emptyModelCountDraft(),
      getFactionById(campaign, factionId),
    ),
  );
  const defenderParticipants = defenderFactionIds.map((factionId) =>
    buildSideParticipant(
      factionId,
      defenderModelsByFaction[factionId] ?? emptyModelCountDraft(),
      getFactionById(campaign, factionId),
    ),
  );
  const aCas = attackerParticipants.reduce(
    (sum, p) => sum + totalLoreFromBreakdown(p.casualtyBreakdown),
    0,
  );
  const dCas = defenderParticipants.reduce(
    (sum, p) => sum + totalLoreFromBreakdown(p.casualtyBreakdown),
    0,
  );

  const setAttackerModel = (
    factionId: string,
    id: ModelCategoryId,
    value: string,
  ) => {
    setAttackerModelsByFaction((prev) => ({
      ...prev,
      [factionId]: {
        ...(prev[factionId] ?? emptyModelCountDraft()),
        [id]: value,
      },
    }));
  };
  const setDefenderModel = (
    factionId: string,
    id: ModelCategoryId,
    value: string,
  ) => {
    setDefenderModelsByFaction((prev) => ({
      ...prev,
      [factionId]: {
        ...(prev[factionId] ?? emptyModelCountDraft()),
        [id]: value,
      },
    }));
  };

  let previewKind = classifyBattleVictory({
    attackerVp: aVp,
    defenderVp: dVp,
    attackerCombinedStrength: atkCombined,
    defenderCombinedStrength: defCombined,
    attackerStrengthLostPct: aLost,
    defenderStrengthLostPct: dLost,
    attackerCasualties: aCas,
    defenderCasualties: dCas,
  }).kind;
  const atkFactionLabel = attackerFactionIds
    .map((id) => getFactionById(campaign, id)?.name ?? "Unknown")
    .join(" / ");
  const defFactionLabel = defenderFactionIds
    .map((id) => getFactionById(campaign, id)?.name ?? "Unknown")
    .join(" / ");

  let previewVictor = "Draw";
  if (aVp > dVp) {
    previewVictor = atkFactionLabel || context.attacker.name;
  } else if (dVp > aVp) {
    previewVictor = defFactionLabel || context.defender.name;
  }

  const nextForce = (
    primary: Army,
    supports: Army[],
    lost: number,
  ) =>
    [primary, ...supports].map((a) => ({
      id: a.id,
      name: a.name,
      next: Math.round(
        armyStrengthWithFortifications(context.planet, a) * (1 - lost / 100),
      ),
    }));

  const nextAtk = nextForce(context.attacker, selectedAtkSupports, aLost);
  const nextDef = nextForce(context.defender, selectedDefSupports, dLost);

  const setFate = (id: string, fate: BattleCharacterFate) => {
    setCharacterFates((prev) => ({ ...prev, [id]: fate }));
  };

  const submit = () => {
    const characterOutcomes = presentCharacters.map((c) => ({
      characterId: c.id,
      fate: characterFates[c.id] ?? ("survived" as const),
    }));
    const killedCharacterIds = characterOutcomes
      .filter((o) => o.fate === "deceased")
      .map((o) => o.characterId);
    resolveBattle({
      attackerVp: aVp,
      defenderVp: dVp,
      attackerCasualties: aCas,
      defenderCasualties: dCas,
      attackerCasualtyBreakdown: attackerParticipants[0]?.casualtyBreakdown,
      defenderCasualtyBreakdown: defenderParticipants[0]?.casualtyBreakdown,
      attackerParticipants,
      defenderParticipants,
      attackerStrengthLostPct: aLost,
      defenderStrengthLostPct: dLost,
      attackerSupportArmyIds: attackerSupportIds,
      defenderSupportArmyIds: defenderSupportIds,
      killedCharacterIds,
      characterOutcomes,
      favorite,
      description,
    });
  };

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-void/80 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="battle-resolve-title"
    >
      <div className="hud-panel w-full max-w-3xl max-h-[min(92vh,900px)] overflow-y-auto border border-brass/50 p-5 space-y-4 shadow-xl">
        <div>
          <h2
            id="battle-resolve-title"
            className="font-display text-sm text-brass uppercase tracking-[0.16em]"
          >
            Resolve Battle
          </h2>
          <p className="text-xs text-muted mt-1">
            Play the game on the table, then enter the result for the engagement
            on <span className="text-star">{context.planet.name}</span>. Adjacent
            federation detachments can support and share the % lost (uses their
            turn).
          </p>
        </div>

        <label className="block text-[10px] uppercase tracking-wider text-muted">
          Battle description
          <textarea
            className="hud-input mt-1 w-full text-sm min-h-[5.5rem] resize-y"
            value={description}
            placeholder="Write the fight as it unfolds — turning points, heroics, aftermath…"
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div
            className="rounded border p-3 space-y-1"
            style={{
              borderColor: `${context.attackerFaction?.color ?? "#888"}66`,
            }}
          >
            <p className="font-display uppercase tracking-wider text-[10px] text-muted">
              Attacker
            </p>
            <p
              className="font-display truncate"
              style={{ color: context.attackerFaction?.color }}
            >
              {context.attacker.name}
            </p>
            <p className="text-muted truncate">
              {atkFactionLabel || "Unknown"} · STR{" "}
              {armyStrength(context.attacker)}%
              {atkFort ? ` (${atkFort})` : ""}
            </p>
            <p className="text-brass tabular-nums">
              Combined STR {atkCombined}
            </p>
          </div>
          <div
            className="rounded border p-3 space-y-1"
            style={{
              borderColor: `${context.defenderFaction?.color ?? "#888"}66`,
            }}
          >
            <p className="font-display uppercase tracking-wider text-[10px] text-muted">
              Defender
            </p>
            <p
              className="font-display truncate"
              style={{ color: context.defenderFaction?.color }}
            >
              {context.defender.name}
            </p>
            <p className="text-muted truncate">
              {defFactionLabel || "Unknown"} · STR{" "}
              {armyStrength(context.defender)}%
              {defFort ? ` (${defFort})` : ""}
            </p>
            <p className="text-brass tabular-nums">
              Combined STR {defCombined}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <SupportPicker
            label="Attacker supporting detachments"
            accent={context.attackerFaction?.color ?? "#c9a227"}
            candidates={context.attackerSupports}
            selectedIds={attackerSupportIds}
            onToggle={(id) =>
              setAttackerSupportIds((ids) => toggleId(ids, id))
            }
          />
          <SupportPicker
            label="Defender supporting detachments"
            accent={context.defenderFaction?.color ?? "#c9a227"}
            candidates={context.defenderSupports}
            selectedIds={defenderSupportIds}
            onToggle={(id) =>
              setDefenderSupportIds((ids) => toggleId(ids, id))
            }
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-[10px] uppercase tracking-wider text-muted">
            Attacker VP
            <input
              className="hud-input mt-1 w-full"
              inputMode="numeric"
              value={attackerVp}
              onChange={(e) => setAttackerVp(e.target.value)}
            />
          </label>
          <label className="block text-[10px] uppercase tracking-wider text-muted">
            Defender VP
            <input
              className="hud-input mt-1 w-full"
              inputMode="numeric"
              value={defenderVp}
              onChange={(e) => setDefenderVp(e.target.value)}
            />
          </label>
          <label className="block text-[10px] uppercase tracking-wider text-muted">
            Attacker force % lost
            <input
              className="hud-input mt-1 w-full"
              inputMode="numeric"
              value={attackerLost}
              onChange={(e) => setAttackerLost(e.target.value)}
            />
          </label>
          <label className="block text-[10px] uppercase tracking-wider text-muted">
            Defender force % lost
            <input
              className="hud-input mt-1 w-full"
              inputMode="numeric"
              value={defenderLost}
              onChange={(e) => setDefenderLost(e.target.value)}
            />
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-wider text-muted">
              Attacker casualties
              {attackerFactionIds.length > 1
                ? " · per faction"
                : ""}
            </p>
            {attackerFactionIds.map((factionId) => {
              const faction = getFactionById(campaign, factionId);
              return (
                <BattleCasualtiesEditor
                  key={factionId}
                  title={faction?.name ?? "Attacker"}
                  accent={faction?.color}
                  faction={faction}
                  models={
                    attackerModelsByFaction[factionId] ??
                    emptyModelCountDraft()
                  }
                  onChange={(id, value) =>
                    setAttackerModel(factionId, id, value)
                  }
                />
              );
            })}
          </div>
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-wider text-muted">
              Defender casualties
              {defenderFactionIds.length > 1
                ? " · per faction"
                : ""}
            </p>
            {defenderFactionIds.map((factionId) => {
              const faction = getFactionById(campaign, factionId);
              return (
                <BattleCasualtiesEditor
                  key={factionId}
                  title={faction?.name ?? "Defender"}
                  accent={faction?.color}
                  faction={faction}
                  models={
                    defenderModelsByFaction[factionId] ??
                    emptyModelCountDraft()
                  }
                  onChange={(id, value) =>
                    setDefenderModel(factionId, id, value)
                  }
                />
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(14rem,17rem)] gap-3 items-start">
          <div className="space-y-3">
            <div className="rounded border border-panel-border/80 bg-void/40 px-3 py-2 text-xs space-y-1">
              <p>
                Result:{" "}
                <span className="text-brass">
                  {VICTORY_KIND_LABELS[previewKind]}
                </span>
                {previewKind !== "draw" ? (
                  <>
                    {" "}
                    — <span className="text-star">{previewVictor}</span>
                  </>
                ) : null}
                {(previewKind === "heroic" || previewKind === "epochal") && (
                  <span className="text-muted">
                    {" "}
                    · Crossed swords will mark this site
                  </span>
                )}
              </p>
              <p className="text-muted">
                After battle — Attacker force:{" "}
                {nextAtk
                  .map(
                    (r) =>
                      `${r.name} ${Math.max(0, r.next)}%${
                        r.next <= 0 ? " (destroyed)" : ""
                      }`,
                  )
                  .join("; ")}
              </p>
              <p className="text-muted">
                After battle — Defender force:{" "}
                {nextDef
                  .map(
                    (r) =>
                      `${r.name} ${Math.max(0, r.next)}%${
                        r.next <= 0 ? " (destroyed)" : ""
                      }`,
                  )
                  .join("; ")}
              </p>
            </div>

            <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
              <input
                type="checkbox"
                checked={favorite}
                onChange={(e) => setFavorite(e.target.checked)}
              />
              <span className="text-star">Favorite — mark as Important</span>
            </label>

            <div className="flex flex-wrap gap-2 justify-end pt-1">
              <button
                type="button"
                className="hud-btn"
                onClick={() => closeBattleResolve()}
              >
                Cancel
              </button>
              <button
                type="button"
                className="hud-btn hud-btn-active"
                onClick={submit}
              >
                Record Battle
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <p className="font-display uppercase tracking-wider text-[10px] text-muted">
              Named characters
            </p>
            {presentCharacters.length === 0 ? (
              <div className="rounded border border-panel-border/60 px-3 py-2 text-[10px] text-muted">
                No named characters on participating detachments.
              </div>
            ) : (
              <>
                <CharacterFateList
                  label="Attacker"
                  accent={context.attackerFaction?.color ?? "#c9a227"}
                  characters={attackerCharacters}
                  fates={characterFates}
                  onSetFate={setFate}
                />
                <CharacterFateList
                  label="Defender"
                  accent={context.defenderFaction?.color ?? "#c9a227"}
                  characters={defenderCharacters}
                  fates={characterFates}
                  onSetFate={setFate}
                />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
