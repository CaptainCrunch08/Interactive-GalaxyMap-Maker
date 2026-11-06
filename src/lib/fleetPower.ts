import type { Fleet, Ship, ShipRole } from "../types/campaign";
import { SHIP_ROLE_ORDER } from "../types/campaign";

/** Fleet power contributed by each role. */
export const SHIP_ROLE_FP: Record<ShipRole, number> = {
  flagship: 200,
  line: 100,
  escort: 0,
  transport: 0,
};

export const FLEET_POWER_CAP_WITH_FLAGSHIP = 1200;
export const FLEET_POWER_CAP_WITHOUT_FLAGSHIP = 1000;
export const LINE_FP = 100;
export const FLAGSHIP_FP = 200;

export function shipRole(ship: Ship | { role?: ShipRole; chassis?: string }): ShipRole {
  const raw =
    (ship as Ship).role ??
    (ship as { chassis?: string }).chassis ??
    "line";
  return normalizeShipRole(raw);
}

export function normalizeShipRole(value: string): ShipRole {
  const legacy: Record<string, ShipRole> = {
    corvette: "escort",
    destroyer: "line",
    light_cruiser: "line",
    cruiser: "line",
    battlecruiser: "line",
    grand_cruiser: "line",
    battleship: "flagship",
    titan: "flagship",
    colossus: "flagship",
    science: "escort",
    construction: "transport",
    flagship: "flagship",
    line: "line",
    escort: "escort",
    transport: "transport",
  };
  return legacy[value] ?? "line";
}

export function shipFleetPower(ship: Ship): number {
  return SHIP_ROLE_FP[shipRole(ship)] ?? 0;
}

export function roleSortIndex(role: ShipRole): number {
  const i = SHIP_ROLE_ORDER.indexOf(role);
  return i < 0 ? SHIP_ROLE_ORDER.length : i;
}

/** Flagship → line → escort → transport; stable within each role. */
export function shipsSortedByRole(ships: Ship[]): Ship[] {
  return ships
    .map((ship, index) => ({ ship, index }))
    .sort((a, b) => {
      const d =
        roleSortIndex(shipRole(a.ship)) - roleSortIndex(shipRole(b.ship));
      if (d !== 0) return d;
      return a.index - b.index;
    })
    .map((x) => x.ship);
}

export function hasFlagship(fleet: Pick<Fleet, "ships">): boolean {
  return fleet.ships.some((s) => shipRole(s) === "flagship");
}

export function fleetPower(fleet: Pick<Fleet, "ships">): number {
  return fleet.ships.reduce((n, s) => n + shipFleetPower(s), 0);
}

export function fleetPowerCap(fleet: Pick<Fleet, "ships">): number {
  return hasFlagship(fleet)
    ? FLEET_POWER_CAP_WITH_FLAGSHIP
    : FLEET_POWER_CAP_WITHOUT_FLAGSHIP;
}

export function isUtilityRole(role: ShipRole): boolean {
  return role === "escort" || role === "transport";
}

export function isCombatRole(role: ShipRole): boolean {
  return role === "flagship" || role === "line";
}

/** Fleet has no combat FP ships (escort/transport only, or empty). */
export function isStandaloneUtilityFleet(fleet: Pick<Fleet, "ships">): boolean {
  if (fleet.ships.length === 0) return false;
  return fleet.ships.every((s) => isUtilityRole(shipRole(s)));
}

export function isStandaloneTransportFleet(fleet: Pick<Fleet, "ships">): boolean {
  return (
    fleet.ships.length > 0 &&
    fleet.ships.every((s) => shipRole(s) === "transport")
  );
}

export function isStandaloneEscortFleet(fleet: Pick<Fleet, "ships">): boolean {
  return (
    fleet.ships.length > 0 &&
    fleet.ships.every((s) => shipRole(s) === "escort")
  );
}

/**
 * Drop excess line ships so FP ≤ cap (flagship never dropped here —
 * call after removing flagship when clamping to 1000).
 */
export function clampFleetPower(fleet: Fleet): Fleet {
  const cap = fleetPowerCap(fleet);
  let power = fleetPower(fleet);
  let ships = fleet.ships;
  if (power > cap) {
    ships = [...fleet.ships];
    // Remove line ships from the end until under cap.
    for (let i = ships.length - 1; i >= 0 && power > cap; i--) {
      if (shipRole(ships[i]!) !== "line") continue;
      power -= LINE_FP;
      ships.splice(i, 1);
    }
  }
  return { ...fleet, ships: shipsSortedByRole(ships) };
}

/** Whether adding `role` would fit under the destination fleet's cap. */
export function canAddShipRole(
  fleet: Pick<Fleet, "ships">,
  role: ShipRole,
): { ok: true } | { ok: false; reason: string } {
  if (role === "flagship" && hasFlagship(fleet)) {
    return { ok: false, reason: "Fleet already has a flagship" };
  }
  const add = SHIP_ROLE_FP[role];
  if (add <= 0) return { ok: true };
  const nextHasFs = role === "flagship" || hasFlagship(fleet);
  const cap = nextHasFs
    ? FLEET_POWER_CAP_WITH_FLAGSHIP
    : FLEET_POWER_CAP_WITHOUT_FLAGSHIP;
  if (fleetPower(fleet) + add > cap) {
    return {
      ok: false,
      reason: `Would exceed fleet power cap (${cap})`,
    };
  }
  return { ok: true };
}

/** Transfer one line ship (100 FP) from donor to recipient. */
export function transferLineShip(
  donor: Fleet,
  recipient: Fleet,
): { donor: Fleet; recipient: Fleet } | { error: string } {
  if (donor.id === recipient.id) {
    return { error: "Cannot transfer within the same fleet" };
  }
  const lineIdx = donor.ships.findIndex((s) => shipRole(s) === "line");
  if (lineIdx < 0) return { error: "No fleet detachment to transfer" };
  const fit = canAddShipRole(recipient, "line");
  if (!fit.ok) return { error: fit.reason };
  const ship = donor.ships[lineIdx]!;
  return {
    donor: clampFleetPower({
      ...donor,
      ships: donor.ships.filter((_, i) => i !== lineIdx),
    }),
    recipient: clampFleetPower({
      ...recipient,
      ships: [...recipient.ships, ship],
    }),
  };
}

/** Move a utility ship between fleets (or reject flagship rules). */
export function transferShipById(
  donor: Fleet,
  recipient: Fleet,
  shipId: string,
): { donor: Fleet; recipient: Fleet } | { error: string } {
  if (donor.id === recipient.id) {
    return { error: "Cannot transfer within the same fleet" };
  }
  const idx = donor.ships.findIndex((s) => s.id === shipId);
  if (idx < 0) return { error: "Ship not found" };
  const ship = donor.ships[idx]!;
  const role = shipRole(ship);
  const fit = canAddShipRole(recipient, role);
  if (!fit.ok) return { error: fit.reason };
  return {
    donor: clampFleetPower({
      ...donor,
      ships: donor.ships.filter((_, i) => i !== idx),
    }),
    recipient: clampFleetPower({
      ...recipient,
      ships: [...recipient.ships, ship],
    }),
  };
}

/** Remove flagship and clamp remaining FP to 1000. */
export function destroyFleetFlagship(fleet: Fleet): Fleet {
  const ships = fleet.ships.filter((s) => shipRole(s) !== "flagship");
  return clampFleetPower({ ...fleet, ships });
}
