import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

type Parts = THREE.BufferGeometry[];

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
  g.rotateX(rx);
  g.rotateY(ry);
  g.rotateZ(rz);
  g.translate(x, y, z);
  parts.push(g);
}

function addCyl(
  parts: Parts,
  rTop: number,
  rBot: number,
  h: number,
  seg: number,
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0,
) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg);
  g.rotateX(rx);
  g.rotateY(ry);
  g.rotateZ(rz);
  g.translate(x, y, z);
  parts.push(g);
}

function addCone(
  parts: Parts,
  r: number,
  h: number,
  seg: number,
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0,
) {
  const g = new THREE.ConeGeometry(r, h, seg);
  g.rotateX(rx);
  g.rotateY(ry);
  g.rotateZ(rz);
  g.translate(x, y, z);
  parts.push(g);
}

function finalize(parts: Parts): THREE.BufferGeometry {
  const usable = parts.filter(Boolean);
  const merged = mergeGeometries(usable, false);
  for (const g of usable) g.dispose();
  if (!merged) {
    return new THREE.BoxGeometry(0.2, 0.2, 0.2);
  }
  merged.computeVertexNormals();
  return merged;
}

/**
 * Gothic-industrial crescent hull (arms up), inspired by a horseshoe warp station.
 * Local space: +Y up, portal sits near origin facing +Z.
 */
function buildHullGeometry(): THREE.BufferGeometry {
  const p: Parts = [];

  // Main crescent — thick torus arc, opening upward (+Y)
  const arc = new THREE.TorusGeometry(1.15, 0.32, 18, 64, Math.PI * 1.42);
  arc.rotateZ(-Math.PI * 0.71); // center the opening at top
  p.push(arc);

  // Inner rim plating
  const inner = new THREE.TorusGeometry(0.98, 0.12, 12, 48, Math.PI * 1.38);
  inner.rotateZ(-Math.PI * 0.69);
  p.push(inner);

  // Outer armor ribs along the crescent
  for (let i = 0; i < 14; i++) {
    const t = i / 13;
    const a = -Math.PI * 0.71 + t * Math.PI * 1.42;
    const x = Math.cos(a) * 1.15;
    const y = Math.sin(a) * 1.15;
    addBox(p, 0.1, 0.5, 0.2, x, y, 0.3, 0, 0, a + Math.PI / 2);
    addBox(p, 0.08, 0.38, 0.14, x * 0.92, y * 0.92, -0.28, 0, 0, a + Math.PI / 2);
  }

  // Tip reinforcements
  for (const side of [-1, 1]) {
    const tipA = side < 0 ? -Math.PI * 0.71 : Math.PI * 0.71;
    const tx = Math.cos(tipA) * 1.15;
    const ty = Math.sin(tipA) * 1.15;
    addBox(p, 0.38, 0.55, 0.42, tx, ty, 0.08, 0.15, 0, tipA + Math.PI / 2);
    addBox(p, 0.24, 0.32, 0.28, tx * 1.08, ty * 1.08, 0, 0.1, 0, tipA + Math.PI / 2);
    addCyl(p, 0.09, 0.11, 0.32, 8, tx * 0.9, ty * 0.9, 0.25);
  }

  return finalize(p);
}

/** Dark mechanical hub / relay crown at the base of the crescent. */
function buildHubGeometry(): THREE.BufferGeometry {
  const p: Parts = [];
  addCyl(p, 0.55, 0.7, 0.35, 12, 0, -1.05, 0);
  addCyl(p, 0.4, 0.5, 0.28, 10, 0, -1.28, 0);
  addBox(p, 1.1, 0.18, 0.7, 0, -0.92, 0.05);

  // Antennae / spikes pointing outward-down
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const x = Math.cos(a) * 0.45;
    const z = Math.sin(a) * 0.35;
    addCone(p, 0.045, 0.55, 5, x, -1.55, z, Math.PI, 0, a * 0.15);
    addBox(p, 0.04, 0.35, 0.04, x * 1.1, -1.35, z * 1.1, 0.4, 0, a);
  }

  // Scaffolding clusters
  for (const sx of [-0.55, 0.55]) {
    addBox(p, 0.12, 0.55, 0.12, sx, -1.15, 0.35);
    addBox(p, 0.35, 0.06, 0.06, sx * 0.7, -1.0, 0.45);
    addBox(p, 0.06, 0.06, 0.35, sx, -0.95, 0.25);
  }

  // Central crown spire
  addCyl(p, 0.08, 0.14, 0.5, 8, 0, -0.7, 0.15);
  addCone(p, 0.1, 0.35, 6, 0, -0.4, 0.15);

  return finalize(p);
}

