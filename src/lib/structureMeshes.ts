import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { StructureKind } from "../types/campaign";

type Parts = THREE.BufferGeometry[];

/** Shared low-poly structure meshes (Y-up, base near y=0). Cached per kind. */
const cache = new Map<StructureKind, THREE.BufferGeometry>();

export function getStructureGeometry(kind: StructureKind): THREE.BufferGeometry {
  const normalized = normalizeStructureKind(kind);
  let geo = cache.get(normalized);
  if (!geo) {
    geo = buildStructureGeometry(normalized);
    cache.set(normalized, geo);
  }
  return geo;
}

/** Drop cache (e.g. after hot reload of builders). */
export function clearStructureGeometryCache() {
  for (const g of cache.values()) g.dispose();
  cache.clear();
}

/** Normalize legacy structure kinds from older saves. */
export function normalizeStructureKind(kind: string): StructureKind {
  if (kind === "void_dock") return "space_port";
  return kind as StructureKind;
}

function buildStructureGeometry(kind: StructureKind): THREE.BufferGeometry {
  switch (kind) {
    case "space_port":
      return finalize(buildSpacePort());
    case "spire_cluster":
      return finalize(buildSpireCluster());
    case "underhive_gate":
      return finalize(buildUnderhiveGate());
    case "manufactorum_complex":
      return finalize(buildManufactorum());
    case "ore_mine":
      return finalize(buildOreMine());
    case "slag_works":
      return finalize(buildSlagWorks());
    case "reactor":
      return finalize(buildReactor());
    case "agri_dome":
      return finalize(buildAgriDome());
    case "silo_complex":
      return finalize(buildSiloComplex());
    case "reservoir_works":
      return finalize(buildReservoirWorks());
    case "fortress_bastion":
      return finalize(buildFortressBastion());
    case "trench_line":
      return finalize(buildTrenchLine());
    case "kill_zone":
      return finalize(buildKillZone());
    case "cathedral_complex":
      return finalize(buildCathedral());
    case "reliquary_vault":
      return finalize(buildReliquaryVault());
    case "pilgrim_station":
      return finalize(buildPilgrimStation());
    case "mining_claim":
      return finalize(buildMiningClaim());
    case "relay":
      return finalize(buildRelay());
    case "relay_crown":
      return finalize(buildRelayCrown());
    case "outpost":
      return finalize(buildOutpost());
    case "ruins_site":
      return finalize(buildRuinsSite());
    case "supply_network":
      return finalize(buildSupplyNetwork());
    default:
      return finalize(buildOutpost());
  }
}

