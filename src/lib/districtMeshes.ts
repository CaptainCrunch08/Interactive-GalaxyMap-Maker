import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { DistrictKind } from "../types/campaign";

/** District kinds that use authored GLB markers from /models/districts/. */
export const DISTRICT_MODEL_KINDS = [
  "spire",
  "bastion",
  "manufactorum",
  "docks",
] as const satisfies readonly DistrictKind[];

export type DistrictModelKind = (typeof DISTRICT_MODEL_KINDS)[number];

const MODEL_URL: Record<DistrictModelKind, string> = {
  spire: "/models/districts/spire.glb",
  bastion: "/models/districts/bastion.glb",
  manufactorum: "/models/districts/manufactorum.glb",
  docks: "/models/districts/docks.glb",
};

/** Default fit: prefer this height, never exceed this XZ span (one hex). */
const DEFAULT_FIT = { height: 0.11, maxFootprint: 0.16 } as const;

/** Per-kind overrides — docks are flat (footprint-led); bastion/spire need more presence. */
const FIT_BY_KIND: Partial<
  Record<DistrictModelKind, { height: number; maxFootprint: number }>
> = {
  docks: { height: 0.11, maxFootprint: 0.18 },
  bastion: { height: 0.175, maxFootprint: 0.2 },
  spire: { height: 0.22, maxFootprint: 0.16 },
};

const geometryCache = new Map<DistrictModelKind, THREE.BufferGeometry>();
let loadPromise: Promise<void> | null = null;

export function isDistrictModelKind(
  kind: DistrictKind,
): kind is DistrictModelKind {
  return (DISTRICT_MODEL_KINDS as readonly string[]).includes(kind);
}

function gatherMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh && mesh.geometry) meshes.push(mesh);
  });
  return meshes;
}

function geometryFromGltfScene(
  root: THREE.Object3D,
  kind: DistrictModelKind,
): THREE.BufferGeometry | null {
  const meshes = gatherMeshes(root);
  if (meshes.length === 0) return null;

  // Bake each mesh's world matrix into a non-indexed clone, then merge.
  root.updateMatrixWorld(true);
  const parts: THREE.BufferGeometry[] = [];
  for (const mesh of meshes) {
    const src = mesh.geometry;
    const geo = src.index ? src.toNonIndexed() : src.clone();
    geo.applyMatrix4(mesh.matrixWorld);
    parts.push(geo);
  }
  const merged = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  if (!merged) return null;

  const fit = FIT_BY_KIND[kind] ?? DEFAULT_FIT;
  // Fit: base at y=0, centered on XZ; prefer height but never exceed maxFootprint.
  merged.computeBoundingBox();
  const box = merged.boundingBox!;
  const size = new THREE.Vector3();
  box.getSize(size);
  const height = Math.max(size.y, 1e-4);
  const footprint = Math.max(size.x, size.z, 1e-4);
  const scale = Math.min(fit.height / height, fit.maxFootprint / footprint);
  const midX = (box.min.x + box.max.x) / 2;
  const midZ = (box.min.z + box.max.z) / 2;
  merged.translate(-midX, -box.min.y, -midZ);
  merged.scale(scale, scale, scale);
  merged.computeVertexNormals();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

/** Ensure district GLBs are loaded (idempotent). */
export function ensureDistrictModelsLoaded(): Promise<void> {
  if (geometryCache.size === DISTRICT_MODEL_KINDS.length) {
    return Promise.resolve();
  }
  if (loadPromise) return loadPromise;

  const loader = new GLTFLoader();
  loadPromise = Promise.all(
    DISTRICT_MODEL_KINDS.map(
      (kind) =>
        new Promise<void>((resolve) => {
          loader.load(
            MODEL_URL[kind],
            (gltf) => {
              const geo = geometryFromGltfScene(gltf.scene, kind);
              if (geo) geometryCache.set(kind, geo);
              else console.warn(`[districtMeshes] empty geometry for ${kind}`);
              resolve();
            },
            undefined,
            (err) => {
              console.warn(`[districtMeshes] failed to load ${kind}`, err);
              resolve();
            },
          );
        }),
    ),
  ).then(() => undefined);

  return loadPromise;
}

export function districtModelsReady(): boolean {
  return geometryCache.size > 0;
}

/**
 * Create a faction-tinted district marker mesh, or null if GLB not loaded.
 * Orientation: +Y up (caller tips it outward from the planet).
 */
export function createDistrictModel(
  kind: DistrictKind,
  colorHex: string,
  selected: boolean,
): THREE.Mesh | null {
  if (!isDistrictModelKind(kind)) return null;
  const geo = geometryCache.get(kind);
  if (!geo) return null;
  const color = new THREE.Color(colorHex);
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      color,
      emissive: color.clone().multiplyScalar(0.35),
      emissiveIntensity: selected ? 0.55 : 0.12,
      roughness: 0.5,
      metalness: 0.35,
      flatShading: true,
    }),
  );
  return mesh;
}
