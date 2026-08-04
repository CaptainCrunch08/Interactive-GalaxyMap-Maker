import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { ShipChassis } from "../types/campaign";

type Parts = THREE.BufferGeometry[];

/** Shared low-poly ship meshes (nose +Z). Cached per chassis. */
const cache = new Map<ShipChassis, THREE.BufferGeometry>();

export function getShipGeometry(chassis: ShipChassis): THREE.BufferGeometry {
  let geo = cache.get(chassis);
  if (!geo) {
    geo = buildShipGeometry(chassis);
    cache.set(chassis, geo);
  }
  return geo;
}

export function clearShipGeometryCache() {
  for (const g of cache.values()) g.dispose();
  cache.clear();
}

/** Largest / most impressive hull rank (for formation lead + sizing). */
export const CHASSIS_RANK: Record<ShipChassis, number> = {
  battleship: 90,
  grand_cruiser: 80,
  battlecruiser: 70,
  cruiser: 60,
  light_cruiser: 45,
  transport: 35,
  escort: 20,
};

/** Relative draw size in system-view formations. */
export const CHASSIS_VISUAL_SCALE: Record<ShipChassis, number> = {
  battleship: 1.3,
  grand_cruiser: 1.2,
  battlecruiser: 1.12,
  cruiser: 1.0,
  light_cruiser: 0.88,
  transport: 0.95,
  escort: 0.72,
};

export function flagshipChassis(ships: { chassis: ShipChassis }[]): ShipChassis {
  if (ships.length === 0) return "escort";
  let best: ShipChassis = ships[0]!.chassis;
  let rank = CHASSIS_RANK[best] ?? 0;
  for (const s of ships) {
    const r = CHASSIS_RANK[s.chassis] ?? 0;
    if (r > rank) {
      best = s.chassis;
      rank = r;
    }
  }
  return best;
}

/**
 * Chassis list for the system-view formation.
 * Small fleets show every ship; larger fleets cap at `max` while keeping type variety.
 */
export function formationChassisList(
  ships: { chassis: ShipChassis }[],
  max = 7,
): ShipChassis[] {
  if (ships.length === 0) return ["escort"];

  if (ships.length <= max) {
    return [...ships]
      .map((s) => s.chassis)
      .sort((a, b) => (CHASSIS_RANK[b] ?? 0) - (CHASSIS_RANK[a] ?? 0));
  }

  const remaining = new Map<ShipChassis, number>();
  for (const s of ships) {
    remaining.set(s.chassis, (remaining.get(s.chassis) ?? 0) + 1);
  }
  const types = [...remaining.keys()].sort(
    (a, b) => (CHASSIS_RANK[b] ?? 0) - (CHASSIS_RANK[a] ?? 0),
  );

  const result: ShipChassis[] = [];
  for (const t of types) {
    if (result.length >= max) break;
    result.push(t);
    remaining.set(t, (remaining.get(t) ?? 1) - 1);
  }

  while (result.length < max) {
    let pick: ShipChassis | null = null;
    let bestLeft = 0;
    for (const t of types) {
      const left = remaining.get(t) ?? 0;
      if (left <= 0) continue;
      if (
        left > bestLeft ||
        (left === bestLeft &&
          pick != null &&
          (CHASSIS_RANK[t] ?? 0) > (CHASSIS_RANK[pick] ?? 0))
      ) {
        pick = t;
        bestLeft = left;
      }
    }
    if (!pick) break;
    result.push(pick);
    remaining.set(pick, bestLeft - 1);
  }

  return result.sort(
    (a, b) => (CHASSIS_RANK[b] ?? 0) - (CHASSIS_RANK[a] ?? 0),
  );
}

function buildShipGeometry(chassis: ShipChassis): THREE.BufferGeometry {
  switch (chassis) {
    case "escort":
      return finalize(buildCorvette());
    case "light_cruiser":
      return finalize(buildDestroyer());
    case "cruiser":
      return finalize(buildCruiser());
    case "battlecruiser":
      return finalize(buildTitan());
    case "grand_cruiser":
      return finalize(buildColossus());
    case "battleship":
      return finalize(buildBattleship());
    case "transport":
      return finalize(buildTransport());
    default:
      return finalize(buildCorvette());
  }
}