function finalize(parts: Parts): THREE.BufferGeometry {
  const usable = parts.filter(Boolean);
  const merged = mergeGeometries(usable, false);
  for (const g of usable) g.dispose();
  if (!merged) {
    return new THREE.BoxGeometry(0.06, 0.06, 0.06).translate(0, 0.03, 0);
  }
  merged.computeVertexNormals();
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

function addSphere(
  parts: Parts,
  r: number,
  wSeg: number,
  hSeg: number,
  x: number,
  y: number,
  z: number,
  sx = 1,
  sy = 1,
  sz = 1,
) {
  const g = new THREE.SphereGeometry(r, wSeg, hSeg);
  g.scale(sx, sy, sz);
  g.translate(x, y, z);
  parts.push(g);
}

function addOcta(
  parts: Parts,
  r: number,
  x: number,
  y: number,
  z: number,
  sx = 1,
  sy = 1,
  sz = 1,
) {
  const g = new THREE.OctahedronGeometry(r, 0);
  g.scale(sx, sy, sz);
  g.translate(x, y, z);
  parts.push(g);
}

/** Horizontal pipe with elbow stubs. */
function addPipeRun(
  parts: Parts,
  x0: number,
  y: number,
  z0: number,
  x1: number,
  z1: number,
  r = 0.006,
) {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const len = Math.hypot(dx, dz) || 0.01;
  const midX = (x0 + x1) / 2;
  const midZ = (z0 + z1) / 2;
  const yaw = Math.atan2(dx, dz);
  addCyl(parts, r, r, len, 5, midX, y, midZ, Math.PI / 2, yaw);
  addSphere(parts, r * 1.35, 5, 4, x0, y, z0);
  addSphere(parts, r * 1.35, 5, 4, x1, y, z1);
}

/** Layered armor panels on a face. */
function addArmorPlates(
  parts: Parts,
  cx: number,
  cy: number,
  cz: number,
  facing: "n" | "s" | "e" | "w",
) {
  const thick = 0.005;
  for (let i = 0; i < 3; i++) {
    const oy = cy - 0.012 + i * 0.014;
    const ox = (i % 2) * 0.004 - 0.002;
    if (facing === "n")
      addBox(parts, 0.028, 0.012, thick, cx + ox, oy, cz + 0.002);
    if (facing === "s")
      addBox(parts, 0.028, 0.012, thick, cx + ox, oy, cz - 0.002);
    if (facing === "e")
      addBox(parts, thick, 0.012, 0.028, cx + 0.002, oy, cz + ox);
    if (facing === "w")
      addBox(parts, thick, 0.012, 0.028, cx - 0.002, oy, cz + ox);
  }
}

/** Crenellation row along X. */
function addBattlements(
  parts: Parts,
  x: number,
  y: number,
  z: number,
  count: number,
  alongX: boolean,
) {
  for (let i = 0; i < count; i++) {
    if (alongX) {
      addBox(parts, 0.012, 0.012, 0.01, x - 0.03 + i * 0.02, y, z);
    } else {
      addBox(parts, 0.01, 0.012, 0.012, x, y, z - 0.03 + i * 0.02);
    }
  }
}

/** Angled flying buttress from wall to ground. */
function addButtress(
  parts: Parts,
  x: number,
  z: number,
  wallY: number,
  lean: number,
) {
  addBox(parts, 0.012, wallY * 0.85, 0.02, x, wallY * 0.45, z, 0, 0, lean);
  addBox(parts, 0.018, 0.01, 0.024, x * 1.15, 0.01, z * 1.1);
}

// ---------------------------------------------------------------------------
// Builders — footprint ~0.14–0.18, height ~0.14–0.22
// ---------------------------------------------------------------------------

function buildSpacePort(): Parts {
  const p: Parts = [];
  // Multi-level pad
  addBox(p, 0.16, 0.014, 0.12, 0, 0.007, 0);
  addBox(p, 0.14, 0.01, 0.1, 0.01, 0.018, 0.005);
  addBox(p, 0.17, 0.008, 0.02, 0, 0.012, -0.055); // apron
  addBox(p, 0.02, 0.008, 0.12, -0.075, 0.012, 0);
  addBox(p, 0.02, 0.008, 0.1, 0.075, 0.012, 0.005);
  // Approach ramps
  addBox(p, 0.04, 0.01, 0.05, -0.05, 0.012, 0.055, 0.4, 0, 0);
  addBox(p, 0.035, 0.01, 0.04, 0.045, 0.012, 0.05, 0.35, 0.2, 0);

  // Primary gantry tower + jib
  addBox(p, 0.02, 0.1, 0.02, -0.06, 0.065, 0.03);
  addBox(p, 0.018, 0.018, 0.018, -0.06, 0.12, 0.03);
  addBox(p, 0.1, 0.012, 0.012, -0.01, 0.115, 0.03, 0, 0, 0.08);
  addBox(p, 0.012, 0.04, 0.012, 0.04, 0.095, 0.03);
  addBox(p, 0.016, 0.016, 0.016, 0.04, 0.07, 0.03); // claw block
  // Secondary gantry (shorter, offset)
  addBox(p, 0.016, 0.07, 0.016, 0.055, 0.05, -0.025);
  addBox(p, 0.07, 0.01, 0.01, 0.02, 0.082, -0.025, 0, 0, -0.15);
  addCyl(p, 0.008, 0.008, 0.025, 5, -0.01, 0.082, -0.025, Math.PI / 2);

  // Control tower stack
  addBox(p, 0.035, 0.05, 0.03, 0.05, 0.04, 0.04);
  addBox(p, 0.028, 0.025, 0.025, 0.05, 0.075, 0.04);
  addCyl(p, 0.006, 0.008, 0.08, 5, 0.055, 0.1, 0.045);
  addBox(p, 0.03, 0.006, 0.018, 0.055, 0.14, 0.045);
  addCyl(p, 0.016, 0.016, 0.006, 7, 0.055, 0.128, 0.045, Math.PI / 2);

  // Fuel / cargo clutter
  addCyl(p, 0.014, 0.014, 0.03, 6, -0.04, 0.03, -0.04);
  addCyl(p, 0.011, 0.011, 0.025, 6, -0.02, 0.028, -0.045);
  addBox(p, 0.025, 0.018, 0.022, 0.02, 0.026, -0.04);
  addBox(p, 0.018, 0.014, 0.016, 0.04, 0.024, -0.05);
  addPipeRun(p, -0.05, 0.035, -0.04, 0.04, -0.035, 0.005);
  addPipeRun(p, 0.05, 0.055, 0.02, 0.05, -0.02, 0.005);
  // Landing beacons
  for (const [x, z] of [
    [-0.07, 0.05],
    [0.07, 0.05],
    [-0.07, -0.05],
    [0.065, -0.04],
  ] as const) {
    addCyl(p, 0.004, 0.005, 0.025, 4, x, 0.025, z);
    addBox(p, 0.01, 0.004, 0.01, x, 0.038, z);
  }
  return p;
}

function buildSpireCluster(): Parts {
  const p: Parts = [];
  addBox(p, 0.1, 0.02, 0.09, 0, 0.01, 0);
  addBox(p, 0.08, 0.014, 0.07, 0.01, 0.025, 0.005);

  // Primary hive needle
  addCyl(p, 0.012, 0.028, 0.16, 6, -0.015, 0.11, 0);
  addCyl(p, 0.008, 0.012, 0.05, 5, -0.015, 0.21, 0);
  addOcta(p, 0.014, -0.015, 0.245, 0, 0.65, 1.6, 0.65);
  // Hab rings / balconies
  addCyl(p, 0.032, 0.032, 0.01, 8, -0.015, 0.08, 0);
  addCyl(p, 0.03, 0.03, 0.008, 8, -0.015, 0.14, 0);
  addBox(p, 0.04, 0.008, 0.012, -0.015, 0.11, 0.03);

  // Secondary spire
  addCyl(p, 0.01, 0.02, 0.12, 5, 0.035, 0.09, -0.02);
  addCone(p, 0.014, 0.035, 4, 0.035, 0.165, -0.02);
  addCyl(p, 0.024, 0.024, 0.008, 6, 0.035, 0.07, -0.02);

  // Tertiary + stub
  addCyl(p, 0.008, 0.015, 0.08, 5, 0.01, 0.07, 0.035);
  addOcta(p, 0.01, 0.01, 0.12, 0.035, 0.7, 1.3, 0.7);
  addCyl(p, 0.006, 0.01, 0.04, 4, -0.04, 0.05, 0.03);

  // Flying buttresses + skybridges
  addButtress(p, -0.055, 0.02, 0.1, 0.55);
  addButtress(p, 0.06, -0.03, 0.08, -0.45);
  addButtress(p, 0.02, 0.055, 0.07, 0.35);
  addBox(p, 0.05, 0.01, 0.01, 0.01, 0.1, -0.01);
  addBox(p, 0.01, 0.01, 0.04, -0.005, 0.085, 0.02);
  addPipeRun(p, -0.04, 0.06, 0.03, 0.03, 0.03, 0.005);
  addArmorPlates(p, -0.015, 0.09, 0.028, "n");
  // Antenna forest
  addCyl(p, 0.003, 0.003, 0.04, 3, -0.03, 0.18, 0.01);
  addCyl(p, 0.003, 0.003, 0.03, 3, 0.04, 0.14, -0.01);
  addBox(p, 0.02, 0.015, 0.018, 0.04, 0.035, 0.03);
  return p;
}

function buildUnderhiveGate(): Parts {
  const p: Parts = [];
  // Massive bunker face
  addBox(p, 0.16, 0.09, 0.05, 0, 0.05, -0.01);
  addBox(p, 0.17, 0.02, 0.07, 0, 0.01, 0);
  addBox(p, 0.15, 0.015, 0.04, 0, 0.1, -0.01);
  // Gate recess pillars + teeth
  addBox(p, 0.028, 0.075, 0.035, -0.05, 0.05, 0.02);
  addBox(p, 0.028, 0.075, 0.035, 0.05, 0.05, 0.02);
  addBox(p, 0.08, 0.02, 0.03, 0, 0.09, 0.015);
  for (let i = 0; i < 4; i++) {
    addBox(p, 0.012, 0.035, 0.01, -0.025 + i * 0.018, 0.045, 0.03);
  }
  // Side galleries
  addBox(p, 0.03, 0.04, 0.06, -0.08, 0.04, 0.01);
  addBox(p, 0.025, 0.035, 0.05, 0.08, 0.035, -0.005);
  addArmorPlates(p, 0, 0.06, 0.02, "n");
  addArmorPlates(p, -0.08, 0.05, 0.04, "w");
  // Pipe intakes / vents
  addCyl(p, 0.012, 0.012, 0.05, 6, -0.07, 0.035, 0.04, Math.PI / 2);
  addCyl(p, 0.01, 0.01, 0.04, 5, 0.07, 0.055, 0.035, Math.PI / 2, 0.25);
  addCyl(p, 0.008, 0.008, 0.035, 5, 0.02, 0.08, 0.03, Math.PI / 2);
  addPipeRun(p, -0.07, 0.075, -0.02, 0.07, -0.015, 0.006);
  addBox(p, 0.025, 0.025, 0.025, 0.065, 0.03, -0.03);
  addBox(p, 0.02, 0.02, 0.02, -0.06, 0.03, -0.035);
  addBattlements(p, 0, 0.115, -0.025, 5, true);
  addCyl(p, 0.006, 0.006, 0.04, 4, -0.04, 0.12, -0.02);
  addBox(p, 0.014, 0.008, 0.01, -0.04, 0.14, -0.02);
  return p;
}

function buildManufactorum(): Parts {
  const p: Parts = [];
  // Main hall + wing
  addBox(p, 0.12, 0.07, 0.09, -0.02, 0.045, 0);
  addBox(p, 0.07, 0.05, 0.07, 0.06, 0.04, 0.02);
  addBox(p, 0.16, 0.016, 0.12, 0, 0.008, 0);
  addBox(p, 0.1, 0.02, 0.08, -0.02, 0.085, 0); // roof ridge
  addBox(p, 0.05, 0.015, 0.05, 0.06, 0.07, 0.02);

  // Stack farm
  const stacks: [number, number, number, number][] = [
    [-0.05, 0.12, -0.025, 0.11],
    [-0.025, 0.11, -0.03, 0.09],
    [0.0, 0.105, -0.02, 0.08],
    [0.07, 0.1, -0.015, 0.075],
    [0.045, 0.09, 0.04, 0.055],
  ];
  for (const [x, y, z, h] of stacks) {
    addCyl(p, 0.01, 0.014, h, 6, x, y, z);
    addCyl(p, 0.016, 0.016, 0.008, 6, x, y + h * 0.35, z);
  }

  // Overhead crane
  addBox(p, 0.018, 0.06, 0.018, 0.05, 0.09, 0.05);
  addBox(p, 0.11, 0.012, 0.012, -0.01, 0.115, 0.05);
  addBox(p, 0.012, 0.035, 0.012, -0.05, 0.1, 0.05);
  addBox(p, 0.02, 0.02, 0.02, -0.05, 0.075, 0.05);

  // Conveyor / loading bay
  addBox(p, 0.08, 0.015, 0.025, -0.02, 0.03, 0.055);
  addBox(p, 0.015, 0.02, 0.02, -0.05, 0.035, 0.055);
  addBox(p, 0.015, 0.02, 0.02, 0.02, 0.035, 0.055);

  addArmorPlates(p, -0.02, 0.05, 0.05, "n");
  addPipeRun(p, -0.06, 0.06, -0.04, 0.06, -0.03, 0.006);
  addPipeRun(p, 0.07, 0.07, 0.04, 0.07, -0.03, 0.005);
  addPipeRun(p, -0.05, 0.09, 0.02, 0.04, 0.02, 0.005);
  // Vent boxes + crates
  addBox(p, 0.025, 0.02, 0.03, -0.07, 0.03, 0.04);
  addBox(p, 0.02, 0.018, 0.022, 0.08, 0.028, -0.04);
  addBox(p, 0.016, 0.014, 0.016, 0.09, 0.025, -0.02);
  addBox(p, 0.03, 0.012, 0.02, -0.06, 0.025, -0.05);
  return p;
}

function buildOreMine(): Parts {
  const p: Parts = [];
  addBox(p, 0.12, 0.014, 0.1, 0, 0.007, 0);
  addBox(p, 0.08, 0.01, 0.06, 0.02, 0.018, 0.01);

  // Tall A-frame headgear
  addBox(p, 0.016, 0.15, 0.016, -0.035, 0.09, 0, 0, 0, 0.32);
  addBox(p, 0.016, 0.15, 0.016, 0.035, 0.09, 0, 0, 0, -0.32);
  addBox(p, 0.016, 0.12, 0.016, -0.02, 0.08, 0.025, 0.2, 0, 0.2);
  addBox(p, 0.016, 0.12, 0.016, 0.02, 0.08, 0.025, 0.2, 0, -0.2);
  addBox(p, 0.08, 0.014, 0.014, 0, 0.16, 0);
  addBox(p, 0.06, 0.012, 0.012, 0, 0.145, 0.02);
  addCyl(p, 0.016, 0.016, 0.02, 8, 0, 0.17, 0, Math.PI / 2);
  addCyl(p, 0.008, 0.008, 0.05, 5, 0, 0.1, 0); // cable shaft

  // Winch / engine house complex
  addBox(p, 0.05, 0.04, 0.045, -0.055, 0.03, 0.04);
  addBox(p, 0.035, 0.025, 0.03, -0.05, 0.055, 0.04);
  addCyl(p, 0.01, 0.012, 0.045, 5, -0.055, 0.07, 0.04);
  addBox(p, 0.03, 0.02, 0.025, -0.06, 0.025, -0.02);

  // Spoil heaps (multiple)
  addCone(p, 0.04, 0.05, 6, 0.055, 0.03, -0.03);
  addCone(p, 0.028, 0.035, 5, 0.04, 0.025, -0.055);
  addCone(p, 0.02, 0.025, 4, 0.07, 0.02, -0.01);

  // Ore carts + tracks
  addBox(p, 0.08, 0.006, 0.01, 0.01, 0.015, 0.045);
  addBox(p, 0.025, 0.016, 0.02, -0.01, 0.025, 0.045);
  addBox(p, 0.022, 0.014, 0.018, 0.025, 0.024, 0.045);
  addPipeRun(p, -0.05, 0.05, 0.04, 0.03, 0.03, 0.005);
  addBox(p, 0.02, 0.015, 0.018, 0.05, 0.022, 0.04);
  return p;
}

function buildSlagWorks(): Parts {
  const p: Parts = [];
  addBox(p, 0.14, 0.014, 0.11, 0, 0.007, 0);
  // Furnace mass
  addBox(p, 0.08, 0.06, 0.07, -0.03, 0.04, 0);
  addBox(p, 0.05, 0.04, 0.05, 0.04, 0.035, 0.015);
  addBox(p, 0.07, 0.02, 0.06, -0.03, 0.075, 0);
  addCyl(p, 0.014, 0.018, 0.08, 6, -0.03, 0.1, -0.015);
  addCyl(p, 0.01, 0.014, 0.06, 5, -0.01, 0.09, -0.025);

  // Pouring gantry + chute
  addBox(p, 0.015, 0.05, 0.015, 0.02, 0.055, 0.03);
  addBox(p, 0.06, 0.012, 0.014, 0.045, 0.07, 0.02, 0, 0, -0.2);
  addBox(p, 0.025, 0.014, 0.05, 0.05, 0.045, 0.0, 0.65, 0, 0);

  // Slag fields
  addCone(p, 0.04, 0.045, 6, 0.055, 0.03, -0.035);
  addCone(p, 0.03, 0.035, 5, 0.035, 0.025, -0.055);
  addCone(p, 0.022, 0.028, 5, 0.07, 0.022, -0.02);
  addCone(p, 0.018, 0.02, 4, 0.02, 0.02, -0.06);

  // Cooling network
  addPipeRun(p, -0.06, 0.055, 0.04, 0.05, 0.04, 0.007);
  addPipeRun(p, -0.055, 0.07, -0.02, 0.04, -0.03, 0.006);
  addCyl(p, 0.008, 0.008, 0.04, 5, -0.06, 0.04, 0.04);
  addCyl(p, 0.008, 0.008, 0.035, 5, 0.06, 0.04, 0.035);
  addBox(p, 0.03, 0.028, 0.03, -0.065, 0.03, -0.035);
  addBox(p, 0.022, 0.02, 0.02, 0.07, 0.025, 0.04);
  addArmorPlates(p, -0.03, 0.05, 0.04, "n");
  return p;
}

function buildReactor(): Parts {
  const p: Parts = [];
  addCyl(p, 0.05, 0.055, 0.025, 10, 0, 0.012, 0);
  addCyl(p, 0.042, 0.045, 0.02, 10, 0, 0.03, 0);
  // Core vessel
  addCyl(p, 0.032, 0.036, 0.09, 10, 0, 0.08, 0);
  addCyl(p, 0.04, 0.04, 0.012, 12, 0, 0.055, 0);
  addCyl(p, 0.038, 0.038, 0.01, 12, 0, 0.085, 0);
  addCyl(p, 0.036, 0.036, 0.01, 12, 0, 0.11, 0);
  addOcta(p, 0.02, 0, 0.14, 0, 1, 0.85, 1);
  addCyl(p, 0.01, 0.01, 0.03, 6, 0, 0.155, 0);

  // Cooling towers (uneven trio)
  addCyl(p, 0.014, 0.022, 0.1, 7, -0.06, 0.07, 0.025);
  addCyl(p, 0.012, 0.018, 0.08, 6, 0.055, 0.06, -0.03);
  addCyl(p, 0.01, 0.016, 0.065, 6, 0.05, 0.05, 0.04);
  addCyl(p, 0.02, 0.02, 0.01, 7, -0.06, 0.1, 0.025);
  addCyl(p, 0.016, 0.016, 0.008, 6, 0.055, 0.085, -0.03);

  // Support pylons + pipes
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.2;
    addBox(
      p,
      0.012,
      0.06,
      0.012,
      Math.cos(a) * 0.045,
      0.04,
      Math.sin(a) * 0.045,
    );
  }
  addPipeRun(p, -0.06, 0.05, 0.025, 0.05, 0.04, 0.007);
  addPipeRun(p, 0.055, 0.055, -0.03, -0.04, -0.035, 0.006);
  addPipeRun(p, -0.05, 0.09, 0.02, 0.04, 0.03, 0.005);
  addBox(p, 0.03, 0.025, 0.035, 0.06, 0.025, 0.02);
  addBox(p, 0.025, 0.02, 0.025, -0.065, 0.022, -0.03);
  addBox(p, 0.02, 0.018, 0.02, 0.03, 0.022, -0.055);
  return p;
}

