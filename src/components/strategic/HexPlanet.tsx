import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type {
  Army,
  ArmySymbol,
  City,
  Faction,
  PlanetClassification,
  PlanetStructure,
  PlanetType,
  SphereDir,
} from "../../types/campaign";
import { buildHexSphere, nearestTileIndex } from "../../lib/hexSphere";
import { buildFactionBorders } from "../../lib/planetBorders";
import {
  coreColorForPlanet,
  sampleTerrainAtDirection,
} from "../../lib/planetTerrain";
import {
  SETTLEMENT_HEX_FREQUENCY,
  settlementTileSet,
  tileOwnerMap,
} from "../../lib/settlements";
import { getStructureGeometry } from "../../lib/structureMeshes";

const FREQUENCY = SETTLEMENT_HEX_FREQUENCY;
const PLANET_RADIUS = 1.35;
/** Shrink tiles toward their centers so gaps show empire borders clearly. */
const TILE_INSET = 0.86;
/** Army tags sit just above the hex crust (flush, not floating). */
const ARMY_SURFACE_RADIUS = PLANET_RADIUS * 1.022;
const ARMY_MARKER_SIZE = 0.095;
/** When a city/structure shares the hex, slide the tag toward the camera. */
const ARMY_OCCUPIED_OFFSET = 0.055;
const ARMY_OCCUPIED_LIFT = 0.014;

/** Special paint brush id: clear open-tile claims. */
export const TERRAIN_PAINT_ERASE = "__erase__";

let cachedPlanetSphere: ReturnType<typeof buildHexSphere> | null = null;
function planetSphere() {
  cachedPlanetSphere ??= buildHexSphere(FREQUENCY);
  return cachedPlanetSphere;
}

type HexPlanetProps = {
  planetId: string;
  planetType: PlanetType;
  classification: PlanetClassification;
  accentColor: string;
  cities: City[];
  structures: PlanetStructure[];
  tileClaims: Record<string, string>;
  armies: Army[];
  symbols: ArmySymbol[];
  factions: Faction[];
  selectedCityId: string | null;
  selectedDistrictId: string | null;
  selectedStructureId: string | null;
  selectedArmyId: string | null;
  placingArmyId: string | null;
  /** Faction id to paint, TERRAIN_PAINT_ERASE to clear, or null when off. */
  terrainPaintFactionId: string | null;
  onSelectSettlement: (cityId: string, districtId: string | null) => void;
  onSelectStructure: (structureId: string) => void;
  onSelectArmy: (armyId: string) => void;
  onPlaceArmy: (dir: SphereDir) => void;
  onMoveArmy: (armyId: string, dir: SphereDir) => void;
  onClaimTiles: (claims: Record<number, string | null>) => void;
};

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", "").slice(0, 6), 16);
  if (Number.isNaN(n)) return [40, 48, 56];
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function displayRgb(r: number, g: number, b: number): [number, number, number] {
  const lift = 1.35;
  return [
    Math.min(255, Math.round(r * lift + 18)),
    Math.min(255, Math.round(g * lift + 14)),
    Math.min(255, Math.round(b * lift + 12)),
  ];
}

function majorityFactionId(city: City): string | undefined {
  const counts = new Map<string, number>();
  for (const d of city.districts) {
    if (!d.controllingFactionId) continue;
    counts.set(
      d.controllingFactionId,
      (counts.get(d.controllingFactionId) ?? 0) + 1,
    );
  }
  let best: string | undefined;
  let n = 0;
  for (const [id, c] of counts) {
    if (c > n) {
      best = id;
      n = c;
    }
  }
  return best;
}

function factionColor(
  factions: Faction[],
  factionId: string | undefined,
  fallback: string,
): string {
  return factions.find((f) => f.id === factionId)?.color ?? fallback;
}

function buildTileHighlight(
  tileIndex: number,
  colorHex: string,
): THREE.Group {
  const group = new THREE.Group();
  group.userData = { kind: "tile-highlight", tileIndex };

  const tile = planetSphere().tiles[tileIndex]!;
  const fillRadius = PLANET_RADIUS * 1.01;
  const outlineRadius = PLANET_RADIUS * 1.018;
  const center = new THREE.Vector3(
    tile.center.x,
    tile.center.y,
    tile.center.z,
  ).multiplyScalar(fillRadius);
  const ring = tile.ring.map((p) => {
    const mixed = new THREE.Vector3(
      p.x * TILE_INSET + tile.center.x * (1 - TILE_INSET),
      p.y * TILE_INSET + tile.center.y * (1 - TILE_INSET),
      p.z * TILE_INSET + tile.center.z * (1 - TILE_INSET),
    )
      .normalize()
      .multiplyScalar(fillRadius);
    return mixed;
  });

  const positions: number[] = [];
  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();
  const tmpN = new THREE.Vector3();
  for (let i = 0; i < ring.length; i++) {
    let a = ring[i]!;
    let b = ring[(i + 1) % ring.length]!;
    tmpA.subVectors(a, center);
    tmpB.subVectors(b, center);
    tmpN.crossVectors(tmpA, tmpB);
    if (tmpN.dot(center) < 0) {
      const swap = a;
      a = b;
      b = swap;
    }
    positions.push(center.x, center.y, center.z, a.x, a.y, a.z, b.x, b.y, b.z);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  const fill = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(colorHex),
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  fill.userData = { kind: "tile-highlight-fill" };
  group.add(fill);

  // Bright outline that replaces the black seam for the hovered hex
  const outlinePositions: number[] = [];
  for (let i = 0; i < tile.ring.length; i++) {
    const p0 = tile.ring[i]!;
    const p1 = tile.ring[(i + 1) % tile.ring.length]!;
    const a = new THREE.Vector3(p0.x, p0.y, p0.z)
      .normalize()
      .multiplyScalar(outlineRadius);
    const b = new THREE.Vector3(p1.x, p1.y, p1.z)
      .normalize()
      .multiplyScalar(outlineRadius);
    outlinePositions.push(a.x, a.y, a.z, b.x, b.y, b.z);
  }
  const outlineGeo = new THREE.BufferGeometry();
  outlineGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(outlinePositions, 3),
  );
  const outline = new THREE.LineSegments(
    outlineGeo,
    new THREE.LineBasicMaterial({
      color: new THREE.Color(colorHex),
      transparent: true,
      opacity: 1,
      depthTest: true,
      linewidth: 2,
    }),
  );
  outline.userData = { kind: "tile-highlight-outline" };
  group.add(outline);

  return group;
}

