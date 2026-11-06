import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type {
  Army,
  ArmySymbol,
  City,
  District,
  Faction,
  FamousBattleSite,
  Planet,
  PlanetClassification,
  PlanetStructure,
  PlanetType,
  SphereDir,
} from "../../types/campaign";
import {
  DISTRICT_KIND_LABELS,
  STRUCTURE_KIND_LABELS,
} from "../../types/campaign";
import { districtRuleViolations } from "../../lib/activation";
import { buildHexSphere, nearestTileIndex } from "../../lib/hexSphere";
import { engageTargetsForArmy } from "../../lib/battleResolve";
import { buildFactionBorders } from "../../lib/planetBorders";
import {
  coreColorForPlanet,
  normalizeTerrainKind,
  sampleTerrainAtDirection,
  TERRAIN_KIND_ERASE,
} from "../../lib/planetTerrain";
import {
  SETTLEMENT_HEX_FREQUENCY,
  featureAtTileIndex,
  settlementTileSet,
  tileOwnerMap,
  tilesAroundCity,
} from "../../lib/settlements";
import { getStructureGeometry } from "../../lib/structureMeshes";
import {
  createDistrictModel,
  ensureDistrictModelsLoaded,
  isDistrictModelKind,
} from "../../lib/districtMeshes";
import { supplyLinkSegments } from "../../lib/supplyNetwork";
import { collectPlanetInteractionLinks } from "../../lib/districtBuffs";
import { bannerColor, unitColor } from "../../lib/federation";
import { perfMark, perfMeasure, perfTime } from "../../lib/perfDebug";

const FREQUENCY = SETTLEMENT_HEX_FREQUENCY;
/** Combat target hex glow (distinct from selection / paint accent). */
const ENGAGE_HIGHLIGHT = "#e85a4f";
const PLANET_RADIUS = 1.35;
/** Shrink tiles toward their centers so gaps show empire borders clearly. */
const TILE_INSET = 0.86;
/** Detachment walls sit just above the crust as a short faction-colored fence. */
const ARMY_WALL_BOTTOM = PLANET_RADIUS * 1.004;
/** Hex tiles: short wall so districts stay easy to click. */
const ARMY_WALL_TOP_HEX = PLANET_RADIUS * 1.038;
/** Pentagon tiles: slightly taller so 5-sided outlines still read. */
const ARMY_WALL_TOP_PENT = PLANET_RADIUS * 1.048;
/** How far the wall sits inward from the raw tile ring (1 = on the ring). */
const ARMY_WALL_INSET_HEX = 0.91;
const ARMY_WALL_INSET_PENT = 0.94;
/**
 * Detachment hex fill + pick pad — low, inset, so neighboring district clicks
 * aren't stolen. Shaded the same faction color as the walls.
 */
const ARMY_PICK_RADIUS = PLANET_RADIUS * 1.016;
const ARMY_PICK_INSET = 0.78;
const ARMY_SHADE_OPACITY = 0.38;
const ARMY_SHADE_OPACITY_SELECTED = 0.52;

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
  independentDistricts?: District[];
  structures: PlanetStructure[];
  tileClaims: Record<string, string>;
  armies: Army[];
  famousBattleSites?: FamousBattleSite[];
  symbols: ArmySymbol[];
  factions: Faction[];
  selectedCityId: string | null;
  selectedDistrictId: string | null;
  selectedStructureId: string | null;
  selectedArmyId: string | null;
  selectedFamousBattleId?: string | null;
  placingArmyId: string | null;
  /**
   * Edit / setup (Play inactive): show orange ! over districts that break
   * placement / activation rules.
   */
  showDistrictRuleWarnings?: boolean;
  /**
   * Play-mode: when set, highlight hexes this detachment can fight on
   * and click those hexes (or rival markers there) to open battle resolve.
   */
  engageArmyId?: string | null;
  /** Faction id to paint, TERRAIN_PAINT_ERASE to clear, or null when off. */
  terrainPaintFactionId: string | null;
  /** Biome brush: TerrainKind, TERRAIN_KIND_ERASE, or null. */
  terrainPaintKind?: string | null;
  /** When true, left-click on a free hex places a city/district/structure. */
  surfacePlaceActive?: boolean;
  /** When true with surfacePlaceActive, clicks on occupied hexes erase features. */
  surfaceEraseActive?: boolean;
  /** Manual biome overrides by tile index. */
  tileTerrain?: Record<string, string>;
  onSelectSettlement: (
    cityId: string | null,
    districtId: string | null,
  ) => void;
  onSelectStructure: (structureId: string) => void;
  onSelectArmy: (armyId: string) => void;
  onSelectFamousBattle?: (siteId: string | null) => void;
  onPlaceArmy: (dir: SphereDir) => void;
  onMoveArmy: (armyId: string, dir: SphereDir) => boolean;
  /**
   * Play-mode engage: attacker challenges a rival on a fightable hex.
   */
  onEngageArmy?: (attackerArmyId: string, defenderArmyId: string) => void;
  onClaimTiles: (claims: Record<number, string | null>) => void;
  onPaintTerrain?: (patches: Record<number, string | null>) => void;
  onPlaceAtTile?: (tileIndex: number) => void;
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

/** Territory paint (borders, cities, districts) — federation banner color. */
function territoryColor(
  factions: Faction[],
  factionId: string | undefined,
  fallback: string,
): string {
  return bannerColor(factions, factionId, fallback);
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
  independentDistricts: District[] = [],
):
  | { kind: "city"; cityId: string }
  | { kind: "district"; cityId: string | null; districtId: string }
  | { kind: "structure"; structureId: string }
  | null {
  return featureAtTileIndex(
    tileIndex,
    cities,
    structures,
    independentDistricts,
  );
}