function buildAgriDome(): Parts {
  const p: Parts = [];
  addCyl(p, 0.07, 0.075, 0.022, 6, 0, 0.011, 0);
  addBox(p, 0.14, 0.01, 0.12, 0, 0.005, 0);
  // Domes (main + satellite)
  addSphere(p, 0.06, 10, 7, 0, 0.065, 0, 1, 0.75, 1);
  addSphere(p, 0.03, 8, 6, 0.055, 0.045, 0.04, 1, 0.7, 1);
  addSphere(p, 0.022, 7, 5, -0.05, 0.04, -0.035, 1, 0.65, 1);
  // Structural ribs
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI;
    addBox(p, 0.006, 0.07, 0.12, 0, 0.065, 0, 0, a, 0);
  }
  // Airlock complex
  addBox(p, 0.04, 0.03, 0.03, 0.07, 0.025, 0.02);
  addBox(p, 0.025, 0.022, 0.02, 0.09, 0.022, 0.02);
  addCyl(p, 0.012, 0.012, 0.02, 6, 0.1, 0.025, 0.02, Math.PI / 2);
  // Climate plant
  addCyl(p, 0.01, 0.012, 0.05, 5, -0.06, 0.04, 0.05);
  addCyl(p, 0.008, 0.01, 0.04, 5, -0.075, 0.035, 0.035);
  addPipeRun(p, -0.06, 0.045, 0.05, 0.05, 0.04, 0.005);
  addPipeRun(p, -0.05, 0.04, -0.035, 0.04, -0.03, 0.005);
  addBox(p, 0.025, 0.015, 0.02, -0.07, 0.02, -0.01);
  addBox(p, 0.02, 0.012, 0.016, 0.06, 0.018, -0.05);
  addBox(p, 0.016, 0.01, 0.014, 0.04, 0.016, -0.06);
  return p;
}