function dirFromTileIndex(tileIndex: number): SphereDir {
  const c = planetSphere().tiles[tileIndex]!.center;
  return { x: c.x, y: c.y, z: c.z };
}

/** Resolve city / district / structure occupying a hex tile. */
function featureAtTile(
  tileIndex: number,
  cities: City[],
  structures: PlanetStructure[],
):
  | { kind: "city"; cityId: string }
  | { kind: "district"; cityId: string; districtId: string }
  | { kind: "structure"; structureId: string }
  | null {
  for (const city of cities) {
    if (city.tileIndex === tileIndex) {
      return { kind: "city", cityId: city.id };
    }
    for (const d of city.districts) {
      if (d.tileIndex === tileIndex) {
        return {
          kind: "district",
          cityId: city.id,
          districtId: d.id,
        };
      }
    }
  }
  for (const s of structures) {
    if (s.tileIndex === tileIndex) {
      return { kind: "structure", structureId: s.id };
    }
  }
  return null;
}

function buildPlanetMeshes(
  planetId: string,
  planetType: PlanetType,
  classification: PlanetClassification,
  cities: City[],
  factions: Faction[],
  tileClaims?: Record<string, string>,
  structures: PlanetStructure[] = [],
): { surface: THREE.Mesh; seams: THREE.LineSegments } {
  const { tiles } = planetSphere();
  const owners = tileOwnerMap(cities, tileClaims, structures);
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const seamPositions: number[] = [];
  const seamColors: number[] = [];

  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();
  const tmpN = new THREE.Vector3();

  for (let ti = 0; ti < tiles.length; ti++) {
    const tile = tiles[ti]!;
    const { fill, height } = sampleTerrainAtDirection(
      tile.center.x,
      tile.center.y,
      tile.center.z,
      planetId,
      classification,
      planetType,
    );
    const [cr0, cg0, cb0] = hexToRgb(fill);
    let [cr, cg, cb] = displayRgb(cr0, cg0, cb0);

    // Subtle faction tint when a city/district owns this tile
    const ownerId = owners.get(ti);
    if (ownerId) {
      const oc = hexToRgb(factionColor(factions, ownerId, fill));
      cr = Math.round(cr * 0.72 + oc[0] * 0.28);
      cg = Math.round(cg * 0.72 + oc[1] * 0.28);
      cb = Math.round(cb * 0.72 + oc[2] * 0.28);
    }

    const radius = PLANET_RADIUS * (1 + height * 0.02);
    const center = new THREE.Vector3(
      tile.center.x,
      tile.center.y,
      tile.center.z,
    ).multiplyScalar(radius);

    // Inset ring toward center so each tile is visually separate
    const ring = tile.ring.map((p) => {
      const mixed = new THREE.Vector3(
        p.x * TILE_INSET + tile.center.x * (1 - TILE_INSET),
        p.y * TILE_INSET + tile.center.y * (1 - TILE_INSET),
        p.z * TILE_INSET + tile.center.z * (1 - TILE_INSET),
      ).normalize();
      return mixed.multiplyScalar(radius);
    });

    const borderCol = ownerId
      ? hexToRgb(factionColor(factions, ownerId, "#9eb6c8"))
      : ([110, 130, 150] as [number, number, number]);

    for (let i = 0; i < ring.length; i++) {
      let a = ring[i]!;
      let b = ring[(i + 1) % ring.length]!;

      tmpA.subVectors(a, center);
      tmpB.subVectors(b, center);
      tmpN.crossVectors(tmpA, tmpB);
      if (tmpN.dot(center) < 0) {
        const swap = a;
        a = b;
        b = swap;
        tmpN.negate();
      }
      tmpN.normalize();

      positions.push(center.x, center.y, center.z, a.x, a.y, a.z, b.x, b.y, b.z);
      for (let k = 0; k < 3; k++) {
        normals.push(tmpN.x, tmpN.y, tmpN.z);
        colors.push(cr / 255, cg / 255, cb / 255);
      }
      seamPositions.push(a.x, a.y, a.z, b.x, b.y, b.z);
      const br = borderCol[0] / 255;
      const bg = borderCol[1] / 255;
      const bb = borderCol[2] / 255;
      seamColors.push(br, bg, bb, br, bg, bb);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

  const surface = new THREE.Mesh(
    geo,
    new THREE.MeshLambertMaterial({
      vertexColors: true,
      side: THREE.FrontSide,
    }),
  );
  surface.userData = { kind: "surface" };

  const seamGeo = new THREE.BufferGeometry();
  seamGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(seamPositions, 3),
  );
  seamGeo.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(seamColors, 3),
  );
  const seams = new THREE.LineSegments(
    seamGeo,
    new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: false,
    }),
  );

  return { surface, seams };
}