function finalize(parts: Parts): THREE.BufferGeometry {
  const usable = parts.filter(Boolean);
  const merged = mergeGeometries(usable, false);
  for (const g of usable) g.dispose();
  if (!merged) {
    return new THREE.BoxGeometry(0.4, 0.2, 0.8);
  }
  merged.computeVertexNormals();
  // Center roughly on origin for icon framing
  merged.center();
  return merged;
}

function addBox(
  parts: Parts,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0,
) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx) g.rotateX(rx);
  if (ry) g.rotateY(ry);
  if (rz) g.rotateZ(rz);
  g.translate(x, y, z);
  parts.push(g);
}

function addCyl(
  parts: Parts,
  rTop: number,
  rBot: number,
  h: number,
  radial: number,
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0,
) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, radial);
  if (rx) g.rotateX(rx);
  if (ry) g.rotateY(ry);
  if (rz) g.rotateZ(rz);
  g.translate(x, y, z);
  parts.push(g);
}

function addCone(
  parts: Parts,
  r: number,
  h: number,
  radial: number,
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0,
) {
  const g = new THREE.ConeGeometry(r, h, radial);
  if (rx) g.rotateX(rx);
  if (ry) g.rotateY(ry);
  if (rz) g.rotateZ(rz);
  g.translate(x, y, z);
  parts.push(g);
}

function buildCorvette(): Parts {
  const p: Parts = [];
  addBox(p, 0.28, 0.14, 0.7, 0, 0, 0);
  addCone(p, 0.16, 0.32, 4, 0, 0, 0.48, Math.PI / 2, 0, 0);
  addBox(p, 0.55, 0.06, 0.22, 0, 0, -0.05);
  addCyl(p, 0.06, 0.08, 0.16, 6, -0.12, 0, -0.4, Math.PI / 2);
  addCyl(p, 0.06, 0.08, 0.16, 6, 0.12, 0, -0.4, Math.PI / 2);
  return p;
}

function buildDestroyer(): Parts {
  const p: Parts = [];
  addBox(p, 0.32, 0.18, 1.1, 0, 0, 0);
  addCone(p, 0.18, 0.4, 5, 0, 0, 0.7, Math.PI / 2, 0, 0);
  addBox(p, 0.7, 0.08, 0.28, 0, 0, 0.05);
  addBox(p, 0.14, 0.22, 0.35, 0, 0.16, -0.1);
  addCyl(p, 0.07, 0.1, 0.2, 6, -0.14, 0, -0.58, Math.PI / 2);
  addCyl(p, 0.07, 0.1, 0.2, 6, 0.14, 0, -0.58, Math.PI / 2);
  return p;
}

function buildCruiser(): Parts {
  const p: Parts = [];
  addBox(p, 0.42, 0.24, 1.35, 0, 0, 0);
  addBox(p, 0.28, 0.18, 0.45, 0, 0.08, 0.55);
  addCone(p, 0.2, 0.35, 6, 0, 0, 0.85, Math.PI / 2, 0, 0);
  addBox(p, 0.9, 0.1, 0.35, 0, -0.02, 0);
  addBox(p, 0.2, 0.28, 0.5, 0, 0.22, -0.15);
  addCyl(p, 0.09, 0.12, 0.22, 6, -0.18, 0, -0.72, Math.PI / 2);
  addCyl(p, 0.09, 0.12, 0.22, 6, 0.18, 0, -0.72, Math.PI / 2);
  addCyl(p, 0.07, 0.09, 0.18, 6, 0, -0.05, -0.78, Math.PI / 2);
  return p;
}