function buildSiloComplex(): Parts {
  const p: Parts = [];
  addBox(p, 0.14, 0.012, 0.1, 0, 0.006, 0);
  // Silo cluster
  const silos: [number, number, number, number][] = [
    [-0.04, 0, 0.015, 0.14],
    [0.02, 0.015, 0.014, 0.12],
    [0.05, -0.02, 0.012, 0.1],
    [-0.01, -0.035, 0.011, 0.09],
    [-0.055, -0.03, 0.01, 0.07],
  ];
  for (const [x, z, r, h] of silos) {
    addCyl(p, r, r + 0.002, h, 8, x, h / 2 + 0.01, z);
    addCone(p, r + 0.002, r * 1.2, 6, x, h + 0.02, z);
    addCyl(p, r * 0.4, r * 0.4, 0.02, 5, x, h * 0.4, z + r);
  }
  // Catwalks + ladders
  addBox(p, 0.07, 0.008, 0.014, -0.01, 0.1, 0.01);
  addBox(p, 0.05, 0.008, 0.012, 0.02, 0.08, -0.01);
  addBox(p, 0.01, 0.08, 0.01, -0.04, 0.05, 0.03);
  addBox(p, 0.01, 0.06, 0.01, 0.02, 0.045, 0.035);
  // Intake / rail house
  addBox(p, 0.04, 0.03, 0.035, 0.06, 0.025, 0.04);
  addBox(p, 0.025, 0.02, 0.02, 0.07, 0.045, 0.04);
  addPipeRun(p, -0.04, 0.06, 0.02, 0.05, 0.03, 0.006);
  addPipeRun(p, -0.05, 0.05, -0.03, 0.04, -0.02, 0.005);
  addBox(p, 0.02, 0.015, 0.018, -0.07, 0.02, 0.04);
  addBox(p, 0.018, 0.012, 0.015, 0.07, 0.018, -0.04);
  return p;
}