function buildPlanetMeshes(
  planetId: string,
  planetType: PlanetType,
  classification: PlanetClassification,
  cities: City[],
  factions: Faction[],
  tileClaims?: Record<string, string>,
  structures: PlanetStructure[] = [],
  tileTerrain?: Record<string, string>,
  independentDistricts: District[] = [],
): { surface: THREE.Mesh; seams: THREE.LineSegments } {
  const { tiles } = planetSphere();
  const owners = tileOwnerMap(
    cities,
    tileClaims,
    structures,
    independentDistricts,
  );
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
    const override = normalizeTerrainKind(tileTerrain?.[String(ti)]);
    const { fill, height } = sampleTerrainAtDirection(
      tile.center.x,
      tile.center.y,
      tile.center.z,
      planetId,
      classification,
      planetType,
      override,
    );
    const [cr0, cg0, cb0] = hexToRgb(fill);
    let [cr, cg, cb] = displayRgb(cr0, cg0, cb0);

    // Subtle faction tint when a city/district owns this tile
    const ownerId = owners.get(ti);
    if (ownerId) {
      const oc = hexToRgb(territoryColor(factions, ownerId, fill));
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
      ? hexToRgb(territoryColor(factions, ownerId, "#9eb6c8"))
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
  independentDistricts: District[] = [],
): THREE.LineSegments {
  const sphere = planetSphere();
  const { positions, colors } = buildFactionBorders(
    sphere,
    cities,
    factions,
    PLANET_RADIUS,
    tileClaims,
    structures,
    independentDistricts,
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

function makeDistrictHudSprite(
  text: string,
  opts: {
    textColor: string;
    bgColor: string;
    borderColor: string;
    fontPx: number;
    bold?: boolean;
  },
): THREE.Sprite {
  const padX = 18;
  const padY = 10;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  ctx.font = `${opts.bold ? "bold " : ""}${opts.fontPx}px system-ui, sans-serif`;
  const metrics = ctx.measureText(text);
  const w = Math.ceil(metrics.width + padX * 2);
  const h = Math.ceil(opts.fontPx + padY * 2);
  canvas.width = w;
  canvas.height = h;
  ctx.font = `${opts.bold ? "bold " : ""}${opts.fontPx}px system-ui, sans-serif`;
  ctx.fillStyle = opts.bgColor;
  ctx.strokeStyle = opts.borderColor;
  ctx.lineWidth = 3;
  roundRect(ctx, 1.5, 1.5, w - 3, h - 3, 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = opts.textColor;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, w / 2, h / 2 + 1);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(mat);
  const worldH = 0.055 * (h / 36);
  const worldW = worldH * (w / h);
  sprite.scale.set(worldW, worldH, 1);
  sprite.center.set(0.5, 0);
  sprite.raycast = () => {};
  sprite.userData = { kind: "decor" };
  return sprite;
}

function makeWarningBangSprite(): THREE.Sprite {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, size, size);
  // Orange disc
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, 26, 0, Math.PI * 2);
  ctx.fillStyle = "#f07820";
  ctx.fill();
  ctx.strokeStyle = "#2a1408";
  ctx.lineWidth = 3;
  ctx.stroke();
  // Bang
  ctx.fillStyle = "#1a0c04";
  ctx.font = "bold 42px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("!", size / 2, size / 2 + 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.07, 0.07, 1);
  sprite.center.set(0.5, 0);
  sprite.raycast = () => {};
  sprite.userData = { kind: "decor" };
  return sprite;
}

function buildSettlementMarkers(
  cities: City[],
  factions: Faction[],
  selectedCityId: string | null,
  selectedDistrictId: string | null,
  _accentColor: string,
  independentDistricts: District[] = [],
  opts?: {
    showRuleWarnings?: boolean;
    planet?: Pick<Planet, "cities" | "independentDistricts" | "structures">;
    tileClaims?: Record<string, string>;
    structures?: PlanetStructure[];
  },
): THREE.Group {
  const group = new THREE.Group();
  const cityGeo = new THREE.CylinderGeometry(0.035, 0.05, 0.12, 6);
  const districtGeo = new THREE.SphereGeometry(0.028, 10, 10);
  const supplyStationGeo = new THREE.BoxGeometry(0.045, 0.045, 0.045);
  const planetForRules = opts?.planet;
  const showWarnings = Boolean(opts?.showRuleWarnings && planetForRules);
  const owners = tileOwnerMap(
    cities,
    opts?.tileClaims,
    opts?.structures ?? planetForRules?.structures ?? [],
    independentDistricts,
  );

  const addDistrictMarker = (
    district: District,
    cityId: string | null,
  ) => {
    const dCol = territoryColor(
      factions,
      district.controllingFactionId,
      district.kind === "supply_station" ? "#5ec8a0" : "#6a8296",
    );
    const selected = selectedDistrictId === district.id;
    const districtDir = dirFromTileIndex(district.tileIndex);
    const authored = isDistrictModelKind(district.kind)
      ? createDistrictModel(district.kind, dCol, selected)
      : null;
    let dMesh: THREE.Object3D;
    if (authored) {
      dMesh = authored;
      // Y-up GLBs: Object3D.lookAt(center) aims local -Z outward (not +Z),
      // so rotateX(-π/2) maps +Y → -Z → out of the crust (not into it).
      dMesh.position.copy(placeOnSphere(districtDir, PLANET_RADIUS * 1.018));
      dMesh.lookAt(0, 0, 0);
      dMesh.rotateX(-Math.PI / 2);
    } else {
      const fallback = new THREE.Mesh(
        district.kind === "supply_station" ? supplyStationGeo : districtGeo,
        new THREE.MeshStandardMaterial({
          color: new THREE.Color(dCol),
          emissive: new THREE.Color(dCol),
          emissiveIntensity: selected ? 0.65 : 0.15,
          roughness: 0.5,
          metalness: district.kind === "supply_station" ? 0.45 : 0.15,
        }),
      );
      fallback.position.copy(placeOnSphere(districtDir, PLANET_RADIUS * 1.04));
      if (district.kind === "supply_station") {
        fallback.lookAt(0, 0, 0);
        fallback.rotateX(Math.PI / 2);
      }
      dMesh = fallback;
    }
    dMesh.userData = {
      kind: "district",
      cityId,
      districtId: district.id,
    };
    group.add(dMesh);

    const violations =
      showWarnings && planetForRules
        ? districtRuleViolations(planetForRules as Planet, district, cityId)
        : [];
    if (violations.length > 0) {
      const bang = makeWarningBangSprite();
      bang.position.copy(placeOnSphere(districtDir, PLANET_RADIUS * 1.085));
      bang.userData = {
        kind: "decor",
        warningText: violations.join(" · "),
      };
      group.add(bang);
    }

    if (selected) {
      const kindTag = makeDistrictHudSprite(
        DISTRICT_KIND_LABELS[district.kind],
        {
          textColor: "#f2f6fa",
          bgColor: "rgba(10, 18, 28, 0.92)",
          borderColor: "#4fd2ff",
          fontPx: 28,
          bold: true,
        },
      );
      // Sit above the bang when both are present
      const tagRadius =
        violations.length > 0 ? PLANET_RADIUS * 1.12 : PLANET_RADIUS * 1.09;
      kindTag.position.copy(placeOnSphere(districtDir, tagRadius));
      group.add(kindTag);
    }
  };

  for (const city of cities) {
    // City hub uses the federation banner color (subfactions share the paint).
    const cityCol = territoryColor(
      factions,
      city.controllingFactionId,
      "#6a8296",
    );
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
    const cityDir = dirFromTileIndex(city.tileIndex);
    const pos = placeOnSphere(cityDir, PLANET_RADIUS * 1.045);
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
      ring.position.copy(placeOnSphere(cityDir, PLANET_RADIUS * 1.02));
      ring.lookAt(0, 0, 0);
      ring.userData = { kind: "decor" };
      group.add(ring);

      // Glow owned territory in the 2-hex footprint — never unowned / rival districts.
      const ownerId = city.controllingFactionId;
      if (ownerId) {
        for (const tileIndex of tilesAroundCity(city)) {
          if (owners.get(tileIndex) !== ownerId) continue;
          const glow = buildTileHighlight(tileIndex, cityCol);
          glow.userData = { kind: "decor" };
          group.add(glow);
        }
      }
    }

    for (const district of city.districts) {
      addDistrictMarker(district, city.id);
    }
  }

  for (const district of independentDistricts) {
    addDistrictMarker(district, null);
  }

  return group;
}