function buildBorderLines(
  cities: City[],
  factions: Faction[],
  tileClaims?: Record<string, string>,
  structures: PlanetStructure[] = [],
): THREE.LineSegments {
  const sphere = planetSphere();
  const { positions, colors } = buildFactionBorders(
    sphere,
    cities,
    factions,
    PLANET_RADIUS,
    tileClaims,
    structures,
  );
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return new THREE.LineSegments(
    geo,
    new THREE.LineBasicMaterial({
      vertexColors: true,
      linewidth: 2,
      transparent: false,
    }),
  );
}

function placeOnSphere(
  dir: { x: number; y: number; z: number },
  radius: number,
): THREE.Vector3 {
  return new THREE.Vector3(dir.x, dir.y, dir.z)
    .normalize()
    .multiplyScalar(radius);
}

function buildSettlementMarkers(
  cities: City[],
  factions: Faction[],
  selectedCityId: string | null,
  selectedDistrictId: string | null,
  accentColor: string,
): THREE.Group {
  const group = new THREE.Group();
  const cityGeo = new THREE.CylinderGeometry(0.035, 0.05, 0.12, 6);
  const districtGeo = new THREE.SphereGeometry(0.028, 10, 10);

  for (const city of cities) {
    const cityOwner = majorityFactionId(city);
    const cityCol = factionColor(factions, cityOwner, accentColor);
    const selectedCity = selectedCityId === city.id && !selectedDistrictId;
    const cityMesh = new THREE.Mesh(
      cityGeo,
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(cityCol),
        emissive: new THREE.Color(cityCol),
        emissiveIntensity: selectedCity ? 0.55 : 0.2,
        roughness: 0.45,
        metalness: 0.25,
      }),
    );
    const pos = placeOnSphere(city.dir, PLANET_RADIUS * 1.045);
    cityMesh.position.copy(pos);
    cityMesh.lookAt(0, 0, 0);
    cityMesh.rotateX(Math.PI / 2);
    cityMesh.userData = { kind: "city", cityId: city.id, districtId: null };
    group.add(cityMesh);

    if (selectedCityId === city.id) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.07, 0.09, 24),
        new THREE.MeshBasicMaterial({
          color: cityCol,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.85,
        }),
      );
      ring.position.copy(placeOnSphere(city.dir, PLANET_RADIUS * 1.02));
      ring.lookAt(0, 0, 0);
      ring.userData = { kind: "decor" };
      group.add(ring);
    }

    for (const district of city.districts) {
      const dCol = factionColor(
        factions,
        district.controllingFactionId,
        "#6a8296",
      );
      const selected = selectedDistrictId === district.id;
      const dMesh = new THREE.Mesh(
        districtGeo,
        new THREE.MeshStandardMaterial({
          color: new THREE.Color(dCol),
          emissive: new THREE.Color(dCol),
          emissiveIntensity: selected ? 0.65 : 0.15,
          roughness: 0.5,
          metalness: 0.15,
        }),
      );
      dMesh.position.copy(placeOnSphere(district.dir, PLANET_RADIUS * 1.04));
      dMesh.userData = {
        kind: "district",
        cityId: city.id,
        districtId: district.id,
      };
      group.add(dMesh);
    }
  }

  return group;
}

function buildStructureMarkers(
  structures: PlanetStructure[],
  factions: Faction[],
  selectedStructureId: string | null,
  accentColor: string,
): THREE.Group {
  const group = new THREE.Group();
  for (const structure of structures) {
    const col = factionColor(
      factions,
      structure.controllingFactionId,
      accentColor,
    );
    const selected = selectedStructureId === structure.id;
    const mesh = new THREE.Mesh(
      getStructureGeometry(structure.kind),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(col),
        emissive: new THREE.Color(col),
        emissiveIntensity: selected ? 0.55 : 0.12,
        roughness: 0.55,
        metalness: 0.45,
        flatShading: true,
      }),
    );
    // Y-up models: lookAt planet center then tip so +Y points outward
    mesh.position.copy(placeOnSphere(structure.dir, PLANET_RADIUS * 1.015));
    mesh.lookAt(0, 0, 0);
    mesh.rotateX(Math.PI / 2);
    mesh.userData = { kind: "structure", structureId: structure.id };
    group.add(mesh);

    if (selected) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.09, 0.115, 28),
        new THREE.MeshBasicMaterial({
          color: col,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.85,
        }),
      );
      ring.position.copy(placeOnSphere(structure.dir, PLANET_RADIUS * 1.012));
      ring.lookAt(0, 0, 0);
      ring.userData = { kind: "decor" };
      group.add(ring);
    }
  }
  return group;
}