function buildReservoirWorks(): Parts {
  const p: Parts = [];
  addBox(p, 0.15, 0.01, 0.13, 0, 0.005, 0);
  // Nested basins
  addCyl(p, 0.065, 0.07, 0.025, 12, 0, 0.018, 0);
  addCyl(p, 0.05, 0.05, 0.012, 12, 0, 0.016, 0);
  addCyl(p, 0.035, 0.038, 0.018, 10, -0.02, 0.035, 0.01);
  // Pump house cluster
  addBox(p, 0.045, 0.04, 0.04, 0.065, 0.03, 0.04);
  addBox(p, 0.03, 0.03, 0.028, 0.07, 0.055, 0.04);
  addCyl(p, 0.01, 0.012, 0.06, 5, 0.07, 0.08, 0.04);
  addBox(p, 0.035, 0.03, 0.03, 0.06, 0.025, -0.045);
  addBox(p, 0.025, 0.022, 0.022, -0.07, 0.022, -0.04);
  // Pipe spider
  addPipeRun(p, 0.065, 0.04, 0.04, -0.05, 0.03, 0.007);
  addPipeRun(p, 0.06, 0.05, -0.045, -0.04, -0.04, 0.006);
  addPipeRun(p, -0.07, 0.035, -0.04, -0.05, 0.04, 0.006);
  addCyl(p, 0.008, 0.008, 0.05, 5, -0.06, 0.04, 0.05, Math.PI / 2);
  addCyl(p, 0.008, 0.008, 0.04, 5, 0.02, 0.045, -0.06, Math.PI / 2);
  // Retaining walls + valves
  addBox(p, 0.1, 0.02, 0.012, 0, 0.025, -0.065);
  addBox(p, 0.012, 0.02, 0.08, -0.075, 0.025, 0);
  addBox(p, 0.02, 0.02, 0.02, -0.05, 0.03, 0.055);
  addBox(p, 0.018, 0.018, 0.018, 0.04, 0.028, 0.06);
  addBox(p, 0.015, 0.015, 0.015, 0.0, 0.05, 0.0);
  return p;
}

function buildFortressBastion(): Parts {
  const p: Parts = [];
  addBox(p, 0.12, 0.02, 0.11, 0, 0.01, 0);
  addBox(p, 0.09, 0.08, 0.085, 0, 0.055, 0); // keep
  addBox(p, 0.07, 0.03, 0.06, 0, 0.11, 0); // upper keep
  // Corner towers (different heights)
  const towers: [number, number, number][] = [
    [-0.055, -0.05, 0.12],
    [0.055, -0.048, 0.1],
    [-0.05, 0.05, 0.09],
    [0.052, 0.048, 0.11],
  ];
  for (const [x, z, h] of towers) {
    addBox(p, 0.03, h, 0.03, x, h / 2 + 0.01, z);
    addBox(p, 0.034, 0.012, 0.034, x, h + 0.01, z);
    addBattlements(p, x, h + 0.02, z, 2, true);
  }
  addBattlements(p, 0, 0.13, -0.045, 4, true);
  addBattlements(p, -0.05, 0.13, 0, 3, false);
  // Gatehouse
  addBox(p, 0.04, 0.05, 0.025, 0, 0.04, 0.055);
  addBox(p, 0.02, 0.035, 0.01, 0, 0.04, 0.07);
  addBox(p, 0.05, 0.015, 0.02, 0, 0.07, 0.055);
  // Inner bailey clutter
  addBox(p, 0.025, 0.02, 0.02, -0.025, 0.03, 0.02);
  addBox(p, 0.02, 0.018, 0.018, 0.03, 0.028, -0.02);
  addCyl(p, 0.006, 0.006, 0.05, 4, 0.02, 0.1, 0.02);
  addButtress(p, -0.07, 0, 0.08, 0.4);
  addButtress(p, 0.07, 0.01, 0.07, -0.35);
  addArmorPlates(p, 0, 0.06, 0.05, "n");
  return p;
}

function buildTrenchLine(): Parts {
  const p: Parts = [];
  addBox(p, 0.15, 0.01, 0.12, 0, 0.005, 0);
  // Zigzag trench walls (multiple segments)
  const segs: [number, number, number, number][] = [
    [-0.05, -0.04, 0.4, 0.05],
    [-0.01, -0.01, -0.45, 0.055],
    [0.04, 0.025, 0.5, 0.05],
    [-0.04, 0.04, -0.3, 0.045],
    [0.02, -0.05, 0.35, 0.04],
  ];
  for (const [x, z, yaw, len] of segs) {
    addBox(p, len, 0.028, 0.018, x, 0.02, z, 0, yaw);
  }
  // Embankments
  addBox(p, 0.12, 0.016, 0.03, 0, 0.012, -0.05);
  addBox(p, 0.1, 0.014, 0.025, 0.01, 0.012, 0.05);
  // Dugouts / bunkers
  addBox(p, 0.045, 0.03, 0.035, 0.045, 0.025, -0.015);
  addBox(p, 0.02, 0.015, 0.015, 0.045, 0.04, -0.015);
  addBox(p, 0.035, 0.025, 0.03, -0.05, 0.022, 0.02);
  addCyl(p, 0.006, 0.006, 0.035, 4, 0.05, 0.045, -0.01); // periscope
  addCyl(p, 0.005, 0.005, 0.03, 4, -0.05, 0.04, 0.025);
  // Sandbags / crates / wire
  for (let i = 0; i < 6; i++) {
    addBox(p, 0.012, 0.01, 0.01, -0.06 + i * 0.022, 0.018, 0.055);
  }
  addBox(p, 0.1, 0.004, 0.004, 0, 0.022, 0.06);
  addBox(p, 0.02, 0.015, 0.018, -0.06, 0.02, -0.04);
  addBox(p, 0.018, 0.012, 0.015, 0.06, 0.018, 0.04);
  return p;
}

