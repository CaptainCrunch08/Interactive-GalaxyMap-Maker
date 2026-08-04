import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { PlanetClassification } from "../../types/campaign";
import { normalizePlanetClassification } from "../../lib/planetClass";
import {
  atmosphereColor,
  getPlanetAlbedoCanvas,
  getPlanetCloudCanvas,
  PLANET_TEX_CLOUDS,
  PLANET_TEX_FULL,
  PLANET_TEX_PREVIEW,
  prefetchPlanetTextures,
} from "../../lib/planetTexture";
import { resolvePlanetVisualModelId } from "../../lib/planetModels";

type PlanetGlobeProps = {
  planetId: string;
  classification: PlanetClassification;
  visualModelId?: string;
  accentColor?: string;
  className?: string;
  onClick?: () => void;
};

let sharedPlanetGeo: THREE.SphereGeometry | null = null;
let sharedCloudGeo: THREE.SphereGeometry | null = null;
let sharedLimbGeo: THREE.SphereGeometry | null = null;

function planetGeo() {
  return (sharedPlanetGeo ??= new THREE.SphereGeometry(1, 64, 48));
}
function cloudGeo() {
  return (sharedCloudGeo ??= new THREE.SphereGeometry(1.012, 48, 32));
}
function limbGeo() {
  return (sharedLimbGeo ??= new THREE.SphereGeometry(1.004, 48, 32));
}

function makeMap(
  canvas: HTMLCanvasElement,
  renderer: THREE.WebGLRenderer,
): THREE.CanvasTexture {
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.ClampToEdgeWrapping;
  map.needsUpdate = true;
  return map;
}

/**
 * Realistic rotating globe for Planet View (not the strategic hex map).
 */