/** Flat canvas plate flush with the hex surface (not a floating billboard). */
function createArmyMarker(
  army: Army,
  symbol: ArmySymbol | undefined,
  color: string,
  selected: boolean,
): THREE.Mesh {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  const pad = selected ? 6 : 10;
  const plate = 128 - pad * 2;
  const label =
    army.name.length > 12 ? `${army.name.slice(0, 11)}…` : army.name;

  const paintFrame = (img?: HTMLImageElement) => {
    ctx.clearRect(0, 0, 128, 128);
    ctx.fillStyle = "rgba(8, 16, 24, 0.92)";
    ctx.strokeStyle = selected ? color : "rgba(79, 210, 255, 0.55)";
    ctx.lineWidth = selected ? 5 : 3;
    roundRect(ctx, pad, pad, plate, plate, 8);
    ctx.fill();
    ctx.stroke();

    const iconPad = pad + 10;
    const iconSize = plate - 20;
    if (img && img.naturalWidth > 0) {
      drawContainedImage(ctx, img, iconPad, iconPad, iconSize, iconSize);
    } else {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(64, 64, plate * 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#0a1018";
      ctx.font = "bold 36px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText((army.name[0] ?? "?").toUpperCase(), 64, 64);
    }

    if (selected) {
      ctx.fillStyle = "rgba(6, 12, 20, 0.88)";
      roundRect(ctx, pad + 4, 128 - pad - 22, plate - 8, 20, 4);
      ctx.fill();
      ctx.fillStyle = "#e8f0f8";
      ctx.font = "600 14px 'Exo 2', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, 64, 128 - pad - 12);
    }
  };

  paintFrame();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;

  if (symbol?.imageDataUrl) {
    const img = new Image();
    img.onload = () => {
      paintFrame(img);
      tex.needsUpdate = true;
    };
    img.src = symbol.imageDataUrl;
    if (img.complete && img.naturalWidth > 0) paintFrame(img);
  }

  const size = selected ? ARMY_MARKER_SIZE * 1.12 : ARMY_MARKER_SIZE;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  );
  mesh.userData = { kind: "army", armyId: army.id, dir: { ...army.dir } };
  return mesh;
}

const _armyZ = new THREE.Vector3();
const _armyY = new THREE.Vector3();
const _armyX = new THREE.Vector3();
const _armyCamUp = new THREE.Vector3();
const _armyCamLocal = new THREE.Vector3();
const _armyToCam = new THREE.Vector3();
const _armyMat = new THREE.Matrix4();
const _armyInvQ = new THREE.Quaternion();

/**
 * Flat on the hex, twisted so plate "up" matches the camera — readable top-down.
 * If the hex is occupied by a settlement/structure, slide toward the camera edge.
 */