function buildBattleship(): Parts {
  const p: Parts = [];
  addBox(p, 0.55, 0.32, 1.7, 0, 0, 0);
  addBox(p, 0.38, 0.22, 0.55, 0, 0.1, 0.7);
  addCone(p, 0.26, 0.4, 6, 0, 0, 1.05, Math.PI / 2, 0, 0);
  addBox(p, 1.15, 0.12, 0.4, 0, -0.04, 0.1);
  addBox(p, 0.28, 0.4, 0.55, 0, 0.3, -0.2);
  addBox(p, 0.18, 0.22, 0.35, -0.28, 0.18, 0.2);
  addBox(p, 0.18, 0.22, 0.35, 0.28, 0.18, 0.2);
  addCyl(p, 0.1, 0.14, 0.28, 6, -0.22, 0, -0.95, Math.PI / 2);
  addCyl(p, 0.1, 0.14, 0.28, 6, 0.22, 0, -0.95, Math.PI / 2);
  addCyl(p, 0.08, 0.1, 0.22, 6, 0, -0.06, -1.0, Math.PI / 2);
  return p;
}

function buildTitan(): Parts {
  const p: Parts = [];
  addBox(p, 0.7, 0.4, 2.2, 0, 0, 0);
  addBox(p, 0.45, 0.28, 0.7, 0, 0.12, 0.9);
  addCone(p, 0.32, 0.55, 6, 0, 0, 1.35, Math.PI / 2, 0, 0);
  addBox(p, 1.4, 0.14, 0.5, 0, -0.05, 0.15);
  addBox(p, 0.35, 0.55, 0.7, 0, 0.42, -0.25);
  addBox(p, 0.22, 0.7, 0.22, 0, 0.7, -0.35);
  addBox(p, 0.22, 0.28, 0.45, -0.35, 0.22, 0.35);
  addBox(p, 0.22, 0.28, 0.45, 0.35, 0.22, 0.35);
  addCyl(p, 0.12, 0.16, 0.32, 6, -0.28, 0, -1.2, Math.PI / 2);
  addCyl(p, 0.12, 0.16, 0.32, 6, 0.28, 0, -1.2, Math.PI / 2);
  addCyl(p, 0.1, 0.13, 0.28, 6, 0, -0.08, -1.25, Math.PI / 2);
  return p;
}

function buildColossus(): Parts {
  const p: Parts = [];
  addCyl(p, 0.55, 0.55, 0.35, 10, 0, 0, 0, Math.PI / 2);
  addCyl(p, 0.35, 0.45, 0.55, 8, 0, 0, 0.35, Math.PI / 2);
  addCone(p, 0.28, 0.45, 8, 0, 0, 0.75, Math.PI / 2, 0, 0);
  addBox(p, 1.5, 0.12, 0.22, 0, 0, 0);
  addBox(p, 0.18, 0.12, 1.1, -0.55, 0, -0.15);
  addBox(p, 0.18, 0.12, 1.1, 0.55, 0, -0.15);
  addBox(p, 0.25, 0.4, 0.4, 0, 0.3, -0.2);
  addCyl(p, 0.1, 0.14, 0.25, 6, -0.35, 0, -0.65, Math.PI / 2);
  addCyl(p, 0.1, 0.14, 0.25, 6, 0.35, 0, -0.65, Math.PI / 2);
  return p;
}

function buildTransport(): Parts {
  const p: Parts = [];
  addBox(p, 0.48, 0.32, 1.2, 0, 0, 0);
  addBox(p, 0.35, 0.22, 0.35, 0, 0.05, 0.65);
  addCone(p, 0.2, 0.28, 4, 0, 0, 0.9, Math.PI / 2, 0, 0);
  addBox(p, 0.42, 0.28, 0.35, 0, 0, -0.2);
  addBox(p, 0.42, 0.28, 0.35, 0, 0, 0.15);
  addCyl(p, 0.09, 0.12, 0.2, 6, -0.16, 0, -0.68, Math.PI / 2);
  addCyl(p, 0.09, 0.12, 0.2, 6, 0.16, 0, -0.68, Math.PI / 2);
  return p;
}