function addSurfaceArc(
  group: THREE.Group,
  a: SphereDir,
  b: SphereDir,
  color: string,
  opacity: number,
  radius = PLANET_RADIUS * 1.048,
) {
  const pa = placeOnSphere(a, radius);
  const pb = placeOnSphere(b, radius);
  const mid = pa
    .clone()
    .add(pb)
    .multiplyScalar(0.5)
    .normalize()
    .multiplyScalar(radius * 1.02);
  const curve = new THREE.QuadraticBezierCurve3(pa, mid, pb);
  const pts = curve.getPoints(12);
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const line = new THREE.Line(
    geo,
    new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
    }),
  );
  line.userData = { kind: "decor" };
  group.add(line);
}

function buildSupplyLinkLines(
  cities: City[],
  structures: PlanetStructure[],
  independentDistricts: District[] = [],
): THREE.Group {
  const group = new THREE.Group();
  const segments = supplyLinkSegments({
    cities,
    structures,
    independentDistricts,
  });

  const stationDir = new Map<string, SphereDir>();
  for (const city of cities) {
    for (const d of city.districts) {
      if (d.kind === "supply_station") stationDir.set(d.id, d.dir);
    }
  }
  for (const d of independentDistricts) {
    if (d.kind === "supply_station") stationDir.set(d.id, d.dir);
  }
  const networkDir = new Map<string, SphereDir>();
  for (const s of structures) {
    if (s.kind === "supply_network") networkDir.set(s.id, s.dir);
  }

  for (const seg of segments) {
    if (seg.kind === "station_network") {
      const a = stationDir.get(seg.from.id);
      const b = networkDir.get(seg.to.id);
      if (!a || !b) continue;
      addSurfaceArc(group, a, b, "#5ec8a0", 0.75);
    } else if (seg.kind === "station_station") {
      const a = stationDir.get(seg.from.id);
      const b = stationDir.get(seg.to.id);
      if (!a || !b) continue;
      addSurfaceArc(group, a, b, "#4eb890", 0.65);
    } else {
      const a = networkDir.get(seg.from.id);
      const b = networkDir.get(seg.to.id);
      if (!a || !b) continue;
      addSurfaceArc(group, a, b, "#3aa888", 0.55);
    }
  }
  return group;
}

/** AP feeds, spire↔underhive, ore→manufactorum arcs. */
function buildInteractionLinkLines(planet: {
  cities?: City[];
  independentDistricts?: District[];
  structures?: PlanetStructure[];
}): THREE.Group {
  const group = new THREE.Group();
  const links = collectPlanetInteractionLinks(planet as Planet);
  const r = PLANET_RADIUS * 1.052;
  for (const link of links) {
    const a = dirFromTileIndex(link.fromTile);
    const b = dirFromTileIndex(link.toTile);
    const opacity =
      link.kind === "ap_feed" ? 0.85 : link.kind === "ore_feed" ? 0.8 : 0.7;
    addSurfaceArc(group, a, b, link.color, opacity, r);
  }
  return group;
}

function createCrossedSwordsTexture(tier: "heroic" | "epochal"): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, size, size);

  const metal = tier === "epochal" ? "#f0d060" : "#c8d0d8";
  const grip = tier === "epochal" ? "#8b4518" : "#4a3020";

  const drawSword = (angle: number) => {
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.rotate(angle);
    // blade
    ctx.fillStyle = metal;
    ctx.beginPath();
    ctx.moveTo(-4, -48);
    ctx.lineTo(4, -48);
    ctx.lineTo(6, 8);
    ctx.lineTo(-6, 8);
    ctx.closePath();
    ctx.fill();
    // tip
    ctx.beginPath();
    ctx.moveTo(-4, -48);
    ctx.lineTo(0, -56);
    ctx.lineTo(4, -48);
    ctx.closePath();
    ctx.fill();
    // guard
    ctx.fillStyle = metal;
    ctx.fillRect(-14, 6, 28, 5);
    // grip
    ctx.fillStyle = grip;
    ctx.fillRect(-3.5, 11, 7, 18);
    // pommel
    ctx.fillStyle = metal;
    ctx.beginPath();
    ctx.arc(0, 32, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  drawSword(-Math.PI / 4);
  drawSword(Math.PI / 4);

  // small ring plaque base
  ctx.strokeStyle = tier === "epochal" ? "#e8c547" : "#9eb0c0";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, 58, 0, Math.PI * 2);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function buildFamousBattleMarkers(
  sites: FamousBattleSite[],
  selectedId: string | null,
): THREE.Group {
  const group = new THREE.Group();
  for (const site of sites) {
    const selected = selectedId === site.id;
    const tex = createCrossedSwordsTexture(site.tier);
    const size = selected ? 0.14 : 0.11;
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    mesh.position.copy(placeOnSphere(site.dir, PLANET_RADIUS * 1.028));
    // Face outward from the planet (lookAt center + rotateX would invert the art)
    mesh.lookAt(mesh.position.clone().multiplyScalar(2));
    mesh.userData = {
      kind: "famous-battle",
      siteId: site.id,
      dir: { ...site.dir },
    };
    group.add(mesh);

    if (selected) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(size * 0.7, size * 0.85, 24),
        new THREE.MeshBasicMaterial({
          color: site.tier === "epochal" ? "#e8c547" : "#c0c8d0",
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.9,
        }),
      );
      ring.position.copy(placeOnSphere(site.dir, PLANET_RADIUS * 1.026));
      ring.lookAt(ring.position.clone().multiplyScalar(2));
      ring.userData = { kind: "decor" };
      group.add(ring);
    }
  }
  return group;
}

function buildStructureMarkers(
  structures: PlanetStructure[],
  factions: Faction[],
  selectedStructureId: string | null,
  _accentColor: string,
): THREE.Group {
  const group = new THREE.Group();
  for (const structure of structures) {
    const col = territoryColor(
      factions,
      structure.controllingFactionId,
      "#6a8296",
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

      const label =
        structure.name.trim() || STRUCTURE_KIND_LABELS[structure.kind];
      const nameTag = makeDistrictHudSprite(label, {
        textColor: "#f2f6fa",
        bgColor: "rgba(10, 18, 28, 0.92)",
        borderColor: "#4fd2ff",
        fontPx: 28,
        bold: true,
      });
      nameTag.position.copy(
        placeOnSphere(structure.dir, PLANET_RADIUS * 1.09),
      );
      group.add(nameTag);
    }
  }
  return group;
}

/** Resolve army root group from a raycast hit (wall mesh or group). */
function armyRootFromHit(obj: THREE.Object3D): THREE.Object3D | null {
  let cur: THREE.Object3D | null = obj;
  while (cur) {
    if (cur.userData?.kind === "army") return cur;
    cur = cur.parent;
  }
  return null;
}

/** District/city GLBs hit child meshes — walk up to the tagged root. */
function settlementRootFromHit(obj: THREE.Object3D): THREE.Object3D | null {
  let cur: THREE.Object3D | null = obj;
  while (cur) {
    const kind = cur.userData?.kind;
    if (kind === "district" || kind === "city" || kind === "structure") {
      return cur;
    }
    cur = cur.parent;
  }
  return null;
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

function disposeObjectTree(obj: THREE.Object3D) {
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mat = mesh.material;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else if (mat) mat.dispose();
  });
}