function buildKillZone(): Parts {
  const p: Parts = [];
  addBox(p, 0.16, 0.008, 0.14, 0, 0.004, 0);
  // Scorched / cleared panels
  addBox(p, 0.08, 0.006, 0.06, -0.02, 0.01, 0.01);
  addBox(p, 0.05, 0.006, 0.05, 0.04, 0.01, -0.03);
  // Twin watchtowers
  addBox(p, 0.02, 0.1, 0.02, -0.06, 0.06, -0.05);
  addBox(p, 0.035, 0.015, 0.035, -0.06, 0.115, -0.05);
  addBox(p, 0.04, 0.008, 0.04, -0.06, 0.125, -0.05);
  addBox(p, 0.018, 0.085, 0.018, 0.065, 0.05, 0.05);
  addBox(p, 0.03, 0.014, 0.03, 0.065, 0.1, 0.05);
  addBox(p, 0.016, 0.07, 0.016, 0.05, 0.045, -0.055);
  addBox(p, 0.025, 0.01, 0.025, 0.05, 0.085, -0.055);
  // Stake / wire fields
  for (let i = 0; i < 8; i++) {
    addBox(p, 0.005, 0.025, 0.005, -0.07 + i * 0.02, 0.018, 0.06);
  }
  for (let i = 0; i < 6; i++) {
    addBox(p, 0.005, 0.022, 0.005, -0.065, 0.016, -0.05 + i * 0.02);
  }
  addBox(p, 0.14, 0.004, 0.004, 0, 0.02, 0.065);
  addBox(p, 0.004, 0.004, 0.1, -0.07, 0.02, 0);
  // Bunker slits + ammo
  addBox(p, 0.03, 0.018, 0.025, 0.01, 0.016, -0.05);
  addBox(p, 0.025, 0.015, 0.02, -0.03, 0.015, 0.04);
  addBox(p, 0.015, 0.012, 0.012, 0.04, 0.014, 0.02);
  addCyl(p, 0.008, 0.008, 0.02, 5, -0.06, 0.13, -0.05, Math.PI / 2);
  return p;
}

function buildCathedral(): Parts {
  const p: Parts = [];
  addBox(p, 0.12, 0.016, 0.16, 0, 0.008, 0);
  // Nave + transept
  addBox(p, 0.07, 0.06, 0.12, 0, 0.045, 0);
  addBox(p, 0.11, 0.05, 0.05, 0, 0.04, 0);
  addBox(p, 0.055, 0.025, 0.1, 0, 0.085, 0); // clerestory
  // Twin west towers
  addBox(p, 0.032, 0.14, 0.032, -0.04, 0.085, 0.06);
  addBox(p, 0.028, 0.12, 0.028, 0.04, 0.075, 0.06);
  addBox(p, 0.036, 0.015, 0.036, -0.04, 0.16, 0.06);
  addBox(p, 0.032, 0.012, 0.032, 0.04, 0.14, 0.06);
  addOcta(p, 0.016, -0.04, 0.185, 0.06, 0.65, 1.7, 0.65);
  addCone(p, 0.014, 0.035, 4, 0.04, 0.165, 0.06);
  // Crossing tower / steeple
  addBox(p, 0.03, 0.08, 0.03, 0, 0.11, -0.02);
  addOcta(p, 0.018, 0, 0.17, -0.02, 0.6, 1.8, 0.6);
  addCyl(p, 0.006, 0.006, 0.03, 4, 0, 0.19, -0.02);
  // Apse
  addCyl(p, 0.03, 0.03, 0.05, 8, 0, 0.04, -0.07);
  // Flying buttresses
  addButtress(p, -0.06, -0.02, 0.09, 0.5);
  addButtress(p, 0.06, -0.025, 0.085, -0.45);
  addButtress(p, -0.055, 0.04, 0.08, 0.4);
  addButtress(p, 0.055, 0.035, 0.075, -0.4);
  // Portal + steps
  addBox(p, 0.04, 0.035, 0.02, 0, 0.03, 0.075);
  addBox(p, 0.05, 0.008, 0.025, 0, 0.012, 0.085);
  addBox(p, 0.045, 0.006, 0.02, 0, 0.018, 0.09);
  addArmorPlates(p, 0, 0.05, 0.04, "n");
  addBox(p, 0.02, 0.015, 0.015, -0.05, 0.025, 0.05);
  addBox(p, 0.018, 0.012, 0.014, 0.055, 0.022, -0.05);
  return p;
}

function buildReliquaryVault(): Parts {
  const p: Parts = [];
  addBox(p, 0.13, 0.016, 0.12, 0, 0.008, 0);
  // Layered vault body
  addBox(p, 0.09, 0.07, 0.08, 0, 0.05, 0);
  addBox(p, 0.1, 0.02, 0.09, 0, 0.09, 0);
  addBox(p, 0.07, 0.025, 0.06, 0, 0.11, 0);
  // Corner pylons with caps
  const pylons: [number, number, number][] = [
    [-0.055, -0.05, 0.12],
    [0.055, -0.05, 0.11],
    [-0.055, 0.05, 0.1],
    [0.055, 0.048, 0.115],
  ];
  for (const [x, z, h] of pylons) {
    addBox(p, 0.022, h, 0.022, x, h / 2 + 0.01, z);
    addOcta(p, 0.012, x, h + 0.015, z, 1, 0.9, 1);
  }
  // Sealed door assembly
  addBox(p, 0.04, 0.05, 0.015, 0, 0.045, 0.05);
  addBox(p, 0.015, 0.015, 0.01, 0.015, 0.045, 0.06);
  addBox(p, 0.05, 0.01, 0.02, 0, 0.075, 0.05);
  addCyl(p, 0.008, 0.008, 0.02, 6, 0, 0.045, 0.06, Math.PI / 2);
  // Armor / ribs
  addArmorPlates(p, 0, 0.06, 0.045, "n");
  addArmorPlates(p, 0.05, 0.06, 0, "e");
  addBox(p, 0.08, 0.012, 0.012, 0, 0.08, 0);
  addBox(p, 0.012, 0.05, 0.012, -0.04, 0.06, 0);
  addBox(p, 0.012, 0.05, 0.012, 0.04, 0.06, 0);
  addPipeRun(p, -0.05, 0.07, -0.04, 0.05, -0.035, 0.005);
  addBox(p, 0.025, 0.02, 0.02, -0.06, 0.025, 0.03);
  addBox(p, 0.02, 0.018, 0.02, 0.065, 0.024, -0.03);
  return p;
}

