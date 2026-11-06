import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Fleet, Ship, ShipRole } from "../types/campaign";
import {
  fleetPower,
  hasFlagship,
  shipRole,
} from "./fleetPower";

type Parts = THREE.BufferGeometry[];

/** Shared low-poly ship meshes (nose +Z). Cached per role. */
const cache = new Map<ShipRole, THREE.BufferGeometry>();

export function getShipGeometry(role: ShipRole): THREE.BufferGeometry {
  let geo = cache.get(role);
  if (!geo) {
    geo = buildShipGeometry(role);
    cache.set(role, geo);
  }
  return geo;
}

export function clearShipGeometryCache() {
  for (const g of cache.values()) g.dispose();
  cache.clear();
}

/** Largest / most impressive hull rank (for formation lead + sizing). */
export const CHASSIS_RANK: Record<ShipRole, number> = {
  flagship: 90,
  line: 60,
  transport: 35,
  escort: 20,
};

/** Relative draw size in system-view formations. */
export const CHASSIS_VISUAL_SCALE: Record<ShipRole, number> = {
  flagship: 1.3,
  line: 1.0,
  transport: 0.95,
  escort: 0.72,
};

export function flagshipChassis(ships: Ship[]): ShipRole {
  if (ships.some((s) => shipRole(s) === "flagship")) return "flagship";
  if (ships.some((s) => shipRole(s) === "line")) return "line";
  if (ships.some((s) => shipRole(s) === "transport")) return "transport";
  return "escort";
}

/**
 * Visual hulls from fleet power: one combat model per 100 FP
 * (flagship mesh if present), then utility icons, capped at `max`.
 */
export function formationChassisList(
  ships: Ship[],
  max = 7,
): ShipRole[] {
  const fleet = { ships };
  const power = fleetPower(fleet);
  const combatCount = Math.max(0, Math.ceil(power / 100));
  const result: ShipRole[] = [];
  if (combatCount > 0) {
    const lead = hasFlagship(fleet) ? "flagship" : "line";
    result.push(lead);
    for (let i = 1; i < combatCount && result.length < max; i++) {
      result.push("line");
    }
  }
  for (const s of ships) {
    if (result.length >= max) break;
    const role = shipRole(s);
    if (role === "escort" || role === "transport") result.push(role);
  }
  if (result.length === 0) return ["escort"];
  return result;
}

/** @deprecated Prefer formationChassisList(fleet.ships). */
export function formationFromFleet(fleet: Fleet, max = 7): ShipRole[] {
  return formationChassisList(fleet.ships, max);
}

function buildShipGeometry(role: ShipRole): THREE.BufferGeometry {
  switch (role) {
    case "escort":
      return finalize(buildCorvette());
    case "line":
      return finalize(buildCruiser());
    case "flagship":
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