/** Armies whose marker currently sits on this hex. */
function armiesOnTile(armies: Army[], tileIndex: number): Army[] {
  return armies.filter(
    (a) => nearestTileIndex(planetSphere(), a.dir) === tileIndex,
  );
}

/**
 * Faction-colored wall outlining a tile. Uses the tile's own 5- or 6-gon ring
 * so pentagons and hexagons get distinct silhouettes. A matching tinted pad
 * fills the hex (also the click target for the whole tile).
 */
function buildArmyWallParts(
  tileIndex: number,
  color: string,
  selected: boolean,
  stackIndex = 0,
): { wall: THREE.Mesh; rail: THREE.LineSegments; pickPad: THREE.Mesh } {
  const tile = planetSphere().tiles[tileIndex]!;
  const sides = tile.ring.length;
  const isPent = sides === 5;
  const inset = isPent ? ARMY_WALL_INSET_PENT : ARMY_WALL_INSET_HEX;
  const stackLift = stackIndex * 0.012;
  const rBottom = ARMY_WALL_BOTTOM + stackLift;
  const rTop =
    (isPent ? ARMY_WALL_TOP_PENT : ARMY_WALL_TOP_HEX) +
    stackLift +
    (selected ? 0.008 : 0);

  const center = new THREE.Vector3(
    tile.center.x,
    tile.center.y,
    tile.center.z,
  ).normalize();

  const ringDirs = tile.ring.map((p) =>
    new THREE.Vector3(
      p.x * inset + tile.center.x * (1 - inset),
      p.y * inset + tile.center.y * (1 - inset),
      p.z * inset + tile.center.z * (1 - inset),
    ).normalize(),
  );

  const positions: number[] = [];
  const normals: number[] = [];
  const railPositions: number[] = [];
  const edge = new THREE.Vector3();
  const radial = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const d = new THREE.Vector3();

  for (let i = 0; i < sides; i++) {
    const d0 = ringDirs[i]!;
    const d1 = ringDirs[(i + 1) % sides]!;
    a.copy(d0).multiplyScalar(rBottom);
    b.copy(d1).multiplyScalar(rBottom);
    c.copy(d1).multiplyScalar(rTop);
    d.copy(d0).multiplyScalar(rTop);

    edge.subVectors(b, a);
    radial.copy(a).normalize();
    nrm.crossVectors(edge, radial).normalize();
    if (nrm.dot(center) < 0) nrm.negate();

    // Two triangles for the wall panel (a-b-c, a-c-d)
    positions.push(
      a.x,
      a.y,
      a.z,
      b.x,
      b.y,
      b.z,
      c.x,
      c.y,
      c.z,
      a.x,
      a.y,
      a.z,
      c.x,
      c.y,
      c.z,
      d.x,
      d.y,
      d.z,
    );
    for (let k = 0; k < 6; k++) normals.push(nrm.x, nrm.y, nrm.z);

    railPositions.push(d.x, d.y, d.z, c.x, c.y, c.z);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));

  const wall = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      emissive: new THREE.Color(color),
      emissiveIntensity: selected ? 0.55 : 0.22,
      roughness: isPent ? 0.35 : 0.5,
      metalness: isPent ? 0.55 : 0.35,
      transparent: true,
      opacity: selected ? 0.92 : 0.78,
      side: THREE.DoubleSide,
      depthWrite: true,
    }),
  );

  const railGeo = new THREE.BufferGeometry();
  railGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(railPositions, 3),
  );
  const rail = new THREE.LineSegments(
    railGeo,
    new THREE.LineBasicMaterial({
      color: selected ? "#e8f4ff" : color,
      transparent: true,
      opacity: selected ? 0.95 : 0.7,
    }),
  );
  rail.userData = { kind: "decor" };

  // Faction-tinted fill — click anywhere on the hex to select this army.
  const pickCenter = center.clone().multiplyScalar(ARMY_PICK_RADIUS + stackLift);
  const pickRing = tile.ring.map((p) =>
    new THREE.Vector3(
      p.x * ARMY_PICK_INSET + tile.center.x * (1 - ARMY_PICK_INSET),
      p.y * ARMY_PICK_INSET + tile.center.y * (1 - ARMY_PICK_INSET),
      p.z * ARMY_PICK_INSET + tile.center.z * (1 - ARMY_PICK_INSET),
    )
      .normalize()
      .multiplyScalar(ARMY_PICK_RADIUS + stackLift),
  );
  const pickPositions: number[] = [];
  const pickNormals: number[] = [];
  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();
  const tmpN = new THREE.Vector3();
  for (let i = 0; i < pickRing.length; i++) {
    let pa = pickRing[i]!;
    let pb = pickRing[(i + 1) % pickRing.length]!;
    tmpA.subVectors(pa, pickCenter);
    tmpB.subVectors(pb, pickCenter);
    tmpN.crossVectors(tmpA, tmpB);
    if (tmpN.dot(pickCenter) < 0) {
      const swap = pa;
      pa = pb;
      pb = swap;
      tmpN.negate();
    }
    tmpN.normalize();
    pickPositions.push(
      pickCenter.x,
      pickCenter.y,
      pickCenter.z,
      pa.x,
      pa.y,
      pa.z,
      pb.x,
      pb.y,
      pb.z,
    );
    for (let k = 0; k < 3; k++) pickNormals.push(tmpN.x, tmpN.y, tmpN.z);
  }
  const pickGeo = new THREE.BufferGeometry();
  pickGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(pickPositions, 3),
  );
  pickGeo.setAttribute(
    "normal",
    new THREE.Float32BufferAttribute(pickNormals, 3),
  );
  const pickPad = new THREE.Mesh(
    pickGeo,
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(color),
      transparent: true,
      opacity: selected ? ARMY_SHADE_OPACITY_SELECTED : ARMY_SHADE_OPACITY,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  pickPad.renderOrder = 2;

  return { wall, rail, pickPad };
}

/** Rebuild wall children for a detachment group onto a tile. */
function setArmyWallTile(
  root: THREE.Object3D,
  tileIndex: number,
  color: string,
  selected: boolean,
  stackIndex = 0,
) {
  while (root.children.length > 0) {
    const child = root.children[0]!;
    root.remove(child);
    disposeObjectTree(child);
  }
  const dir = dirFromTileIndex(tileIndex);
  const { wall, rail, pickPad } = buildArmyWallParts(
    tileIndex,
    color,
    selected,
    stackIndex,
  );
  const armyId = root.userData.armyId as string;
  const armyData = { kind: "army" as const, armyId, dir: { ...dir }, tileIndex };
  wall.userData = armyData;
  pickPad.userData = armyData;
  root.userData.dir = { ...dir };
  root.userData.tileIndex = tileIndex;
  root.userData.color = color;
  root.userData.selected = selected;
  root.userData.stackIndex = stackIndex;
  root.userData.isPentagon =
    (planetSphere().tiles[tileIndex]?.ring.length ?? 6) === 5;
  // Pick pad first so the filled hex wins over neighboring thin walls.
  root.add(pickPad, wall, rail);
}