function buildPilgrimStation(): Parts {
  const p: Parts = [];
  addBox(p, 0.14, 0.012, 0.1, 0, 0.006, 0);
  // Grand arch
  addBox(p, 0.018, 0.09, 0.018, -0.04, 0.055, 0.025);
  addBox(p, 0.018, 0.09, 0.018, 0.04, 0.055, 0.025);
  addBox(p, 0.09, 0.018, 0.022, 0, 0.1, 0.025);
  addOcta(p, 0.014, 0, 0.12, 0.025, 0.7, 1.4, 0.7);
  addBox(p, 0.02, 0.03, 0.012, 0, 0.04, 0.04); // gate shrine
  // Colonnade (irregular)
  for (let i = 0; i < 5; i++) {
    const x = -0.05 + i * 0.025;
    const h = 0.05 + (i % 3) * 0.01;
    addCyl(p, 0.006, 0.008, h, 5, x, h / 2 + 0.01, -0.025);
  }
  addBox(p, 0.11, 0.008, 0.014, 0, 0.065, -0.025);
  // Side chapel / wayshrine
  addBox(p, 0.04, 0.04, 0.035, 0.06, 0.03, -0.01);
  addCone(p, 0.018, 0.03, 4, 0.06, 0.065, -0.01);
  addBox(p, 0.03, 0.025, 0.025, -0.065, 0.022, 0.01);
  addOcta(p, 0.01, -0.065, 0.045, 0.01, 0.8, 1.2, 0.8);
  // Pilgrim stalls + lanterns
  addBox(p, 0.02, 0.015, 0.015, -0.02, 0.02, 0.045);
  addBox(p, 0.018, 0.014, 0.014, 0.015, 0.02, 0.05);
  addCyl(p, 0.004, 0.004, 0.035, 4, -0.05, 0.04, 0.045);
  addCyl(p, 0.004, 0.004, 0.03, 4, 0.055, 0.035, 0.04);
  addBox(p, 0.01, 0.006, 0.01, -0.05, 0.06, 0.045);
  addButtress(p, -0.055, 0.025, 0.07, 0.35);
  addButtress(p, 0.055, 0.02, 0.065, -0.3);
  return p;
}

function buildMiningClaim(): Parts {
  const p: Parts = [];
  addBox(p, 0.12, 0.012, 0.1, 0, 0.006, 0);
  // Beacon mast
  addCyl(p, 0.007, 0.01, 0.13, 5, -0.04, 0.075, 0.03);
  addCyl(p, 0.014, 0.014, 0.01, 6, -0.04, 0.05, 0.03);
  addOcta(p, 0.014, -0.04, 0.15, 0.03, 1, 0.85, 1);
  addBox(p, 0.025, 0.008, 0.015, -0.04, 0.14, 0.03);
  // Drill derrick
  addBox(p, 0.012, 0.11, 0.012, 0.025, 0.07, -0.02, 0, 0, 0.28);
  addBox(p, 0.012, 0.11, 0.012, 0.05, 0.07, -0.02, 0, 0, -0.28);
  addBox(p, 0.012, 0.09, 0.012, 0.025, 0.06, 0.005, 0.15, 0, 0.2);
  addBox(p, 0.012, 0.09, 0.012, 0.05, 0.06, 0.005, 0.15, 0, -0.2);
  addBox(p, 0.05, 0.012, 0.012, 0.038, 0.125, -0.01);
  addCyl(p, 0.006, 0.006, 0.08, 4, 0.038, 0.055, -0.01);
  addBox(p, 0.02, 0.015, 0.02, 0.038, 0.02, -0.01); // drill head
  // Camp clutter
  addBox(p, 0.03, 0.022, 0.025, -0.05, 0.02, -0.03);
  addBox(p, 0.022, 0.018, 0.02, -0.03, 0.018, -0.045);
  addBox(p, 0.018, 0.015, 0.016, 0.05, 0.016, 0.04);
  addBox(p, 0.016, 0.012, 0.014, 0.065, 0.015, 0.025);
  addCyl(p, 0.012, 0.012, 0.025, 6, 0.0, 0.025, 0.04);
  addPipeRun(p, -0.04, 0.04, 0.03, 0.03, -0.01, 0.005);
  addCone(p, 0.025, 0.03, 5, 0.06, 0.02, -0.04);
  return p;
}

function buildRelay(): Parts {
  const p: Parts = [];
  addBox(p, 0.1, 0.014, 0.1, 0, 0.007, 0);
  addBox(p, 0.05, 0.02, 0.05, 0, 0.02, 0);
  // Lattice mast (cross-braced)
  addBox(p, 0.016, 0.16, 0.016, 0, 0.1, 0);
  for (let i = 0; i < 5; i++) {
    const y = 0.04 + i * 0.028;
    addBox(p, 0.045, 0.008, 0.008, 0, y, 0);
    addBox(p, 0.008, 0.008, 0.045, 0, y + 0.01, 0);
    addBox(p, 0.04, 0.006, 0.006, 0, y, 0, 0, 0, Math.PI / 4);
    addBox(p, 0.04, 0.006, 0.006, 0, y, 0, 0, 0, -Math.PI / 4);
  }
  // Dish farm
  addCyl(p, 0.035, 0.035, 0.008, 10, 0.02, 0.15, 0.02, Math.PI / 2, 0.5);
  addBox(p, 0.01, 0.035, 0.01, 0.02, 0.13, 0.02);
  addCyl(p, 0.022, 0.022, 0.006, 8, -0.025, 0.13, -0.015, Math.PI / 2, -0.4);
  addBox(p, 0.008, 0.03, 0.008, -0.025, 0.115, -0.015);
  addCyl(p, 0.015, 0.015, 0.005, 7, 0.03, 0.1, -0.03, Math.PI / 2, 0.8);
  // Whip antennas
  addCyl(p, 0.004, 0.004, 0.07, 3, -0.02, 0.17, 0.015);
  addCyl(p, 0.003, 0.003, 0.05, 3, 0.025, 0.16, -0.01);
  addBox(p, 0.03, 0.006, 0.012, -0.02, 0.2, 0.015);
  // Equipment huts
  addBox(p, 0.035, 0.028, 0.03, 0.04, 0.025, -0.04);
  addBox(p, 0.028, 0.022, 0.025, -0.045, 0.022, 0.04);
  addBox(p, 0.02, 0.018, 0.02, -0.04, 0.02, -0.04);
  addPipeRun(p, -0.04, 0.04, 0.04, 0.04, -0.03, 0.005);
  return p;
}

