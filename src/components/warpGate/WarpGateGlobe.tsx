import { useEffect, useRef } from "react";
import * as THREE from "three";
import { createWarpGateMesh } from "../../lib/warpGateMesh";

type WarpGateGlobeProps = {
  accentColor?: string;
  className?: string;
  /** Compact framing for smaller mounts. */
  compact?: boolean;
  /** Freeze pose (no spin / pulse). Used when a still shot is preferred. */
  static?: boolean;
  onClick?: () => void;
};

/**
 * 3D warp-gate station — crescent hull, spiked hub, cyan portal.
 * Planet-view hero; system map uses a static SVG instead.
 */
export function WarpGateGlobe({
  accentColor = "#4fd2ff",
  className = "",
  compact = false,
  static: isStatic = false,
  onClick,
}: WarpGateGlobeProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const onClickRef = useRef(onClick);
  onClickRef.current = onClick;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = Math.max(64, mount.clientWidth || (compact ? 64 : 420));
    const height = Math.max(64, mount.clientHeight || (compact ? 64 : 420));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      compact ? 36 : 32,
      width / height,
      0.1,
      100,
    );
    camera.position.set(0, 0.35, compact ? 5.2 : 4.6);

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
    renderer.domElement.style.cursor = onClickRef.current ? "pointer" : "default";

    const handleClick = () => onClickRef.current?.();
    renderer.domElement.addEventListener("click", handleClick);

    const keyLight = new THREE.DirectionalLight(0xf0f4ff, 1.35);
    keyLight.position.set(3.5, 4, 5);
    scene.add(keyLight);
    const fill = new THREE.DirectionalLight(0x4fd2ff, 0.55);
    fill.position.set(-4, 1, -2);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xe8c547, 0.35);
    rim.position.set(0, -3, -4);
    scene.add(rim);
    scene.add(new THREE.AmbientLight(0x6a8098, 0.45));

    const portalLight = new THREE.PointLight(accentColor, 2.4, 12, 2);
    portalLight.position.set(0, 0.2, 0.6);
    scene.add(portalLight);

    const bundle = createWarpGateMesh(accentColor);
    bundle.root.rotation.y = -0.35;
    bundle.root.rotation.x = 0.12;
    scene.add(bundle.root);

    let raf = 0;
    if (isStatic) {
      renderer.render(scene, camera);
    } else {
      const t0 = performance.now();
      const tick = (now: number) => {
        const t = (now - t0) / 1000;
        bundle.root.rotation.y = -0.35 + t * 0.12;
        bundle.glow.scale.setScalar(1 + Math.sin(t * 2.4) * 0.08);
        const portalMat = bundle.portal.material as THREE.MeshBasicMaterial;
        portalMat.opacity = 0.82 + Math.sin(t * 3.1) * 0.12;
        portalLight.intensity = 2.1 + Math.sin(t * 2.8) * 0.5;
        for (let i = 0; i < bundle.rays.children.length; i++) {
          const ray = bundle.rays.children[i] as THREE.Mesh;
          const mat = ray.material as THREE.MeshBasicMaterial;
          mat.opacity = 0.25 + ((Math.sin(t * 2.2 + i * 0.4) + 1) / 2) * 0.4;
        }
        renderer.render(scene, camera);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }

    const onResize = () => {
      if (!mount) return;
      const w = Math.max(32, mount.clientWidth);
      const h = Math.max(32, mount.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      if (isStatic) renderer.render(scene, camera);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener("click", handleClick);
      bundle.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [accentColor, compact, isStatic]);

  return (
    <div
      ref={mountRef}
      className={className}
      style={{ width: "100%", height: "100%" }}
    />
  );
}