function createArmyWallMarker(
  army: Army,
  color: string,
  selected: boolean,
  tileIndex: number,
  stackIndex = 0,
): THREE.Group {
  const root = new THREE.Group();
  root.userData = {
    kind: "army",
    armyId: army.id,
    dir: { ...dirFromTileIndex(tileIndex) },
    tileIndex,
    color,
    selected,
    stackIndex,
  };
  setArmyWallTile(root, tileIndex, color, selected, stackIndex);
  return root;
}

function buildArmyMarkers(
  armies: Army[],
  _symbols: ArmySymbol[],
  factions: Faction[],
  selectedArmyId: string | null,
): THREE.Group {
  const group = new THREE.Group();
  const stackByTile = new Map<number, number>();
  for (const army of armies) {
    const tileIndex = nearestTileIndex(planetSphere(), army.dir);
    const stackIndex = stackByTile.get(tileIndex) ?? 0;
    stackByTile.set(tileIndex, stackIndex + 1);
    group.add(
      createArmyWallMarker(
        army,
        unitColor(factions, army.factionId, "#4fd2ff"),
        selectedArmyId === army.id,
        tileIndex,
        stackIndex,
      ),
    );
  }
  return group;
}

type OverlayState = {
  cities: City[];
  independentDistricts: District[];
  structures: PlanetStructure[];
  tileClaims: Record<string, string>;
  tileTerrain: Record<string, string>;
  armies: Army[];
  famousBattleSites: FamousBattleSite[];
  symbols: ArmySymbol[];
  factions: Faction[];
  selectedCityId: string | null;
  selectedDistrictId: string | null;
  selectedStructureId: string | null;
  selectedArmyId: string | null;
  selectedFamousBattleId: string | null;
  engageArmyId: string | null;
  showDistrictRuleWarnings: boolean;
};

