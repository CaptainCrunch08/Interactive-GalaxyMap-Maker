import { useMemo, useState } from "react";
import { useCampaignStore } from "../store/useCampaignStore";
import { fleetPower, fleetPowerCap, hasFlagship } from "../lib/fleetPower";
import { classifySpaceBattleVictory } from "../lib/spaceBattle";
import { VICTORY_KIND_LABELS } from "../lib/battleResolve";
import { getFactionById } from "../lib/territory";
import { locationLabel } from "../lib/fleets";

export function SpaceBattleResolveModal() {
  const pending = useCampaignStore((s) => s.spaceBattleResolve);
  const campaign = useCampaignStore((s) => s.campaign);
  const close = useCampaignStore((s) => s.closeSpaceBattleResolve);
  const resolve = useCampaignStore((s) => s.resolveSpaceBattle);

  const attacker = useMemo(
    () =>
      pending
        ? (campaign.fleets ?? []).find((f) => f.id === pending.attackerFleetId)
        : null,
    [campaign.fleets, pending],
  );
  const defender = useMemo(
    () =>
      pending
        ? (campaign.fleets ?? []).find((f) => f.id === pending.defenderFleetId)
        : null,
    [campaign.fleets, pending],
  );

  const [attackerVp, setAttackerVp] = useState(0);
  const [defenderVp, setDefenderVp] = useState(0);
  const [attackerWiped, setAttackerWiped] = useState(false);
  const [defenderWiped, setDefenderWiped] = useState(false);
  const [attackerFsGone, setAttackerFsGone] = useState(false);
  const [defenderFsGone, setDefenderFsGone] = useState(false);

  if (!pending || !attacker || !defender) return null;

  const atkFac = getFactionById(campaign, attacker.factionId);
  const defFac = getFactionById(campaign, defender.factionId);
  const preview = classifySpaceBattleVictory({
    attackerVp,
    defenderVp,
    attackerFp: fleetPower(attacker),
    defenderFp: fleetPower(defender),
    attackerFleetDestroyed: attackerWiped,
    defenderFleetDestroyed: defenderWiped,
  });

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-void/80 p-4">
      <div className="w-full max-w-lg rounded border border-panel-border bg-panel shadow-xl p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-lg text-star">Space battle</h3>
            <p className="text-[11px] text-muted mt-0.5">
              {locationLabel(campaign, attacker.location)}
            </p>
          </div>
          <button type="button" className="text-xs text-muted" onClick={close}>
            Cancel
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded border border-panel-border/70 p-3 space-y-2">
            <p className="text-[10px] uppercase tracking-wider text-brass">
              Attacker
            </p>
            <p className="text-star font-medium">{attacker.name}</p>
            <p className="text-[11px] text-muted">
              {atkFac?.name} · {fleetPower(attacker)}/{fleetPowerCap(attacker)}{" "}
              FP
            </p>
            <label className="block text-[10px] uppercase tracking-wider text-muted">
              Victory points
              <input
                className="hud-input mt-1 w-full"
                type="number"
                min={0}
                value={attackerVp}
                onChange={(e) => setAttackerVp(Number(e.target.value) || 0)}
              />
            </label>
            <label className="flex items-center gap-2 text-[11px] text-star">
              <input
                type="checkbox"
                checked={attackerWiped}
                onChange={(e) => setAttackerWiped(e.target.checked)}
              />
              Fleet destroyed
            </label>
            {hasFlagship(attacker) && (
              <label className="flex items-center gap-2 text-[11px] text-star">
                <input
                  type="checkbox"
                  checked={attackerFsGone}
                  disabled={attackerWiped}
                  onChange={(e) => setAttackerFsGone(e.target.checked)}
                />
                Flagship destroyed
              </label>
            )}
          </div>
          <div className="rounded border border-panel-border/70 p-3 space-y-2">
            <p className="text-[10px] uppercase tracking-wider text-brass">
              Defender
            </p>
            <p className="text-star font-medium">{defender.name}</p>
            <p className="text-[11px] text-muted">
              {defFac?.name} · {fleetPower(defender)}/{fleetPowerCap(defender)}{" "}
              FP
            </p>
            <label className="block text-[10px] uppercase tracking-wider text-muted">
              Victory points
              <input
                className="hud-input mt-1 w-full"
                type="number"
                min={0}
                value={defenderVp}
                onChange={(e) => setDefenderVp(Number(e.target.value) || 0)}
              />
            </label>
            <label className="flex items-center gap-2 text-[11px] text-star">
              <input
                type="checkbox"
                checked={defenderWiped}
                onChange={(e) => setDefenderWiped(e.target.checked)}
              />
              Fleet destroyed
            </label>
            {hasFlagship(defender) && (
              <label className="flex items-center gap-2 text-[11px] text-star">
                <input
                  type="checkbox"
                  checked={defenderFsGone}
                  disabled={defenderWiped}
                  onChange={(e) => setDefenderFsGone(e.target.checked)}
                />
                Flagship destroyed
              </label>
            )}
          </div>
        </div>

        <p className="text-xs text-brass">
          Result preview: {VICTORY_KIND_LABELS[preview.kind]}
          {preview.victorSide
            ? ` — ${preview.victorSide === "attacker" ? atkFac?.name : defFac?.name}`
            : ""}
        </p>

        <button
          type="button"
          className="hud-btn w-full"
          onClick={() =>
            resolve({
              attackerVp,
              defenderVp,
              attackerFleetDestroyed: attackerWiped,
              defenderFleetDestroyed: defenderWiped,
              attackerFlagshipDestroyed: attackerWiped || attackerFsGone,
              defenderFlagshipDestroyed: defenderWiped || defenderFsGone,
            })
          }
        >
          Commit result
        </button>
      </div>
    </div>
  );
}