/** Window / aperture emissive plates scattered on the hull. */
function buildWindowGeometry(): THREE.BufferGeometry {
  const p: Parts = [];
  for (let i = 0; i < 48; i++) {
    const t = i / 48;
    const a = -Math.PI * 0.71 + t * Math.PI * 1.42;
    const r = 1.12 + ((i % 3) - 1) * 0.05;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    const z = (i % 2 === 0 ? 0.34 : -0.3);
    addBox(p, 0.04, 0.07, 0.025, x, y, z, 0, 0, a + Math.PI / 2);
  }
  return finalize(p);
}

export type WarpGateMeshBundle = {
  root: THREE.Group;
  portal: THREE.Mesh;
  glow: THREE.Mesh;
  rays: THREE.Group;
  dispose: () => void;
};

/**
 * Build a complete warp-gate station group (hull + hub + cyan portal).
 * Scale ~2 units tall; place and scale as needed.
 */
export function createWarpGateMesh(accentHex = "#4fd2ff"): WarpGateMeshBundle {
  const root = new THREE.Group();
  const accent = new THREE.Color(accentHex);
  const hullColor = new THREE.Color("#c8d0d4");
  const hubColor = new THREE.Color("#1a1e24");

  const hullMat = new THREE.MeshStandardMaterial({
    color: hullColor,
    roughness: 0.72,
    metalness: 0.45,
    flatShading: false,
  });
  const hubMat = new THREE.MeshStandardMaterial({
    color: hubColor,
    roughness: 0.55,
    metalness: 0.65,
  });
  const windowMat = new THREE.MeshStandardMaterial({
    color: accent,
    emissive: accent,
    emissiveIntensity: 1.4,
    roughness: 0.35,
    metalness: 0.2,
  });

  const hullGeo = buildHullGeometry();
  const hubGeo = buildHubGeometry();
  const winGeo = buildWindowGeometry();

  const hull = new THREE.Mesh(hullGeo, hullMat);
  const hub = new THREE.Mesh(hubGeo, hubMat);
  const windows = new THREE.Mesh(winGeo, windowMat);
  root.add(hull, hub, windows);

  // Portal core — bright cyan disc + soft sphere
  const portalGeo = new THREE.CircleGeometry(0.72, 48);
  const portalMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.95,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const portal = new THREE.Mesh(portalGeo, portalMat);
  portal.position.set(0, 0.15, 0.05);
  root.add(portal);

  const glowGeo = new THREE.SphereGeometry(0.55, 24, 16);
  const glowMat = new THREE.MeshBasicMaterial({
    color: accent,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  });
  const glow = new THREE.Mesh(glowGeo, glowMat);
  glow.position.set(0, 0.15, 0.05);
  root.add(glow);

  // Radial light streaks (thin boxes from center)
  const rays = new THREE.Group();
  const rayMat = new THREE.MeshBasicMaterial({
    color: accent,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const len = 0.9 + (i % 3) * 0.35;
    const ray = new THREE.Mesh(
      new THREE.PlaneGeometry(0.04, len),
      rayMat.clone(),
    );
    ray.position.set(
      Math.cos(a) * len * 0.45,
      0.15 + Math.sin(a) * len * 0.45,
      0.08,
    );
    ray.rotation.z = a + Math.PI / 2;
    rays.add(ray);
  }
  root.add(rays);

  // Soft volumetric halo
  const halo = new THREE.Mesh(
    new THREE.RingGeometry(0.65, 1.35, 48),
    new THREE.MeshBasicMaterial({
      color: accent,
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  halo.position.set(0, 0.15, 0.02);
  root.add(halo);

  const dispose = () => {
    hullGeo.dispose();
    hubGeo.dispose();
    winGeo.dispose();
    portalGeo.dispose();
    glowGeo.dispose();
    hullMat.dispose();
    hubMat.dispose();
    windowMat.dispose();
    portalMat.dispose();
    glowMat.dispose();
    rayMat.dispose();
    for (const child of rays.children) {
      const m = child as THREE.Mesh;
      m.geometry.dispose();
      if (Array.isArray(m.material)) m.material.forEach((x) => x.dispose());
      else (m.material as THREE.Material).dispose();
    }
    (halo.material as THREE.Material).dispose();
    halo.geometry.dispose();
  };

  return { root, portal, glow, rays, dispose };
}
