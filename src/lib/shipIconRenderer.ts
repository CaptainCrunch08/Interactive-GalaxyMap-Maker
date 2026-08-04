import * as THREE from "three";
import type { ShipChassis } from "../types/campaign";
import { getShipGeometry } from "./shipMeshes";

const ICON_SIZE = 128;
const cache = new Map<string, string>();

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.OrthographicCamera | null = null;
let mesh: THREE.Mesh | null = null;
let material: THREE.MeshStandardMaterial | null = null;

function ensurePipeline() {
  if (renderer) return;

  const canvas = document.createElement("canvas");
  canvas.width = ICON_SIZE;
  canvas.height = ICON_SIZE;

  renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setSize(ICON_SIZE, ICON_SIZE, false);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  scene = new THREE.Scene();

  const frustum = 1.15;
  camera = new THREE.OrthographicCamera(
    -frustum,
    frustum,
    frustum,
    -frustum,
    0.1,
    20,
  );
  // Isometric-ish game view
  camera.position.set(2.2, 1.6, 2.4);
  camera.lookAt(0, 0, 0);

  const key = new THREE.DirectionalLight(0xffffff, 1.35);
  key.position.set(3, 5, 2);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x88aacc, 0.45);
  fill.position.set(-2, 1, -1);
  scene.add(fill);
  scene.add(new THREE.AmbientLight(0x405060, 0.55));

  material = new THREE.MeshStandardMaterial({
    color: 0x8899aa,
    metalness: 0.55,
    roughness: 0.38,
    flatShading: true,
  });
  mesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), material);
  scene.add(mesh);
}

function parseColor(hex: string): THREE.Color {
  try {
    return new THREE.Color(hex);
  } catch {
    return new THREE.Color("#6a8296");
  }
}

/** Render a low-poly ship icon (data URL). Cached per chassis + faction color. */
export function getShipIconDataUrl(
  chassis: ShipChassis,
  color: string,
): string {
  if (typeof document === "undefined") return "";

  const key = `${chassis}|${color.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit) return hit;

  ensurePipeline();
  if (!renderer || !scene || !camera || !mesh || !material) return "";

  const geo = getShipGeometry(chassis);
  mesh.geometry = geo;

  // Fit ship into view
  geo.computeBoundingSphere();
  const radius = geo.boundingSphere?.radius ?? 1;
  const scale = 0.95 / Math.max(radius, 0.01);
  mesh.scale.setScalar(scale);
  mesh.rotation.set(0, 0, 0);

  material.color.copy(parseColor(color));
  material.emissive.copy(parseColor(color)).multiplyScalar(0.12);

  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL("image/png");
  cache.set(key, url);
  return url;
}

export function clearShipIconCache() {
  cache.clear();
}
