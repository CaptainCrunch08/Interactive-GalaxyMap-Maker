import type {
  Campaign,
  CampaignCharacter,
  CharacterPlacement,
} from "../types/campaign";
import { fleetsInOrbit, fleetsInSystem, locationLabel } from "./fleets";

/** Build a display string for a character's structured placement. */
export function characterPlacementLabel(
  campaign: Campaign,
  placement: CharacterPlacement | undefined,
): string {
  if (!placement || placement.kind === "unknown") return "";

  if (placement.kind === "system") {
    const system = campaign.systems.find((s) => s.id === placement.systemId);
    return system ? `${system.name} (star)` : "Unknown system";
  }

  if (placement.kind === "planet") {
    const system = campaign.systems.find((s) => s.id === placement.systemId);
    const planet = campaign.planets.find((p) => p.id === placement.planetId);
    const systemName = system?.name ?? "Unknown system";
    return planet ? `${planet.name} · ${systemName}` : systemName;
  }

  if (placement.kind === "fleet") {
    const fleet = (campaign.fleets ?? []).find((f) => f.id === placement.fleetId);
    if (!fleet) return "Unknown fleet";
    return `${fleet.name} · ${locationLabel(campaign, fleet.location)}`;
  }

  const planet = campaign.planets.find((p) => p.id === placement.planetId);
  const army = planet?.armies?.find((a) => a.id === placement.armyId);
  const system = planet
    ? campaign.systems.find((s) => s.id === planet.systemId)
    : undefined;
  const armyName = army?.name ?? "Unknown detachment";
  if (planet && system) return `${armyName} · ${planet.name} · ${system.name}`;
  if (planet) return `${armyName} · ${planet.name}`;
  return armyName;
}

/** Prefer structured placement; fall back to free-text location. */
export function characterLocationDisplay(
  campaign: Campaign,
  character: CampaignCharacter,
): string {
  const fromPlacement = characterPlacementLabel(campaign, character.placement);
  if (fromPlacement) return fromPlacement;
  return character.location.trim();
}

export function placementFromDraft(args: {
  systemId: string;
  planetId: string;
  fleetId: string;
  armyId: string;
}): CharacterPlacement {
  const { systemId, planetId, fleetId, armyId } = args;
  if (!systemId) return { kind: "unknown" };
  if (fleetId) return { kind: "fleet", fleetId };
  if (armyId && planetId) {
    return { kind: "army", planetId, armyId };
  }
  if (planetId) return { kind: "planet", systemId, planetId };
  return { kind: "system", systemId };
}

export function draftFromPlacement(placement: CharacterPlacement | undefined): {
  systemId: string;
  planetId: string;
  fleetId: string;
  armyId: string;
} {
  if (!placement || placement.kind === "unknown") {
    return { systemId: "", planetId: "", fleetId: "", armyId: "" };
  }
  if (placement.kind === "system") {
    return {
      systemId: placement.systemId,
      planetId: "",
      fleetId: "",
      armyId: "",
    };
  }
  if (placement.kind === "planet") {
    return {
      systemId: placement.systemId,
      planetId: placement.planetId,
      fleetId: "",
      armyId: "",
    };
  }
  if (placement.kind === "fleet") {
    return {
      systemId: "",
      planetId: "",
      fleetId: placement.fleetId,
      armyId: "",
    };
  }
  return {
    systemId: "",
    planetId: placement.planetId,
    fleetId: "",
    armyId: placement.armyId,
  };
}

/**
 * Resolve system/planet context for the form when opening a fleet or army
 * placement (so cascading selects stay filled).
 */
export function resolvePlacementDraft(
  campaign: Campaign,
  placement: CharacterPlacement | undefined,
): {
  systemId: string;
  planetId: string;
  fleetId: string;
  armyId: string;
} {
  const base = draftFromPlacement(placement);
  if (placement?.kind === "fleet") {
    const fleet = (campaign.fleets ?? []).find((f) => f.id === placement.fleetId);
    if (!fleet) return base;
    return {
      systemId: fleet.location.systemId,
      planetId:
        fleet.location.kind === "orbit" ? fleet.location.planetId : "",
      fleetId: fleet.id,
      armyId: "",
    };
  }
  if (placement?.kind === "army") {
    const planet = campaign.planets.find((p) => p.id === placement.planetId);
    return {
      systemId: planet?.systemId ?? "",
      planetId: placement.planetId,
      fleetId: "",
      armyId: placement.armyId,
    };
  }
  return base;
}

/** Fleets relevant to the current system / planet selection. */
export function fleetsForLocationDraft(
  campaign: Campaign,
  systemId: string,
  planetId: string,
  factionId?: string,
) {
  if (!systemId || !factionId) return [];
  const sameFaction = (campaign.fleets ?? []).filter(
    (f) => f.factionId === factionId,
  );
  if (planetId) {
    const inOrbit = fleetsInOrbit(sameFaction, planetId);
    const atStar = sameFaction.filter(
      (f) =>
        f.location.kind === "system" && f.location.systemId === systemId,
    );
    const seen = new Set(inOrbit.map((f) => f.id));
    return [...inOrbit, ...atStar.filter((f) => !seen.has(f.id))];
  }
  return fleetsInSystem(sameFaction, systemId);
}

/** Clear placements that reference deleted map entities. */
export function scrubCharacterPlacements(
  characters: CampaignCharacter[],
  campaign: Pick<Campaign, "systems" | "planets" | "fleets">,
): CampaignCharacter[] {
  const systemIds = new Set(campaign.systems.map((s) => s.id));
  const planetIds = new Set(campaign.planets.map((p) => p.id));
  const fleetIds = new Set((campaign.fleets ?? []).map((f) => f.id));
  const armyIds = new Set(
    campaign.planets.flatMap((p) => (p.armies ?? []).map((a) => a.id)),
  );

  return characters.map((c) => {
    const p = c.placement;
    if (!p || p.kind === "unknown") return c;

    let next: CharacterPlacement | undefined = p;
    if (p.kind === "system" && !systemIds.has(p.systemId)) {
      next = { kind: "unknown" };
    } else if (p.kind === "planet") {
      if (!systemIds.has(p.systemId) || !planetIds.has(p.planetId)) {
        next = { kind: "unknown" };
      }
    } else if (p.kind === "fleet" && !fleetIds.has(p.fleetId)) {
      next = { kind: "unknown" };
    } else if (p.kind === "army") {
      if (!planetIds.has(p.planetId) || !armyIds.has(p.armyId)) {
        next = { kind: "unknown" };
      }
    }

    if (next === p) return c;
    const location =
      next.kind === "unknown"
        ? c.location
        : characterPlacementLabel(
            campaign as Campaign,
            next,
          ) || c.location;
    return { ...c, placement: next, location };
  });
}