/** Larger ceremonial crown / gate spire controlling warp transit. */
function buildRelayCrown(): Parts {
  const p: Parts = [];
  addCyl(p, 0.14, 0.14, 0.02, 12, 0, 0.01, 0);
  addCyl(p, 0.1, 0.1, 0.04, 10, 0, 0.04, 0);
  addBox(p, 0.04, 0.28, 0.04, 0, 0.2, 0);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    addBox(p, 0.025, 0.08, 0.025, Math.cos(a) * 0.08, 0.28, Math.sin(a) * 0.08);
  }
  addCyl(p, 0.06, 0.02, 0.05, 10, 0, 0.36, 0);
  addCyl(p, 0.045, 0.045, 0.012, 12, 0, 0.4, 0, Math.PI / 2, 0);
  return p;
}

function buildOutpost(): Parts {
  const p: Parts = [];
  addBox(p, 0.12, 0.014, 0.11, 0, 0.007, 0);
  // Main hab + annexes
  addBox(p, 0.07, 0.05, 0.06, 0, 0.035, 0);
  addBox(p, 0.04, 0.035, 0.04, 0.05, 0.03, 0.02);
  addBox(p, 0.035, 0.03, 0.035, -0.05, 0.028, -0.02);
  addBox(p, 0.05, 0.015, 0.04, 0, 0.065, 0); // roof
  addBox(p, 0.03, 0.012, 0.03, 0.05, 0.05, 0.02);
  // Perimeter barriers
  addBox(p, 0.1, 0.016, 0.018, 0, 0.018, 0.055);
  addBox(p, 0.018, 0.016, 0.09, -0.055, 0.018, 0);
  addBox(p, 0.018, 0.016, 0.07, 0.055, 0.018, -0.01);
  addBox(p, 0.08, 0.014, 0.016, 0.01, 0.016, -0.055);
  // Watch post
  addBox(p, 0.015, 0.06, 0.015, -0.05, 0.05, 0.04);
  addBox(p, 0.025, 0.012, 0.025, -0.05, 0.085, 0.04);
  // Antenna + vents
  addCyl(p, 0.004, 0.005, 0.07, 4, 0.02, 0.09, -0.015);
  addBox(p, 0.02, 0.005, 0.01, 0.02, 0.125, -0.015);
  addCyl(p, 0.003, 0.003, 0.04, 3, -0.015, 0.08, 0.01);
  addBox(p, 0.018, 0.015, 0.014, 0.015, 0.06, 0.025);
  addBox(p, 0.014, 0.012, 0.012, -0.02, 0.055, -0.03);
  addPipeRun(p, -0.05, 0.04, -0.02, 0.05, 0.02, 0.005);
  addArmorPlates(p, 0, 0.04, 0.035, "n");
  addBox(p, 0.02, 0.015, 0.016, 0.04, 0.022, -0.04);
  addBox(p, 0.016, 0.012, 0.014, -0.04, 0.02, 0.05);
  return p;
}

function buildRuinsSite(): Parts {
  const p: Parts = [];
  addBox(p, 0.14, 0.012, 0.12, 0, 0.006, 0);
  // Collapsed wall masses
  addBox(p, 0.07, 0.055, 0.02, -0.03, 0.035, -0.03, 0, 0.25, 0.4);
  addBox(p, 0.025, 0.07, 0.025, 0.05, 0.045, 0.02, 0, 0, -0.3);
  addBox(p, 0.05, 0.035, 0.018, 0.02, 0.025, 0.045, 0.5, 0.1, 0);
  addBox(p, 0.04, 0.04, 0.015, -0.05, 0.03, 0.04, 0, -0.3, 0.2);
  // Fallen / broken columns
  addCyl(p, 0.012, 0.012, 0.07, 6, -0.02, 0.02, 0.03, 0, 0, Math.PI / 2);
  addCyl(p, 0.01, 0.01, 0.05, 5, 0.04, 0.04, -0.04, 0.6, 0, 0.3);
  addCyl(p, 0.011, 0.011, 0.04, 6, 0.01, 0.03, -0.02);
  // Rubble piles
  addCone(p, 0.035, 0.04, 5, 0.05, 0.025, -0.04);
  addCone(p, 0.025, 0.03, 5, -0.055, 0.02, -0.04);
  addCone(p, 0.02, 0.025, 4, 0.0, 0.018, 0.055);
  addCone(p, 0.018, 0.02, 4, 0.06, 0.016, 0.04);
  // Shattered finials / debris blocks
  addOcta(p, 0.015, 0.01, 0.05, -0.01, 1, 0.55, 1);
  addOcta(p, 0.012, -0.04, 0.045, 0.0, 0.8, 0.7, 0.8);
  addBox(p, 0.025, 0.015, 0.02, -0.01, 0.018, -0.055);
  addBox(p, 0.02, 0.012, 0.018, 0.03, 0.016, 0.05);
  addBox(p, 0.015, 0.01, 0.014, -0.06, 0.015, 0.02);
  addBox(p, 0.03, 0.02, 0.012, 0.0, 0.02, -0.01, 0.3, 0.5, 0);
  return p;
}

/** Logistics hub: pad, conduit arms, and a central stack. */
function buildSupplyNetwork(): Parts {
  const p: Parts = [];
  addBox(p, 0.14, 0.01, 0.14, 0, 0.005, 0);
  addBox(p, 0.1, 0.012, 0.1, 0, 0.014, 0);
  // Central depot
  addBox(p, 0.055, 0.05, 0.055, 0, 0.045, 0);
  addBox(p, 0.04, 0.02, 0.04, 0, 0.08, 0);
  addCyl(p, 0.012, 0.014, 0.06, 6, 0, 0.1, 0);
  addOcta(p, 0.018, 0, 0.14, 0, 1, 0.9, 1);
  // Cardinal conduit arms
  addBox(p, 0.12, 0.014, 0.02, 0, 0.03, 0.05);
  addBox(p, 0.12, 0.014, 0.02, 0, 0.03, -0.05);
  addBox(p, 0.02, 0.014, 0.12, 0.05, 0.03, 0);
  addBox(p, 0.02, 0.014, 0.12, -0.05, 0.03, 0);
  // Junction boxes
  addBox(p, 0.03, 0.025, 0.03, 0.055, 0.03, 0.055);
  addBox(p, 0.03, 0.025, 0.03, -0.055, 0.03, 0.055);
  addBox(p, 0.03, 0.025, 0.03, 0.055, 0.03, -0.055);
  addBox(p, 0.03, 0.025, 0.03, -0.055, 0.03, -0.055);
  // Pipe runs
  addPipeRun(p, -0.06, 0.04, 0, 0.06, 0.015, 0);
  addPipeRun(p, 0, 0.04, -0.06, 0.015, 0, 0.06);
  addCyl(p, 0.006, 0.006, 0.05, 4, 0.04, 0.055, 0.02);
  addCyl(p, 0.006, 0.006, 0.045, 4, -0.04, 0.05, -0.02);
  return p;
}
