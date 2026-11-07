import type { Campaign, CampaignPlay } from "../types/campaign";
import {
  inactivePlayState,
  normalizeCampaignPlay,
} from "../types/campaign";
import {
  areFederated,
  federationMemberIds,
  federationTurnOrder,
} from "./federation";

/**
 * True when the active Play faction may command / spend for `unitFactionId`
 * (same faction or federation head controlling a member).
 */
export function activePlayerControlsFaction(
  campaign: Campaign,
  unitFactionId: string | undefined | null,
): boolean {
  const play = normalizeCampaignPlay(campaign.play);
  if (!play.active) return true;
  if (!play.activeFactionId || !unitFactionId) return false;
  return areFederated(
    campaign.factions,
    play.activeFactionId,
    unitFactionId,
  );
}

/** Faction ids the active player may move / spend for this turn. */
export function playControlledFactionIds(campaign: Campaign): string[] {
  const play = normalizeCampaignPlay(campaign.play);
  if (!play.active || !play.activeFactionId) return [];
  return federationMemberIds(campaign.factions, play.activeFactionId);
}

export type PlayUnitKind = "fleet" | "army";

/** How many hexes a detachment may travel per turn. */
export const ARMY_MOVE_RANGE = 3;

/** Move points each fleet gets per turn. */
export const FLEET_MOVE_POINTS = 3;

export function armyMovementUsed(
  play: CampaignPlay,
  armyId: string,
): number {
  const used = play.armyMovementUsed?.[armyId] ?? 0;
  return Math.max(0, Math.min(ARMY_MOVE_RANGE, Math.floor(used)));
}

export function armyMovementRemaining(
  play: CampaignPlay,
  armyId: string,
): number {
  return Math.max(0, ARMY_MOVE_RANGE - armyMovementUsed(play, armyId));
}

export function fleetMovementUsed(
  play: CampaignPlay,
  fleetId: string,
): number {
  const used = play.fleetMovementUsed?.[fleetId] ?? 0;
  return Math.max(0, Math.min(FLEET_MOVE_POINTS, Math.floor(used)));
}

export function fleetMovementRemaining(
  play: CampaignPlay,
  fleetId: string,
): number {
  return Math.max(0, FLEET_MOVE_POINTS - fleetMovementUsed(play, fleetId));
}

export function fleetHasBattled(play: CampaignPlay, fleetId: string): boolean {
  return (play.fleetBattledIds ?? []).includes(fleetId);
}

/** Spend `cost` MP on a fleet; returns updated play partial fields. */
export function withFleetMpSpent(
  play: CampaignPlay,
  fleetId: string,
  cost: number,
): Pick<CampaignPlay, "fleetMovementUsed"> {
  const spend = Math.max(0, Math.floor(cost));
  const used = Math.min(
    FLEET_MOVE_POINTS,
    fleetMovementUsed(play, fleetId) + spend,
  );
  return {
    fleetMovementUsed: {
      ...(play.fleetMovementUsed ?? {}),
      [fleetId]: used,
    },
  };
}

/** Mark fleet as having battled and exhaust remaining MP. */
export function withFleetBattled(
  play: CampaignPlay,
  fleetId: string,
): Pick<CampaignPlay, "fleetMovementUsed" | "fleetBattledIds"> {
  const battled = play.fleetBattledIds ?? [];
  return {
    fleetMovementUsed: {
      ...(play.fleetMovementUsed ?? {}),
      [fleetId]: FLEET_MOVE_POINTS,
    },
    fleetBattledIds: battled.includes(fleetId)
      ? battled
      : [...battled, fleetId],
  };
}

/** Exhaust a detachment's remaining hexes for the turn (claim / battle). */
export function withArmyActionsExhausted(
  play: CampaignPlay,
  armyId: string,
): Pick<CampaignPlay, "armyMovementUsed" | "movedArmyIds"> {
  const moved = play.movedArmyIds ?? [];
  return {
    armyMovementUsed: {
      ...(play.armyMovementUsed ?? {}),
      [armyId]: ARMY_MOVE_RANGE,
    },
    movedArmyIds: moved.includes(armyId) ? moved : [...moved, armyId],
  };
}

/** Why a unit move was blocked in Play mode (null = allowed). */
export function playMoveBlockReason(
  campaign: Campaign,
  unitFactionId: string,
  unitId: string,
  kind: PlayUnitKind,
  opts?: { mpCost?: number },
): string | null {
  const play = normalizeCampaignPlay(campaign.play);
  if (!play.active) return null;
  if (!activePlayerControlsFaction(campaign, unitFactionId)) {
    return "Only the active federation can move these units";
  }
  if (kind === "fleet") {
    const need = opts?.mpCost ?? 1;
    const left = fleetMovementRemaining(play, unitId);
    if (left < need) {
      return left <= 0
        ? `This fleet has used all ${FLEET_MOVE_POINTS} move points this turn`
        : `Need ${need} move point${need === 1 ? "" : "s"} (have ${left})`;
    }
    return null;
  }
  if (armyMovementRemaining(play, unitId) <= 0) {
    return `This detachment has used all ${ARMY_MOVE_RANGE} hexes this turn`;
  }
  return null;
}

export function playIsActive(campaign: Campaign): boolean {
  return normalizeCampaignPlay(campaign.play).active;
}

export function withPlay(
  campaign: Campaign,
  play: CampaignPlay | Partial<CampaignPlay> | null,
): Campaign {
  if (play == null) {
    return { ...campaign, play: inactivePlayState() };
  }
  return {
    ...campaign,
    play: normalizeCampaignPlay({
      ...normalizeCampaignPlay(campaign.play),
      ...play,
    }),
  };
}

export function turnLabel(
  round: number,
  factionName: string,
): string {
  return `R${round} · ${factionName}`;
}

/** Sanitize saved turn order / active id to federation heads only. */
export function sanitizePlayFederationTurn(
  campaign: Campaign,
): CampaignPlay {
  const play = normalizeCampaignPlay(campaign.play);
  const turnOrder = federationTurnOrder(campaign.factions, play.turnOrder);
  let activeFactionId = play.activeFactionId;
  if (activeFactionId) {
    const banner =
      federationTurnOrder(campaign.factions, [activeFactionId])[0] ?? null;
    activeFactionId = banner;
    if (activeFactionId && !turnOrder.includes(activeFactionId)) {
      activeFactionId = turnOrder[0] ?? null;
    }
  } else if (play.active && turnOrder.length > 0) {
    activeFactionId = turnOrder[0]!;
  }
  return {
    ...play,
    turnOrder,
    activeFactionId,
  };
}

export { federationTurnOrder };