export function PlanetGlobe({
  planetId,
  classification,
  visualModelId,
  accentColor,
  className = "",
  onClick,
}: PlanetGlobeProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const onClickRef = useRef(onClick);
  onClickRef.current = onClick;

  const cls = normalizePlanetClassification(classification);
  const modelId = resolvePlanetVisualModelId(cls, visualModelId, planetId);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let cancelled = false;
    const width = mount.clientWidth || 380;
    const height = mount.clientHeight || 380;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(28, width / height, 0.1, 100);
    camera.position.set(0, 0.02, 4.15);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height, false);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    renderer.domElement.style.borderRadius = "50%";
    renderer.domElement.style.cursor = onClickRef.current
      ? "pointer"
      : "default";
    const handleClick = () => onClickRef.current?.();
    renderer.domElement.addEventListener("click", handleClick);

    // Instant preview (256) — full detail upgrades after first frames.
    const previewAlbedo = getPlanetAlbedoCanvas(cls, modelId, PLANET_TEX_PREVIEW);
    let albedoMap = makeMap(previewAlbedo, renderer);
    let cloudMap = makeMap(
      getPlanetCloudCanvas(cls, modelId, Math.min(256, PLANET_TEX_CLOUDS)),
      renderer,
    );

    const planetMat = new THREE.MeshStandardMaterial({
      map: albedoMap,
      roughness: 0.96,
      metalness: 0,
      envMapIntensity: 0,
      emissive:
        cls === "magma" || cls === "volcanic"
          ? new THREE.Color("#2a0c06")
          : cls === "toxic"
            ? new THREE.Color("#121a06")
            : new THREE.Color("#000000"),
      emissiveIntensity:
        cls === "magma" ? 0.35 : cls === "volcanic" ? 0.18 : 0,
    });

    const globe = new THREE.Group();
    globe.rotation.z = 0.22;
    scene.add(globe);

    const planet = new THREE.Mesh(planetGeo(), planetMat);
    globe.add(planet);

    const cloudMat = new THREE.MeshLambertMaterial({
      map: cloudMap,
      transparent: true,
      depthWrite: false,
      opacity: cls === "barren" || cls === "magma" ? 0.28 : 0.72,
    });
    const clouds = new THREE.Mesh(cloudGeo(), cloudMat);
    globe.add(clouds);

    const atmoHex = atmosphereColor(cls);
    const limb = new THREE.Mesh(
      limbGeo(),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          glowColor: {
            value: new THREE.Color(accentColor ?? atmoHex),
          },
        },
        vertexShader: `
          varying vec3 vNormal;
          varying vec3 vView;
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vNormal = normalize(normalMatrix * normal);
            vView = normalize(-mv.xyz);
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: `
          uniform vec3 glowColor;
          varying vec3 vNormal;
          varying vec3 vView;
          void main() {
            float fresnel = pow(1.0 - max(dot(vView, vNormal), 0.0), 3.2);
            float edge = smoothstep(0.15, 0.95, fresnel);
            gl_FragColor = vec4(glowColor, edge * 0.28);
          }
        `,
      }),
    );
    globe.add(limb);

    const key = new THREE.DirectionalLight(0xfff2e0, 1.15);
    key.position.set(-2.8, 1.4, 3.2);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x7a8cff, 0.28);
    fill.position.set(2.5, -1.0, -1.2);
    scene.add(fill);
    const rimLight = new THREE.DirectionalLight(0xb0c4ff, 0.22);
    rimLight.position.set(0.2, 0.4, -3.0);
    scene.add(rimLight);
    scene.add(new THREE.AmbientLight(0x5a6270, 0.55));
    scene.add(new THREE.HemisphereLight(0xdde6ff, 0x1a1520, 0.35));

    let frame = 0;
    let raf = 0;
    const spin = cls === "gas_giant" ? 0.0016 : 0.00095;
    const cloudSpin = spin * 1.25;

    const tick = () => {
      frame += 1;
      planet.rotation.y += spin;
      clouds.rotation.y += cloudSpin;
      cloudMat.opacity =
        (cls === "barren" || cls === "magma" ? 0.22 : 0.62) +
        Math.sin(frame * 0.012) * 0.08;
      if (cls === "magma" || cls === "volcanic") {
        planetMat.emissiveIntensity =
          (cls === "magma" ? 0.32 : 0.16) + Math.sin(frame * 0.035) * 0.07;
      }
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const upgrade = () => {
      if (cancelled) return;
      const fullAlbedo = getPlanetAlbedoCanvas(cls, modelId, PLANET_TEX_FULL);
      const fullClouds = getPlanetCloudCanvas(cls, modelId, PLANET_TEX_CLOUDS);
      if (cancelled) return;

      const nextAlbedo = makeMap(fullAlbedo, renderer);
      const nextClouds = makeMap(fullClouds, renderer);
      planetMat.map = nextAlbedo;
      planetMat.needsUpdate = true;
      cloudMat.map = nextClouds;
      cloudMat.needsUpdate = true;
      albedoMap.dispose();
      cloudMap.dispose();
      albedoMap = nextAlbedo;
      cloudMap = nextClouds;
    };

    // Prefer idle time; fall back so upgrade still happens quickly.
    let idleId: number | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (typeof requestIdleCallback === "function") {
      idleId = requestIdleCallback(upgrade, { timeout: 250 });
    } else {
      timeoutId = setTimeout(upgrade, 32);
    }
    // Also warm remaining cache entries for revisits.
    prefetchPlanetTextures(cls, modelId);

    const onResize = () => {
      if (!mount) return;
      const w = mount.clientWidth || width;
      const h = mount.clientHeight || height;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      if (idleId != null && typeof cancelIdleCallback === "function") {
        cancelIdleCallback(idleId);
      }
      if (timeoutId != null) clearTimeout(timeoutId);
      ro.disconnect();
      renderer.domElement.removeEventListener("click", handleClick);
      if (renderer.domElement.parentElement === mount) {
        mount.removeChild(renderer.domElement);
      }
      albedoMap.dispose();
      cloudMap.dispose();
      // Shared geometries — do not dispose.
      planetMat.dispose();
      cloudMat.dispose();
      (limb.material as THREE.Material).dispose();
      renderer.dispose();
    };
  }, [cls, modelId, accentColor, planetId]);

  return (
    <div
      ref={mountRef}
      className={className}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      aria-label="Planet globe"
    />
  );
}