export function HexPlanet({
  planetId,
  planetType,
  classification,
  accentColor,
  cities,
  independentDistricts = [],
  structures,
  tileClaims,
  tileTerrain = {},
  armies,
  famousBattleSites = [],
  symbols,
  factions,
  selectedCityId,
  selectedDistrictId,
  selectedStructureId,
  selectedArmyId,
  selectedFamousBattleId = null,
  placingArmyId,
  showDistrictRuleWarnings = false,
  engageArmyId = null,
  terrainPaintFactionId,
  terrainPaintKind = null,
  surfacePlaceActive = false,
  surfaceEraseActive = false,
  onSelectSettlement,
  onSelectStructure,
  onSelectArmy,
  onSelectFamousBattle,
  onPlaceArmy,
  onMoveArmy,
  onEngageArmy,
  onClaimTiles,
  onPaintTerrain,
  onPlaceAtTile,
}: HexPlanetProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const onSelectSettlementRef = useRef(onSelectSettlement);
  const onSelectStructureRef = useRef(onSelectStructure);
  const onSelectArmyRef = useRef(onSelectArmy);
  const onSelectFamousBattleRef = useRef(onSelectFamousBattle);
  const onPlaceArmyRef = useRef(onPlaceArmy);
  const onMoveArmyRef = useRef(onMoveArmy);
  const onEngageArmyRef = useRef(onEngageArmy);
  const onClaimTilesRef = useRef(onClaimTiles);
  const onPaintTerrainRef = useRef(onPaintTerrain);
  const onPlaceAtTileRef = useRef(onPlaceAtTile);
  const placingRef = useRef(placingArmyId);
  const paintRef = useRef(terrainPaintFactionId);
  const kindPaintRef = useRef(terrainPaintKind);
  const surfacePlaceRef = useRef(surfacePlaceActive);
  const surfaceEraseRef = useRef(surfaceEraseActive);
  const citiesRef = useRef(cities);
  const independentDistrictsRef = useRef(independentDistricts);
  const structuresRef = useRef(structures);
  const armiesRef = useRef(armies);
  const selectedArmyIdRef = useRef(selectedArmyId);
  const engageArmyIdRef = useRef(engageArmyId);
  const engageTargetsRef = useRef<Map<number, string[]>>(new Map());
  const accentRef = useRef(accentColor);
  onSelectSettlementRef.current = onSelectSettlement;
  onSelectStructureRef.current = onSelectStructure;
  onSelectArmyRef.current = onSelectArmy;
  onSelectFamousBattleRef.current = onSelectFamousBattle;
  onPlaceArmyRef.current = onPlaceArmy;
  onMoveArmyRef.current = onMoveArmy;
  onEngageArmyRef.current = onEngageArmy;
  onClaimTilesRef.current = onClaimTiles;
  onPaintTerrainRef.current = onPaintTerrain;
  onPlaceAtTileRef.current = onPlaceAtTile;
  placingRef.current = placingArmyId;
  paintRef.current = terrainPaintFactionId;
  kindPaintRef.current = terrainPaintKind;
  surfacePlaceRef.current = surfacePlaceActive;
  surfaceEraseRef.current = surfaceEraseActive;
  citiesRef.current = cities;
  independentDistrictsRef.current = independentDistricts;
  structuresRef.current = structures;
  armiesRef.current = armies;
  selectedArmyIdRef.current = selectedArmyId;
  engageArmyIdRef.current = engageArmyId;
  accentRef.current = accentColor;

  const occupiedTilesRef = useRef<Set<number>>(new Set());
  occupiedTilesRef.current = settlementTileSet(
    cities,
    structures,
    independentDistricts,
  );

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = Math.max(1, mount.clientWidth || 640);
    const height = Math.max(1, mount.clientHeight || 480);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    camera.position.set(0, 0.35, 4.2);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height, false);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0xffffff, 0.72);
    const key = new THREE.DirectionalLight(0xfff5e6, 1.05);
    key.position.set(3.5, 2.2, 4);
    const fillLight = new THREE.DirectionalLight(0xa8c4d8, 0.45);
    fillLight.position.set(-3, -0.5, 2);
    const rim = new THREE.DirectionalLight(
      new THREE.Color(accentRef.current),
      0.35,
    );
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
      tileTerrain,
      independentDistricts,
    ));
    planet.add(surface, seams);

    let borders = buildBorderLines(
      cities,
      factions,
      tileClaims,
      structures,
      independentDistricts,
    );
    planet.add(borders);

    let settlements = buildSettlementMarkers(
      cities,
      factions,
      selectedCityId,
      selectedDistrictId,
      accentRef.current,
      independentDistricts,
      {
        showRuleWarnings: showDistrictRuleWarnings,
        planet: {
          cities,
          independentDistricts,
          structures,
        },
        tileClaims,
        structures,
      },
    );
    planet.add(settlements);

    let structureMarkers = buildStructureMarkers(
      structures,
      factions,
      selectedStructureId,
      accentRef.current,
    );
    planet.add(structureMarkers);

    let supplyLinks = buildSupplyLinkLines(
      cities,
      structures,
      independentDistricts,
    );
    planet.add(supplyLinks);

    let interactionLinks = buildInteractionLinkLines({
      cities,
      independentDistricts,
      structures,
    });
    planet.add(interactionLinks);

    let armyMarkers = buildArmyMarkers(
      armies,
      symbols,
      factions,
      selectedArmyId,
    );
    planet.add(armyMarkers);

    let famousBattleMarkers = buildFamousBattleMarkers(
      famousBattleSites,
      selectedFamousBattleId,
    );
    planet.add(famousBattleMarkers);
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
    let engageHighlightRoot: THREE.Group | null = null;
    let armyDrag: {
      armyId: string;
      marker: THREE.Object3D;
      startTileIndex: number;
      color: string;
      selected: boolean;
      stackIndex: number;
      tileIndex: number | null;
    } | null = null;
    let terrainPaint: {
      lastTile: number | null;
      pending: Map<number, string | null>;
      mode: "faction" | "biome";
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

    const clearEngageHighlights = () => {
      if (!engageHighlightRoot) return;
      planet.remove(engageHighlightRoot);
      disposeGroup(engageHighlightRoot);
      engageHighlightRoot = null;
    };

    const refreshEngageHighlights = (
      armiesList: Army[],
      attackerId: string | null,
    ) => {
      clearEngageHighlights();
      if (!attackerId) {
        engageTargetsRef.current = new Map();
        return;
      }
      const targets = engageTargetsForArmy(
        armiesList,
        attackerId,
        planetSphere(),
      );
      engageTargetsRef.current = targets;
      if (targets.size === 0) return;
      const root = new THREE.Group();
      root.userData = { kind: "engage-highlights" };
      for (const tileIndex of targets.keys()) {
        root.add(buildTileHighlight(tileIndex, ENGAGE_HIGHLIGHT));
      }
      engageHighlightRoot = root;
      planet.add(root);
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
      tileHighlight = buildTileHighlight(tileIndex, accentRef.current);
      planet.add(tileHighlight);
    };

    const setPointerFromEvent = (e: { clientX: number; clientY: number }) => {
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
      if (!terrainPaint) return;
      const tileIndex = tileIndexFromSurfaceHit();
      if (tileIndex == null) {
        setHighlightedTile(null);
        return;
      }
      setHighlightedTile(tileIndex);
      if (terrainPaint.lastTile === tileIndex) return;

      if (terrainPaint.mode === "faction") {
        const brush = paintRef.current;
        if (brush == null) return;
        terrainPaint.lastTile = tileIndex;
        const factionId = brush === TERRAIN_PAINT_ERASE ? null : brush;
        terrainPaint.pending.set(tileIndex, factionId);
        return;
      }

      const brush = kindPaintRef.current;
      if (brush == null) return;
      terrainPaint.lastTile = tileIndex;
      const kind = brush === TERRAIN_KIND_ERASE ? null : brush;
      terrainPaint.pending.set(tileIndex, kind);
    };

    const endArmyDrag = (commit: boolean) => {
      if (!armyDrag) return;
      const {
        armyId,
        marker,
        startTileIndex,
        color,
        selected,
        stackIndex,
        tileIndex,
      } = armyDrag;
      armyDrag = null;
      controls.enabled = true;
      if (commit && tileIndex != null) {
        const accepted = onMoveArmyRef.current(
          armyId,
          dirFromTileIndex(tileIndex),
        );
        if (!accepted) {
          setArmyWallTile(
            marker,
            startTileIndex,
            color,
            selected,
            stackIndex,
          );
        }
      } else {
        setArmyWallTile(marker, startTileIndex, color, selected, stackIndex);
      }
      clearTileHighlight();
    };

    const endTerrainPaint = (commit: boolean) => {
      if (!terrainPaint) return;
      const pending = terrainPaint.pending;
      const mode = terrainPaint.mode;
      terrainPaint = null;
      controls.enabled = true;
      clearTileHighlight();
      if (!commit || pending.size === 0) return;
      const batch: Record<number, string | null> = {};
      for (const [tileIndex, value] of pending) {
        batch[tileIndex] = value;
      }
      if (mode === "biome") {
        onPaintTerrainRef.current?.(batch);
      } else {
        onClaimTilesRef.current(batch);
      }
    };

    const onContextMenu = (e: Event) => {
      e.preventDefault();
    };

    const tryEngageAtTile = (tileIndex: number, preferArmyId?: string) => {
      const attackerId = engageArmyIdRef.current;
      const engage = onEngageArmyRef.current;
      if (!attackerId || !engage) return false;
      const defenders = engageTargetsRef.current.get(tileIndex);
      if (!defenders || defenders.length === 0) return false;
      const defenderId =
        (preferArmyId && defenders.includes(preferArmyId)
          ? preferArmyId
          : defenders[0]) ?? null;
      if (!defenderId) return false;
      engage(attackerId, defenderId);
      return true;
    };

    const onPointerDown = (e: PointerEvent) => {
      faceAnim = null;

      if (e.button === 2) {
        e.preventDefault();
        setPointerFromEvent(e);
        const dragHits = raycaster.intersectObjects(
          [...armyMarkers.children, surface],
          true,
        );
        let armyRoot: THREE.Object3D | null = null;
        const surfaceHit = dragHits.find((h) => h.object === surface);
        if (surfaceHit) {
          const tileIndex = nearestTileIndex(
            planetSphere(),
            localDirFromWorldPoint(surfaceHit.point),
          );
          const onTile = armiesOnTile(armiesRef.current, tileIndex);
          if (onTile.length > 0) {
            const preferId = selectedArmyIdRef.current;
            const chosen =
              (preferId && onTile.find((a) => a.id === preferId)) ||
              onTile[onTile.length - 1]!;
            armyRoot =
              armyMarkers.children.find(
                (c) => c.userData?.armyId === chosen.id,
              ) ?? null;
          }
        }
        if (!armyRoot) {
          const armyHit = dragHits.find((h) => armyRootFromHit(h.object));
          armyRoot = armyHit ? armyRootFromHit(armyHit.object) : null;
        }
        if (armyRoot) {
          const armyId = armyRoot.userData.armyId as string;
          const startTileIndex =
            typeof armyRoot.userData.tileIndex === "number"
              ? (armyRoot.userData.tileIndex as number)
              : nearestTileIndex(
                  planetSphere(),
                  armyRoot.userData.dir as SphereDir,
                );
          armyDrag = {
            armyId,
            marker: armyRoot,
            startTileIndex,
            color: (armyRoot.userData.color as string) ?? "#4fd2ff",
            selected: Boolean(armyRoot.userData.selected),
            stackIndex: Number(armyRoot.userData.stackIndex ?? 0),
            tileIndex: null,
          };
          controls.enabled = false;
          onSelectArmyRef.current(armyId);
          renderer.domElement.setPointerCapture(e.pointerId);
        }
        return;
      }

      if (e.button !== 0) return;

      if (
        !placingRef.current &&
        !surfacePlaceRef.current &&
        (paintRef.current != null || kindPaintRef.current != null)
      ) {
        setPointerFromEvent(e);
        terrainPaint = {
          lastTile: null,
          pending: new Map(),
          mode: kindPaintRef.current != null ? "biome" : "faction",
        };
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
      if (armyDrag.tileIndex !== tileIndex) {
        armyDrag.tileIndex = tileIndex;
        setArmyWallTile(
          armyDrag.marker,
          tileIndex,
          armyDrag.color,
          armyDrag.selected,
          armyDrag.stackIndex,
        );
      }
      setHighlightedTile(tileIndex);
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
        ...famousBattleMarkers.children,
        ...armyMarkers.children,
        ...settlements.children,
        ...structureMarkers.children,
        surface,
      ];
      // recursive: authored district GLBs may be groups (or share child meshes)
      const hits = raycaster.intersectObjects(pickables, true);

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

      if (surfacePlaceRef.current && onPlaceAtTileRef.current) {
        const surfaceHit = hits.find((h) => h.object === surface);
        if (surfaceHit) {
          const tileIndex = nearestTileIndex(
            planetSphere(),
            localDirFromWorldPoint(surfaceHit.point),
          );
          if (
            surfaceEraseRef.current ||
            !occupiedTilesRef.current.has(tileIndex)
          ) {
            onPlaceAtTileRef.current(tileIndex);
          }
          return;
        }
      }

      const famousHit = hits.find(
        (h) => h.object.userData?.kind === "famous-battle",
      );
      if (famousHit) {
        const siteId = famousHit.object.userData.siteId as string;
        onSelectFamousBattleRef.current?.(siteId);
        return;
      }

      // Prefer building meshes (walk parents — district GLBs hit children),
      // then surface, then army. Army pick pads must not steal district clicks.
      const buildingHit = hits.find((h) => settlementRootFromHit(h.object));
      const surfaceHit = hits.find((h) => h.object === surface);
      const armyHit = hits.find((h) => armyRootFromHit(h.object));
      const tileProbe = buildingHit ?? surfaceHit ?? armyHit;

      const selectFeatureOnTile = (tileIndex: number): boolean => {
        const feature = featureAtTile(
          tileIndex,
          citiesRef.current,
          structuresRef.current,
          independentDistrictsRef.current,
        );
        if (!feature) return false;
        onSelectFamousBattleRef.current?.(null);
        if (feature.kind === "structure") {
          onSelectStructureRef.current(feature.structureId);
        } else if (feature.kind === "district") {
          onSelectSettlementRef.current(feature.cityId, feature.districtId);
        } else {
          onSelectSettlementRef.current(feature.cityId, null);
        }
        return true;
      };

      if (tileProbe) {
        const tileIndex = nearestTileIndex(
          planetSphere(),
          localDirFromWorldPoint(tileProbe.point),
        );
        const onTile = armiesOnTile(armiesRef.current, tileIndex);
        if (onTile.length > 0) {
          const preferId = selectedArmyIdRef.current;
          const alreadySelected =
            preferId != null && onTile.some((a) => a.id === preferId);
          if (alreadySelected) {
            // Second click: reach buildings under the selected detachment.
            if (selectFeatureOnTile(tileIndex)) return;
            onSelectFamousBattleRef.current?.(null);
            return;
          }
          onSelectFamousBattleRef.current?.(null);
          const chosen =
            (preferId && onTile.find((a) => a.id === preferId)) ||
            onTile[onTile.length - 1]!;
          if (tryEngageAtTile(tileIndex, chosen.id)) return;
          onSelectArmyRef.current(chosen.id);
          return;
        }

        // No detachment on this hex — select district/structure here and stop.
        // Do not fall through to neighboring army pick pads.
        if (tryEngageAtTile(tileIndex)) return;
        if (buildingHit) {
          const root = settlementRootFromHit(buildingHit.object)!;
          const kind = root.userData?.kind;
          onSelectFamousBattleRef.current?.(null);
          if (kind === "structure") {
            onSelectStructureRef.current(root.userData.structureId as string);
            return;
          }
          if (kind === "city" || kind === "district") {
            onSelectSettlementRef.current(
              root.userData.cityId as string | null,
              (root.userData.districtId as string | null) ?? null,
            );
            return;
          }
        }
        if (selectFeatureOnTile(tileIndex)) return;
        onSelectFamousBattleRef.current?.(null);
        return;
      }

      // Rare: only an army mesh was hit (no surface). Require the click point
      // to lie on that army's own tile so pads can't claim neighbors.
      if (armyHit) {
        const armyRoot = armyRootFromHit(armyHit.object)!;
        const armyId = armyRoot.userData.armyId as string;
        const armyTile =
          typeof armyRoot.userData.tileIndex === "number"
            ? (armyRoot.userData.tileIndex as number)
            : nearestTileIndex(
                planetSphere(),
                armyRoot.userData.dir as SphereDir,
              );
        const clickTile = nearestTileIndex(
          planetSphere(),
          localDirFromWorldPoint(armyHit.point),
        );
        if (clickTile !== armyTile) {
          if (selectFeatureOnTile(clickTile)) return;
          onSelectFamousBattleRef.current?.(null);
          return;
        }
        if (selectedArmyIdRef.current === armyId) {
          if (selectFeatureOnTile(armyTile)) return;
        }
        if (tryEngageAtTile(armyTile, armyId)) return;
        onSelectFamousBattleRef.current?.(null);
        onSelectArmyRef.current(armyId);
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

    refreshEngageHighlights(armies, engageArmyId);

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
      renderer.render(scene, camera);
    };
    tick();

    const onResize = () => {
      if (!mount) return;
      const w = Math.max(1, mount.clientWidth);
      const h = Math.max(1, mount.clientHeight);
      if (w < 2 || h < 2) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    let lastOverlayState: OverlayState | null = null;

    const refreshOverlays = (state: OverlayState) => {
      perfMark("hex-refresh-start");
      if (armyDrag) {
        endArmyDrag(false);
      }
      // Keep paint stroke state; only clear highlight when idle.
      if (!terrainPaint) clearTileHighlight();

      const prev = lastOverlayState;
      const meshDirty =
        !prev ||
        prev.cities !== state.cities ||
        prev.independentDistricts !== state.independentDistricts ||
        prev.structures !== state.structures ||
        prev.tileClaims !== state.tileClaims ||
        prev.tileTerrain !== state.tileTerrain ||
        prev.factions !== state.factions;

      const markersDirty =
        meshDirty ||
        !prev ||
        prev.selectedCityId !== state.selectedCityId ||
        prev.selectedDistrictId !== state.selectedDistrictId ||
        prev.selectedStructureId !== state.selectedStructureId ||
        prev.selectedArmyId !== state.selectedArmyId ||
        prev.selectedFamousBattleId !== state.selectedFamousBattleId ||
        prev.showDistrictRuleWarnings !== state.showDistrictRuleWarnings ||
        prev.armies !== state.armies ||
        prev.famousBattleSites !== state.famousBattleSites ||
        prev.symbols !== state.symbols;

      if (meshDirty) {
        planet.remove(surface, seams, borders, supplyLinks, interactionLinks);
        disposeGroup(surface);
        disposeGroup(seams);
        disposeGroup(borders);
        disposeGroup(supplyLinks);
        disposeGroup(interactionLinks);

        ({ surface, seams } = perfTime("buildPlanetMeshes", () =>
          buildPlanetMeshes(
            planetId,
            planetType,
            classification,
            state.cities,
            state.factions,
            state.tileClaims,
            state.structures,
            state.tileTerrain,
            state.independentDistricts,
          ),
        ));
        borders = buildBorderLines(
          state.cities,
          state.factions,
          state.tileClaims,
          state.structures,
          state.independentDistricts,
        );
        supplyLinks = buildSupplyLinkLines(
          state.cities,
          state.structures,
          state.independentDistricts,
        );
        interactionLinks = buildInteractionLinkLines({
          cities: state.cities,
          independentDistricts: state.independentDistricts,
          structures: state.structures,
        });
        planet.add(surface, seams, borders, supplyLinks, interactionLinks);
      }

      if (markersDirty) {
        planet.remove(
          settlements,
          structureMarkers,
          armyMarkers,
          famousBattleMarkers,
        );
        disposeGroup(settlements);
        disposeGroup(structureMarkers);
        disposeGroup(armyMarkers);
        disposeGroup(famousBattleMarkers);

        settlements = buildSettlementMarkers(
          state.cities,
          state.factions,
          state.selectedCityId,
          state.selectedDistrictId,
          accentRef.current,
          state.independentDistricts,
          {
            showRuleWarnings: state.showDistrictRuleWarnings,
            planet: {
              cities: state.cities,
              independentDistricts: state.independentDistricts,
              structures: state.structures,
            },
            tileClaims: state.tileClaims,
            structures: state.structures,
          },
        );
        structureMarkers = buildStructureMarkers(
          state.structures,
          state.factions,
          state.selectedStructureId,
          accentRef.current,
        );
        armyMarkers = buildArmyMarkers(
          state.armies,
          state.symbols,
          state.factions,
          state.selectedArmyId,
        );
        famousBattleMarkers = buildFamousBattleMarkers(
          state.famousBattleSites,
          state.selectedFamousBattleId,
        );
        planet.add(
          settlements,
          structureMarkers,
          armyMarkers,
          famousBattleMarkers,
        );
      }

      if (
        meshDirty ||
        markersDirty ||
        !prev ||
        prev.engageArmyId !== state.engageArmyId ||
        prev.armies !== state.armies
      ) {
        refreshEngageHighlights(state.armies, state.engageArmyId);
      }

      lastOverlayState = state;
      perfMeasure(
        meshDirty ? "refreshOverlays(mesh)" : "refreshOverlays(markers)",
        "hex-refresh-start",
      );
    };

    (
      mount as HTMLDivElement & {
        __refreshOverlays?: typeof refreshOverlays;
        __faceFeature?: typeof faceFeature;
        __setAccent?: (color: string) => void;
      }
    ).__refreshOverlays = refreshOverlays;

    // Swap in authored district GLBs once they finish loading.
    void ensureDistrictModelsLoaded().then(() => {
      if (!lastOverlayState) return;
      const el = mount as HTMLDivElement & {
        __refreshOverlays?: typeof refreshOverlays;
      };
      // Null prev so refreshOverlays treats overlays as dirty and rebuilds markers.
      const snap = lastOverlayState;
      lastOverlayState = null;
      el.__refreshOverlays?.(snap);
    });
    (
      mount as HTMLDivElement & {
        __faceFeature?: typeof faceFeature;
      }
    ).__faceFeature = faceFeature;
    (
      mount as HTMLDivElement & {
        __setAccent?: (color: string) => void;
      }
    ).__setAccent = (color: string) => {
      rim.color.set(color);
    };

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
      delete (mount as HTMLDivElement & { __setAccent?: unknown }).__setAccent;
      clearTileHighlight();
      clearEngageHighlights();
      core.geometry.dispose();
      (core.material as THREE.Material).dispose();
      disposeGroup(surface);
      disposeGroup(seams);
      disposeGroup(borders);
      disposeGroup(settlements);
      disposeGroup(structureMarkers);
      disposeGroup(supplyLinks);
      disposeGroup(interactionLinks);
      disposeGroup(armyMarkers);
      disposeGroup(famousBattleMarkers);
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planetId, planetType, classification]);

  useEffect(() => {
    const mount = mountRef.current as
      | (HTMLDivElement & {
          __refreshOverlays?: (state: OverlayState) => void;
        })
      | null;
    mount?.__refreshOverlays?.({
      cities,
      independentDistricts,
      structures,
      tileClaims,
      tileTerrain,
      armies,
      famousBattleSites,
      symbols,
      factions,
      selectedCityId,
      selectedDistrictId,
      selectedStructureId,
      selectedArmyId,
      selectedFamousBattleId: selectedFamousBattleId ?? null,
      engageArmyId: engageArmyId ?? null,
      showDistrictRuleWarnings,
    });
  }, [
    cities,
    independentDistricts,
    structures,
    tileClaims,
    tileTerrain,
    armies,
    famousBattleSites,
    symbols,
    factions,
    selectedCityId,
    selectedDistrictId,
    selectedStructureId,
    selectedArmyId,
    selectedFamousBattleId,
    engageArmyId,
    showDistrictRuleWarnings,
  ]);

  // Update rim light without remounting (remount was resetting the camera).
  useEffect(() => {
    const mount = mountRef.current as
      | (HTMLDivElement & { __setAccent?: (color: string) => void })
      | null;
    mount?.__setAccent?.(accentColor);
  }, [accentColor]);

  // Rotate so the selected army / city / district / structure / battle faces the user
  const lastFacedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    lastFacedKeyRef.current = null;
  }, [planetId]);
  useEffect(() => {
    // Don't spin the globe while painting — keeps the camera stable.
    if (terrainPaintFactionId != null || terrainPaintKind != null) return;

    const mount = mountRef.current as
      | (HTMLDivElement & {
          __faceFeature?: (dir: SphereDir) => void;
        })
      | null;
    if (!mount?.__faceFeature) return;

    const focusKey = selectedFamousBattleId
      ? `famous:${selectedFamousBattleId}`
      : selectedArmyId
        ? `army:${selectedArmyId}`
        : selectedStructureId
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
    if (selectedFamousBattleId) {
      dir =
        famousBattleSites.find((s) => s.id === selectedFamousBattleId)?.dir ??
        null;
    } else if (selectedArmyId) {
      dir =
        armiesRef.current.find((a) => a.id === selectedArmyId)?.dir ?? null;
    } else if (selectedStructureId) {
      dir =
        structuresRef.current.find((s) => s.id === selectedStructureId)?.dir ??
        null;
    } else if (selectedDistrictId) {
      for (const city of citiesRef.current) {
        const district = city.districts.find(
          (d) => d.id === selectedDistrictId,
        );
        if (district) {
          dir = dirFromTileIndex(district.tileIndex);
          break;
        }
      }
      if (!dir) {
        const indie = independentDistrictsRef.current.find(
          (d) => d.id === selectedDistrictId,
        );
        if (indie) dir = dirFromTileIndex(indie.tileIndex);
      }
    } else if (selectedCityId) {
      const city = citiesRef.current.find((c) => c.id === selectedCityId);
      if (city) dir = dirFromTileIndex(city.tileIndex);
    }

    if (dir) mount.__faceFeature(dir);
  }, [
    selectedFamousBattleId,
    selectedArmyId,
    selectedCityId,
    selectedDistrictId,
    selectedStructureId,
    armies,
    famousBattleSites,
    terrainPaintFactionId,
    terrainPaintKind,
  ]);

  return (
    <div
      ref={mountRef}
      className={`w-full h-full min-h-0 touch-none ${
        placingArmyId ||
        terrainPaintFactionId ||
        terrainPaintKind ||
        surfacePlaceActive
          ? "cursor-crosshair"
          : "cursor-grab active:cursor-grabbing"
      }`}
      aria-label="Rotatable hex planet"
    />
  );
}