function placeArmyOnHex(
  obj: THREE.Object3D,
  dir: SphereDir,
  camera: THREE.Camera,
  planet: THREE.Object3D,
  occupied: boolean,
) {
  _armyZ.set(dir.x, dir.y, dir.z).normalize();

  // Camera up → planet-local, then project onto the tangent plane
  _armyInvQ.copy(planet.quaternion).invert();
  _armyCamUp
    .set(0, 1, 0)
    .applyQuaternion(camera.quaternion)
    .applyQuaternion(_armyInvQ);
  _armyY.copy(_armyCamUp).addScaledVector(_armyZ, -_armyCamUp.dot(_armyZ));
  if (_armyY.lengthSq() < 1e-8) {
    _armyCamUp
      .set(1, 0, 0)
      .applyQuaternion(camera.quaternion)
      .applyQuaternion(_armyInvQ);
    _armyY.copy(_armyCamUp).addScaledVector(_armyZ, -_armyCamUp.dot(_armyZ));
  }
  _armyY.normalize();
  _armyX.crossVectors(_armyY, _armyZ).normalize();
  _armyY.crossVectors(_armyZ, _armyX).normalize();
  _armyMat.makeBasis(_armyX, _armyY, _armyZ);
  obj.quaternion.setFromRotationMatrix(_armyMat);

  obj.position.copy(_armyZ).multiplyScalar(ARMY_SURFACE_RADIUS);

  if (occupied) {
    _armyCamLocal.copy(camera.position);
    planet.worldToLocal(_armyCamLocal);
    _armyToCam.copy(_armyCamLocal).sub(obj.position);
    _armyToCam.addScaledVector(_armyZ, -_armyToCam.dot(_armyZ));
    if (_armyToCam.lengthSq() > 1e-8) {
      _armyToCam.normalize();
      obj.position.addScaledVector(_armyToCam, ARMY_OCCUPIED_OFFSET);
    }
    obj.position.addScaledVector(_armyZ, ARMY_OCCUPIED_LIFT);
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawContainedImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const scale = Math.min(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function buildArmyMarkers(
  armies: Army[],
  symbols: ArmySymbol[],
  factions: Faction[],
  selectedArmyId: string | null,
): THREE.Group {
  const group = new THREE.Group();
  for (const army of armies) {
    const fac = factions.find((f) => f.id === army.factionId);
    const symbol = symbols.find((s) => s.id === army.symbolId);
    const marker = createArmyMarker(
      army,
      symbol,
      fac?.color ?? "#4fd2ff",
      selectedArmyId === army.id,
    );
    // Pose is finalized each frame in tick (camera-upright + occupied offset)
    marker.position.set(army.dir.x, army.dir.y, army.dir.z).normalize();
    marker.position.multiplyScalar(ARMY_SURFACE_RADIUS);
    group.add(marker);
  }
  return group;
}

type OverlayState = {
  cities: City[];
  structures: PlanetStructure[];
  tileClaims: Record<string, string>;
  armies: Army[];
  symbols: ArmySymbol[];
  factions: Faction[];
  selectedCityId: string | null;
  selectedDistrictId: string | null;
  selectedStructureId: string | null;
  selectedArmyId: string | null;
};

export function HexPlanet({
  planetId,
  planetType,
  classification,
  accentColor,
  cities,
  structures,
  tileClaims,
  armies,
  symbols,
  factions,
  selectedCityId,
  selectedDistrictId,
  selectedStructureId,
  selectedArmyId,
  placingArmyId,
  terrainPaintFactionId,
  onSelectSettlement,
  onSelectStructure,
  onSelectArmy,
  onPlaceArmy,
  onMoveArmy,
  onClaimTiles,
}: HexPlanetProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const onSelectSettlementRef = useRef(onSelectSettlement);
  const onSelectStructureRef = useRef(onSelectStructure);
  const onSelectArmyRef = useRef(onSelectArmy);
  const onPlaceArmyRef = useRef(onPlaceArmy);
  const onMoveArmyRef = useRef(onMoveArmy);
  const onClaimTilesRef = useRef(onClaimTiles);
  const placingRef = useRef(placingArmyId);
  const paintRef = useRef(terrainPaintFactionId);
  const citiesRef = useRef(cities);
  const structuresRef = useRef(structures);
  onSelectSettlementRef.current = onSelectSettlement;
  onSelectStructureRef.current = onSelectStructure;
  onSelectArmyRef.current = onSelectArmy;
  onPlaceArmyRef.current = onPlaceArmy;
  onMoveArmyRef.current = onMoveArmy;
  onClaimTilesRef.current = onClaimTiles;
  placingRef.current = placingArmyId;
  paintRef.current = terrainPaintFactionId;
  citiesRef.current = cities;
  structuresRef.current = structures;

  const occupiedTilesRef = useRef<Set<number>>(new Set());
  occupiedTilesRef.current = settlementTileSet(cities, structures);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = mount.clientWidth || 640;
    const height = mount.clientHeight || 480;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    camera.position.set(0, 0.35, 4.2);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0xffffff, 0.72);
    const key = new THREE.DirectionalLight(0xfff5e6, 1.05);
    key.position.set(3.5, 2.2, 4);
    const fillLight = new THREE.DirectionalLight(0xa8c4d8, 0.45);
    fillLight.position.set(-3, -0.5, 2);
    const rim = new THREE.DirectionalLight(new THREE.Color(accentColor), 0.35);
    rim.position.set(-2.5, 1.5, -3);
    scene.add(ambient, key, fillLight, rim);

    const planet = new THREE.Group();
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(PLANET_RADIUS * 0.97, 48, 48),
      new THREE.MeshLambertMaterial({
        color: new THREE.Color(
          coreColorForPlanet(classification, planetType),
        ),
      }),
    );
    planet.add(core);

    let surface: THREE.Mesh;
    let seams: THREE.LineSegments;
    ({ surface, seams } = buildPlanetMeshes(
      planetId,
      planetType,
      classification,
      cities,
      factions,
      tileClaims,
      structures,
    ));
    planet.add(surface, seams);

    let borders = buildBorderLines(cities, factions, tileClaims, structures);
    planet.add(borders);

    let settlements = buildSettlementMarkers(
      cities,
      factions,
      selectedCityId,
      selectedDistrictId,
      accentColor,
    );
    planet.add(settlements);

    let structureMarkers = buildStructureMarkers(
      structures,
      factions,
      selectedStructureId,
      accentColor,
    );
    planet.add(structureMarkers);

    let armyMarkers = buildArmyMarkers(
      armies,
      symbols,
      factions,
      selectedArmyId,
    );
    planet.add(armyMarkers);
    scene.add(planet);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 2.4;
    controls.maxDistance = 7;
    controls.rotateSpeed = 0.85;
    controls.target.set(0, 0, 0);
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: null as unknown as THREE.MOUSE,
    };

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerDown: { x: number; y: number } | null = null;
    let tileHighlight: THREE.Group | null = null;
    let armyDrag: {
      armyId: string;
      marker: THREE.Mesh;
      startPos: THREE.Vector3;
      startQuat: THREE.Quaternion;
      tileIndex: number | null;
    } | null = null;
    let terrainPaint: {
      lastTile: number | null;
      pending: Map<number, string | null>;
    } | null = null;
    let faceAnim: {
      from: THREE.Quaternion;
      to: THREE.Quaternion;
      t: number;
      duration: number;
    } | null = null;
    const faceLocal = new THREE.Vector3();
    const faceWorld = new THREE.Vector3();
    const faceToCamera = new THREE.Vector3();
    const faceDelta = new THREE.Quaternion();
    const faceScratchQ = new THREE.Quaternion();

    /**
     * Spin the planet group so the feature faces the camera.
     * Camera / orbit distance stay fixed — same feel as dragging the globe.
     */
    const faceFeature = (dir: SphereDir) => {
      faceLocal.set(dir.x, dir.y, dir.z);
      if (faceLocal.lengthSq() < 1e-8) return;
      faceLocal.normalize();

      // Where this feature currently points in world space
      faceWorld.copy(faceLocal).applyQuaternion(planet.quaternion);
      // Direction from planet center toward the camera
      faceToCamera.copy(camera.position).sub(controls.target).normalize();
      if (faceToCamera.lengthSq() < 1e-8) return;

      const align = faceWorld.dot(faceToCamera);
      if (align > 0.995) return; // already facing

      faceDelta.setFromUnitVectors(faceWorld, faceToCamera);
      const from = planet.quaternion.clone();
      const to = faceScratchQ.copy(faceDelta).multiply(from).normalize();

      const angle = from.angleTo(to);
      if (angle < 0.02) return;

      const duration = THREE.MathUtils.clamp(0.3 + angle * 0.25, 0.35, 0.7);
      faceAnim = { from, to: to.clone(), t: 0, duration };
    };

    const disposeGroup = (g: THREE.Object3D) => {
      g.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
          obj.geometry.dispose();
          const mat = obj.material;
          const disposeMat = (m: THREE.Material) => {
            const withMap = m as THREE.Material & { map?: THREE.Texture | null };
            if (withMap.map) withMap.map.dispose();
            m.dispose();
          };
          if (Array.isArray(mat)) mat.forEach(disposeMat);
          else disposeMat(mat);
        }
        if (obj instanceof THREE.Sprite) {
          const mat = obj.material;
          if (mat.map) mat.map.dispose();
          mat.dispose();
        }
      });
    };

    const clearTileHighlight = () => {
      if (!tileHighlight) return;
      planet.remove(tileHighlight);
      disposeGroup(tileHighlight);
      tileHighlight = null;
    };

    const setHighlightedTile = (tileIndex: number | null) => {
      if (
        tileIndex != null &&
        tileHighlight?.userData?.tileIndex === tileIndex
      ) {
        return;
      }
      clearTileHighlight();
      if (tileIndex == null) return;
      tileHighlight = buildTileHighlight(tileIndex, accentColor);
      planet.add(tileHighlight);
    };

    const setPointerFromEvent = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
    };

    const localDirFromWorldPoint = (worldPoint: THREE.Vector3): SphereDir => {
      const local = planet.worldToLocal(worldPoint.clone());
      local.normalize();
      return { x: local.x, y: local.y, z: local.z };
    };

    const tileIndexFromSurfaceHit = (): number | null => {
      const hits = raycaster.intersectObject(surface, false);
      const hit = hits[0];
      if (!hit) return null;
      return nearestTileIndex(planetSphere(), localDirFromWorldPoint(hit.point));
    };

    const applyTerrainPaintAtPointer = () => {
      const brush = paintRef.current;
      if (brush == null || !terrainPaint) return;
      const tileIndex = tileIndexFromSurfaceHit();
      if (tileIndex == null) {
        setHighlightedTile(null);
        return;
      }
      setHighlightedTile(tileIndex);
      if (terrainPaint.lastTile === tileIndex) return;
      const occupied = settlementTileSet(
        citiesRef.current,
        structuresRef.current,
      );
      if (occupied.has(tileIndex)) return;
      terrainPaint.lastTile = tileIndex;
      const factionId = brush === TERRAIN_PAINT_ERASE ? null : brush;
      terrainPaint.pending.set(tileIndex, factionId);
    };

    const endArmyDrag = (commit: boolean) => {
      if (!armyDrag) return;
      const { armyId, marker, startPos, startQuat, tileIndex } = armyDrag;
      armyDrag = null;
      controls.enabled = true;
      if (commit && tileIndex != null) {
        onMoveArmyRef.current(armyId, dirFromTileIndex(tileIndex));
      } else {
        marker.position.copy(startPos);
        marker.quaternion.copy(startQuat);
      }
      clearTileHighlight();
    };

    const endTerrainPaint = (commit: boolean) => {
      if (!terrainPaint) return;
      const pending = terrainPaint.pending;
      terrainPaint = null;
      controls.enabled = true;
      clearTileHighlight();
      if (!commit || pending.size === 0) return;
      const batch: Record<number, string | null> = {};
      for (const [tileIndex, factionId] of pending) {
        batch[tileIndex] = factionId;
      }
      onClaimTilesRef.current(batch);
    };

    const onContextMenu = (e: Event) => {
      e.preventDefault();
    };

    const onPointerDown = (e: PointerEvent) => {
      faceAnim = null;

      if (e.button === 2) {
        e.preventDefault();
        setPointerFromEvent(e);
        const armyHits = raycaster.intersectObjects(
          armyMarkers.children,
          false,
        );
        const armyHit = armyHits.find(
          (h) => h.object.userData?.kind === "army",
        );
        if (armyHit && armyHit.object instanceof THREE.Mesh) {
          const armyId = armyHit.object.userData.armyId as string;
          armyDrag = {
            armyId,
            marker: armyHit.object,
            startPos: armyHit.object.position.clone(),
            startQuat: armyHit.object.quaternion.clone(),
            tileIndex: null,
          };
          controls.enabled = false;
          onSelectArmyRef.current(armyId);
          renderer.domElement.setPointerCapture(e.pointerId);
        }
        return;
      }

      if (e.button !== 0) return;

      if (paintRef.current != null && !placingRef.current) {
        setPointerFromEvent(e);
        terrainPaint = { lastTile: null, pending: new Map() };
        controls.enabled = false;
        renderer.domElement.setPointerCapture(e.pointerId);
        applyTerrainPaintAtPointer();
        return;
      }

      pointerDown = { x: e.clientX, y: e.clientY };
    };

    const onPointerMove = (e: PointerEvent) => {
      if (terrainPaint) {
        setPointerFromEvent(e);
        applyTerrainPaintAtPointer();
        return;
      }
      if (!armyDrag) return;
      setPointerFromEvent(e);
      const hits = raycaster.intersectObject(surface, false);
      const surfaceHit = hits[0];
      if (!surfaceHit) {
        armyDrag.tileIndex = null;
        setHighlightedTile(null);
        return;
      }
      const n = localDirFromWorldPoint(surfaceHit.point);
      const tileIndex = nearestTileIndex(planetSphere(), n);
      armyDrag.tileIndex = tileIndex;
      setHighlightedTile(tileIndex);
      const center = dirFromTileIndex(tileIndex);
      armyDrag.marker.userData.dir = center;
      placeArmyOnHex(
        armyDrag.marker,
        center,
        camera,
        planet,
        occupiedTilesRef.current.has(tileIndex),
      );
    };

    const onPointerUp = (e: PointerEvent) => {
      if (terrainPaint) {
        if (renderer.domElement.hasPointerCapture(e.pointerId)) {
          renderer.domElement.releasePointerCapture(e.pointerId);
        }
        endTerrainPaint(true);
        return;
      }

      if (armyDrag) {
        if (renderer.domElement.hasPointerCapture(e.pointerId)) {
          renderer.domElement.releasePointerCapture(e.pointerId);
        }
        endArmyDrag(true);
        return;
      }

      if (e.button !== 0 || !pointerDown) return;
      const dx = e.clientX - pointerDown.x;
      const dy = e.clientY - pointerDown.y;
      pointerDown = null;
      if (Math.hypot(dx, dy) > 5) return;

      setPointerFromEvent(e);

      const pickables = [
        ...armyMarkers.children,
        ...settlements.children,
        ...structureMarkers.children,
        surface,
      ];
      const hits = raycaster.intersectObjects(pickables, false);

      if (placingRef.current) {
        const surfaceHit = hits.find((h) => h.object === surface);
        if (surfaceHit) {
          const tileIndex = nearestTileIndex(
            planetSphere(),
            localDirFromWorldPoint(surfaceHit.point),
          );
          onPlaceArmyRef.current(dirFromTileIndex(tileIndex));
          return;
        }
      }

      const armyHit = hits.find((h) => h.object.userData?.kind === "army");
      if (armyHit) {
        onSelectArmyRef.current(armyHit.object.userData.armyId as string);
        return;
      }
      const structureHit = hits.find(
        (h) => h.object.userData?.kind === "structure",
      );
      if (structureHit) {
        onSelectStructureRef.current(
          structureHit.object.userData.structureId as string,
        );
        return;
      }
      const settleHit = hits.find(
        (h) =>
          h.object.userData?.kind === "city" ||
          h.object.userData?.kind === "district",
      );
      if (settleHit) {
        const { cityId, districtId } = settleHit.object.userData as {
          cityId: string;
          districtId: string | null;
        };
        onSelectSettlementRef.current(cityId, districtId);
        return;
      }

      // Click on hex fill (not just the 3D marker) still selects the feature
      const surfaceHit = hits.find((h) => h.object === surface);
      if (surfaceHit) {
        const tileIndex = nearestTileIndex(
          planetSphere(),
          localDirFromWorldPoint(surfaceHit.point),
        );
        const feature = featureAtTile(
          tileIndex,
          citiesRef.current,
          structuresRef.current,
        );
        if (!feature) return;
        if (feature.kind === "structure") {
          onSelectStructureRef.current(feature.structureId);
        } else if (feature.kind === "district") {
          onSelectSettlementRef.current(feature.cityId, feature.districtId);
        } else {
          onSelectSettlementRef.current(feature.cityId, null);
        }
      }
    };

    const onPointerCancel = (e: PointerEvent) => {
      if (terrainPaint) {
        if (renderer.domElement.hasPointerCapture(e.pointerId)) {
          renderer.domElement.releasePointerCapture(e.pointerId);
        }
        endTerrainPaint(false);
        return;
      }
      if (!armyDrag) return;
      if (renderer.domElement.hasPointerCapture(e.pointerId)) {
        renderer.domElement.releasePointerCapture(e.pointerId);
      }
      endArmyDrag(false);
    };

    renderer.domElement.addEventListener("contextmenu", onContextMenu);
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointercancel", onPointerCancel);

    let frame = 0;
    let lastTs = performance.now();
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const now = performance.now();
      const dt = Math.min(0.05, (now - lastTs) / 1000);
      lastTs = now;

      if (faceAnim) {
        faceAnim.t = Math.min(1, faceAnim.t + dt / faceAnim.duration);
        const u = faceAnim.t;
        // Smoothstep — steady spin, no ease punch
        const ease = u * u * (3 - 2 * u);
        planet.quaternion.slerpQuaternions(faceAnim.from, faceAnim.to, ease);
        if (faceAnim.t >= 1) {
          planet.quaternion.copy(faceAnim.to);
          faceAnim = null;
        }
      }

      controls.update();

      // Keep army tags upright relative to the camera; offset off shared hexes
      for (const child of armyMarkers.children) {
        if (child.userData?.kind !== "army") continue;
        if (armyDrag && armyDrag.marker === child) continue;
        const dir = child.userData.dir as SphereDir | undefined;
        if (!dir) continue;
        const tileIndex = nearestTileIndex(planetSphere(), dir);
        placeArmyOnHex(
          child,
          dir,
          camera,
          planet,
          occupiedTilesRef.current.has(tileIndex),
        );
      }

      renderer.render(scene, camera);
    };
    tick();

    const onResize = () => {
      if (!mount) return;
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    const refreshOverlays = (state: OverlayState) => {
      if (armyDrag) {
        endArmyDrag(false);
      }
      // Keep paint stroke state; only clear highlight when idle.
      if (!terrainPaint) clearTileHighlight();
      planet.remove(
        surface,
        seams,
        borders,
        settlements,
        structureMarkers,
        armyMarkers,
      );
      disposeGroup(surface);
      disposeGroup(seams);
      disposeGroup(borders);
      disposeGroup(settlements);
      disposeGroup(structureMarkers);
      disposeGroup(armyMarkers);

      ({ surface, seams } = buildPlanetMeshes(
        planetId,
        planetType,
        classification,
        state.cities,
        state.factions,
        state.tileClaims,
        state.structures,
      ));
      borders = buildBorderLines(
        state.cities,
        state.factions,
        state.tileClaims,
        state.structures,
      );
      settlements = buildSettlementMarkers(
        state.cities,
        state.factions,
        state.selectedCityId,
        state.selectedDistrictId,
        accentColor,
      );
      structureMarkers = buildStructureMarkers(
        state.structures,
        state.factions,
        state.selectedStructureId,
        accentColor,
      );
      armyMarkers = buildArmyMarkers(
        state.armies,
        state.symbols,
        state.factions,
        state.selectedArmyId,
      );
      planet.add(
        surface,
        seams,
        borders,
        settlements,
        structureMarkers,
        armyMarkers,
      );
    };

    (
      mount as HTMLDivElement & {
        __refreshOverlays?: typeof refreshOverlays;
        __faceFeature?: typeof faceFeature;
      }
    ).__refreshOverlays = refreshOverlays;
    (
      mount as HTMLDivElement & {
        __faceFeature?: typeof faceFeature;
      }
    ).__faceFeature = faceFeature;

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener("contextmenu", onContextMenu);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointercancel", onPointerCancel);
      delete (mount as HTMLDivElement & { __refreshOverlays?: unknown })
        .__refreshOverlays;
      delete (mount as HTMLDivElement & { __faceFeature?: unknown })
        .__faceFeature;
      clearTileHighlight();
      core.geometry.dispose();
      (core.material as THREE.Material).dispose();
      disposeGroup(surface);
      disposeGroup(seams);
      disposeGroup(borders);
      disposeGroup(settlements);
      disposeGroup(structureMarkers);
      disposeGroup(armyMarkers);
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planetId, planetType, classification, accentColor]);

  useEffect(() => {
    const mount = mountRef.current as
      | (HTMLDivElement & {
          __refreshOverlays?: (state: OverlayState) => void;
        })
      | null;
    mount?.__refreshOverlays?.({
      cities,
      structures,
      tileClaims,
      armies,
      symbols,
      factions,
      selectedCityId,
      selectedDistrictId,
      selectedStructureId,
      selectedArmyId,
    });
  }, [
    cities,
    structures,
    tileClaims,
    armies,
    symbols,
    factions,
    selectedCityId,
    selectedDistrictId,
    selectedStructureId,
    selectedArmyId,
  ]);

  // Rotate the camera so the selected city / district / structure faces the user
  const lastFacedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    lastFacedKeyRef.current = null;
  }, [planetId]);
  useEffect(() => {
    const mount = mountRef.current as
      | (HTMLDivElement & {
          __faceFeature?: (dir: SphereDir) => void;
        })
      | null;
    if (!mount?.__faceFeature) return;

    const focusKey = selectedStructureId
      ? `structure:${selectedStructureId}`
      : selectedDistrictId
        ? `district:${selectedDistrictId}`
        : selectedCityId
          ? `city:${selectedCityId}`
          : null;

    if (!focusKey) {
      lastFacedKeyRef.current = null;
      return;
    }
    if (lastFacedKeyRef.current === focusKey) return;
    lastFacedKeyRef.current = focusKey;

    let dir: SphereDir | null = null;
    if (selectedStructureId) {
      dir =
        structuresRef.current.find((s) => s.id === selectedStructureId)?.dir ??
        null;
    } else if (selectedDistrictId) {
      for (const city of citiesRef.current) {
        const district = city.districts.find(
          (d) => d.id === selectedDistrictId,
        );
        if (district) {
          dir = district.dir;
          break;
        }
      }
    } else if (selectedCityId) {
      dir =
        citiesRef.current.find((c) => c.id === selectedCityId)?.dir ?? null;
    }

    if (dir) mount.__faceFeature(dir);
  }, [selectedCityId, selectedDistrictId, selectedStructureId]);

  return (
    <div
      ref={mountRef}
      className={`w-full h-full min-h-[280px] touch-none ${
        placingArmyId || terrainPaintFactionId
          ? "cursor-crosshair"
          : "cursor-grab active:cursor-grabbing"
      }`}
      aria-label="Rotatable hex planet"
    />
  );
}
