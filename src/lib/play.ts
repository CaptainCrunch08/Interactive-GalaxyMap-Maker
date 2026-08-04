import type { Campaign, CampaignPlay } from "../types/campaign";
import {
  inactivePlayState,
  normalizeCampaignPlay,
} from "../types/campaign";

export type PlayUnitKind = "fleet" | "army";

/** How many hexes a detachment may travel per turn. */
export const ARMY_MOVE_RANGE = 3;

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

/** Why a unit move was blocked in Play mode (null = allowed). */
export function playMoveBlockReason(
  campaign: Campaign,
  unitFactionId: string,
  unitId: string,
  kind: PlayUnitKind,
): string | null {
  const play = normalizeCampaignPlay(campaign.play);
  if (!play.active) return null;
  if (!play.activeFactionId || play.activeFactionId !== unitFactionId) {
    return "Only the active faction can move units";
  }
  if (kind === "fleet") {
    if (play.movedFleetIds.includes(unitId)) {
      return "This unit already moved this turn";
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
