import { useId, type CSSProperties, type MouseEvent } from "react";
import type { StarClass } from "../../types/campaign";
import { STAR_CLASS_LABELS } from "../../types/campaign";
import {
  normalizeStarClass,
  starAppearance,
} from "../../lib/stars";
import { PulsarJets, pulsarJetAngle } from "../galaxy/PulsarJets";

type SystemStarProps = {
  starClass: StarClass | undefined;
  size: number;
  seed?: string;
  selected?: boolean;
  title?: string;
  /** Power megastructure: Dyson Sphere, or Black Hole Bomb around a BH core. */
  dysonSphere?: boolean;
  onClick?: (e: MouseEvent) => void;
};

/** Archimedean spiral path (viewBox 0–100), radius shrinks toward center. */
function spiralPath(
  turns: number,
  rOuter: number,
  rInner: number,
  phase = 0,
): string {
  const steps = Math.max(48, Math.round(turns * 72));
  const parts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const angle = phase + t * turns * Math.PI * 2;
    const r = rOuter + (rInner - rOuter) * t;
    const x = 50 + Math.cos(angle) * r;
    const y = 50 + Math.sin(angle) * r;
    parts.push(`${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`);
  }
  return parts.join(" ");
}

function BlackHoleDisc({
  color,
  highlight,
  selected,
  /** Tighten glow so a surrounding megastructure stays readable. */
  contained = false,
}: {
  color: string;
  highlight: string;
  selected: boolean;
  contained?: boolean;
}) {
  const gradId = useId().replace(/:/g, "");
  const arms = [
    spiralPath(2.4, 46, 18, 0),
    spiralPath(2.4, 44, 17, Math.PI * 0.7),
    spiralPath(2.6, 47, 16, Math.PI * 1.35),
  ];
  const strings = [
    spiralPath(3.2, 48, 14, 0.2),
    spiralPath(3.4, 46, 13, 1.1),
    spiralPath(3.1, 47, 12.5, 2.0),
    spiralPath(3.5, 45, 12, 2.8),
    spiralPath(3.3, 48, 13.5, 3.6),
    spiralPath(3.6, 44, 11.5, 4.5),
  ];

  const glowExtent = contained ? "-28%" : "-55%";
  const glowSize = contained ? "156%" : "210%";
  const outerLeft = contained ? "-22%" : "-38%";
  const outerSize = contained ? "144%" : "176%";
  const midLeft = contained ? "-14%" : "-26%";
  const midSize = contained ? "128%" : "152%";
  const spaghettiLeft = contained ? "-24%" : "-45%";
  const spaghettiSize = contained ? "148%" : "190%";

  return (
    <>
      {/* Soft outer disc wash */}
      <span
        className="absolute rounded-full pointer-events-none system-bh-glow"
        style={{
          left: glowExtent,
          top: glowExtent,
          width: glowSize,
          height: glowSize,
          background: contained
            ? `radial-gradient(circle, ${color}00 42%, ${color}44 58%, transparent 72%)`
            : `radial-gradient(circle, ${color}00 38%, ${color}55 52%, ${highlight}33 62%, transparent 74%)`,
          opacity: contained ? 0.7 : 1,
        }}
      />

      {/* Outer ring — violent spin */}
      <span
        className="absolute rounded-full pointer-events-none system-bh-disc system-bh-disc--outer"
        style={{
          left: outerLeft,
          top: outerLeft,
          width: outerSize,
          height: outerSize,
          background: `conic-gradient(from 20deg, transparent 0%, ${color}99 8%, ${highlight} 14%, ${color}66 24%, transparent 36%, ${color}88 48%, ${highlight}cc 56%, transparent 70%, ${color}77 82%, transparent 100%)`,
          maskImage:
            "radial-gradient(circle, transparent 40%, #000 46%, #000 68%, transparent 76%)",
          WebkitMaskImage:
            "radial-gradient(circle, transparent 40%, #000 46%, #000 68%, transparent 76%)",
        }}
      />

      {/* Mid ring — counter-spin */}
      <span
        className="absolute rounded-full pointer-events-none system-bh-disc system-bh-disc--mid"
        style={{
          left: midLeft,
          top: midLeft,
          width: midSize,
          height: midSize,
          background: `conic-gradient(from 200deg, ${highlight}00 0%, ${highlight}bb 6%, ${color} 12%, transparent 22%, ${highlight}99 40%, ${color}aa 48%, transparent 60%, ${highlight}88 78%, transparent 100%)`,
          maskImage:
            "radial-gradient(circle, transparent 36%, #000 42%, #000 58%, transparent 66%)",
          WebkitMaskImage:
            "radial-gradient(circle, transparent 36%, #000 42%, #000 58%, transparent 66%)",
        }}
      />

      {/* Spaghetti string layers (spaghettified material) */}
      <svg
        className="absolute pointer-events-none system-bh-spaghetti system-bh-spaghetti--a"
        viewBox="0 0 100 100"
        style={{
          left: spaghettiLeft,
          top: spaghettiLeft,
          width: spaghettiSize,
          height: spaghettiSize,
          overflow: "visible",
          opacity: contained ? 0.55 : 1,
        }}
        aria-hidden
      >
        {strings.map((d, i) => (
          <path
            key={`s-a-${i}`}
            d={d}
            fill="none"
            stroke={i % 2 === 0 ? highlight : color}
            strokeWidth={i % 3 === 0 ? 0.55 : 0.35}
            strokeLinecap="round"
            opacity={0.35 + (i % 4) * 0.12}
          />
        ))}
      </svg>
      <svg
        className="absolute pointer-events-none system-bh-spaghetti system-bh-spaghetti--b"
        viewBox="0 0 100 100"
        style={{
          left: contained ? "-20%" : "-40%",
          top: contained ? "-20%" : "-40%",
          width: contained ? "140%" : "180%",
          height: contained ? "140%" : "180%",
          overflow: "visible",
          opacity: contained ? 0.45 : 1,
        }}
        aria-hidden
      >
        {strings
          .slice()
          .reverse()
          .map((d, i) => (
            <path
              key={`s-b-${i}`}
              d={d}
              fill="none"
              stroke={i % 2 === 0 ? color : highlight}
              strokeWidth={0.25}
              strokeLinecap="round"
              strokeDasharray={i % 2 === 0 ? "1.2 2.4" : "0.6 1.8"}
              opacity={0.45}
            />
          ))}
      </svg>

      {/* Clear spiral arms toward horizon */}
      <svg
        className="absolute pointer-events-none system-bh-spiral"
        viewBox="0 0 100 100"
        style={{
          left: contained ? "-22%" : "-42%",
          top: contained ? "-22%" : "-42%",
          width: contained ? "144%" : "184%",
          height: contained ? "144%" : "184%",
          overflow: "visible",
          opacity: contained ? 0.65 : 1,
        }}
        aria-hidden
      >
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={highlight} stopOpacity="0.15" />
            <stop offset="45%" stopColor={highlight} stopOpacity="0.95" />
            <stop offset="100%" stopColor={color} stopOpacity="0.35" />
          </linearGradient>
        </defs>
        {arms.map((d, i) => (
          <path
            key={`arm-${i}`}
            d={d}
            fill="none"
            stroke={`url(#${gradId})`}
            strokeWidth={1.8 - i * 0.25}
            strokeLinecap="round"
            opacity={0.85 - i * 0.12}
          />
        ))}
      </svg>

      {/* Inner shear ring */}
      <span
        className="absolute rounded-full pointer-events-none system-bh-disc system-bh-disc--inner"
        style={{
          left: "-12%",
          top: "-12%",
          width: "124%",
          height: "124%",
          background: `conic-gradient(from 90deg, transparent 0%, ${highlight}ee 5%, ${color} 10%, transparent 18%, ${highlight}cc 35%, transparent 48%, ${color}dd 62%, ${highlight} 68%, transparent 78%)`,
          maskImage:
            "radial-gradient(circle, transparent 44%, #000 50%, #000 58%, transparent 64%)",
          WebkitMaskImage:
            "radial-gradient(circle, transparent 44%, #000 50%, #000 58%, transparent 64%)",
        }}
      />

      {/* Event horizon */}
      <span
        className="absolute inset-0 rounded-full pointer-events-none system-bh-horizon"
        style={{
          background: `radial-gradient(circle at 50% 50%, #050508 0%, #0a0a12 46%, ${color}99 54%, #000 68%)`,
          boxShadow: selected
            ? `0 0 28px ${color}cc, 0 0 8px ${highlight}, inset 0 0 22px #000`
            : `0 0 20px ${color}99, 0 0 4px ${highlight}88, inset 0 0 18px #000`,
        }}
      />
    </>
  );
}

/**
 * Animated system-view star (corona pulse, surface shimmer).
 * Galaxy map keeps the simpler static StarNode look.
 */
export function SystemStar({
  starClass,
  size,
  seed = "star",
  selected = false,
  title,
  dysonSphere = false,
  onClick,
}: SystemStarProps) {
  const cls = normalizeStarClass(starClass);
  const look = starAppearance(cls);
  const isBlackHole = cls === "black_hole";
  const isPulsar = cls === "pulsar";
  const isNeutron = cls === "neutron";
  const tempo = isPulsar
    ? "system-star--pulsar"
    : isNeutron
      ? "system-star--neutron"
      : isBlackHole
        ? "system-star--black-hole"
        : "system-star--normal";

  const cssVars = {
    "--star-core": look.highlight,
    "--star-mid": look.color,
    "--star-rim": look.corona,
    "--star-glow": look.color,
  } as CSSProperties;

  const isBomb = dysonSphere && isBlackHole;
  const coreSize = isBomb ? size * 0.62 : size;
  const shellSize = isBomb
    ? size * 2.75
    : dysonSphere
      ? size * 1.85
      : size;

  return (
    <div
      className={`relative pointer-events-none system-star ${tempo}`}
      style={{
        width: shellSize,
        height: shellSize,
        ...cssVars,
      }}
    >
      {dysonSphere && !isBlackHole && (
        <DysonSphereShell
          size={shellSize}
          coreColor={look.color}
          accent={look.highlight}
          selected={selected}
        />
      )}

      <div
        className="absolute pointer-events-none"
        style={{
          left: "50%",
          top: "50%",
          width: coreSize,
          height: coreSize,
          transform: "translate(-50%, -50%)",
        }}
      >
      {!isBlackHole && (
        <span
          className={`absolute rounded-full pointer-events-none system-star-halo ${
            isNeutron || isPulsar
              ? "system-star-halo--cool"
              : "system-star-halo--warm"
          }`}
          style={{
            left: "-70%",
            top: "-70%",
            width: "240%",
            height: "240%",
            background: `radial-gradient(circle, ${look.color}88 0%, ${look.corona}44 28%, transparent 68%)`,
          }}
        />
      )}

      {!isBlackHole && (
        <span
          className="absolute rounded-full pointer-events-none system-star-corona"
          style={{
            left: "-40%",
            top: "-40%",
            width: "180%",
            height: "180%",
            background: `radial-gradient(circle, ${look.highlight}66 0%, ${look.color}40 38%, transparent 70%)`,
          }}
        />
      )}

      {isPulsar && (
        <PulsarJets
          length={coreSize * 2.8}
          baseWidth={Math.max(10, coreSize * 0.55)}
          color={look.color}
          highlight={look.highlight}
          angleDeg={pulsarJetAngle(seed)}
          animated
        />
      )}

      {isBlackHole && (
        <BlackHoleDisc
          color={look.corona}
          highlight="#ffedd5"
          selected={selected}
          contained={isBomb}
        />
      )}

      {!isBlackHole && (
        <button
          type="button"
          className={`absolute inset-0 rounded-full border-0 p-0 cursor-pointer overflow-hidden pointer-events-auto system-star-body ${
            selected ? "system-star-body--selected" : ""
          }`}
          style={{
            background: `radial-gradient(circle at 38% 32%, ${look.highlight} 0%, ${look.color} 45%, ${look.corona} 82%, #1a1008 100%)`,
            boxShadow: selected
              ? `0 0 40px #4fd2ff, 0 0 90px ${look.corona}88, inset 0 0 20px ${look.highlight}66`
              : `0 0 28px ${look.color}, 0 0 70px ${look.corona}99, inset 0 -8px 20px ${look.corona}88, inset 4px 6px 16px ${look.highlight}55`,
            outline: selected ? "2px solid #4fd2ff" : undefined,
          }}
          title={title ?? STAR_CLASS_LABELS[cls]}
          onClick={onClick}
        >
          <span
            className="absolute inset-0 rounded-full pointer-events-none system-star-granules"
            style={{
              background: `
                radial-gradient(circle at 28% 38%, ${look.highlight}cc 0%, transparent 30%),
                radial-gradient(circle at 72% 58%, ${look.corona}aa 0%, transparent 34%),
                radial-gradient(circle at 48% 74%, ${look.highlight}99 0%, transparent 28%),
                radial-gradient(circle at 58% 22%, #fff8 0%, transparent 22%)
              `,
              mixBlendMode: "screen",
            }}
          />
          <span
            className="absolute inset-0 rounded-full pointer-events-none system-star-flare"
            style={{
              background: `conic-gradient(from 200deg, transparent 0%, ${look.highlight}aa 10%, transparent 22%, transparent 50%, ${look.corona}88 60%, transparent 75%)`,
              mixBlendMode: "soft-light",
            }}
          />
          <span
            className="absolute rounded-full pointer-events-none system-star-core"
            style={{
              width: "48%",
              height: "48%",
              left: "18%",
              top: "14%",
              background: `radial-gradient(circle, #fff 0%, ${look.highlight} 35%, transparent 70%)`,
            }}
          />
        </button>
      )}

      {isBlackHole && (
        <button
          type="button"
          className="absolute inset-0 rounded-full border-0 p-0 cursor-pointer bg-transparent pointer-events-auto"
          title={title ?? STAR_CLASS_LABELS[cls]}
          onClick={onClick}
          aria-label={title ?? STAR_CLASS_LABELS[cls]}
        />
      )}
      </div>

      {/* Bomb cage drawn on top so mirrors aren't drowned by the disc glow */}
      {isBomb && (
        <BlackHoleBombShell size={shellSize} selected={selected} />
      )}
    </div>
  );
}

/** Lattice / ring megastructure that wraps luminous stars (solar collectors). */
function DysonSphereShell({
  size,
  coreColor,
  accent,
  selected,
}: {
  size: number;
  coreColor: string;
  accent: string;
  selected: boolean;
}) {
  const uid = useId().replace(/:/g, "");
  return (
    <svg
      className="absolute inset-0 pointer-events-none dyson-sphere-shell"
      viewBox="0 0 100 100"
      width={size}
      height={size}
      aria-hidden
    >
      <defs>
        <radialGradient id={`dyson-glow-${uid}`} cx="50%" cy="50%" r="50%">
          <stop offset="55%" stopColor={`${coreColor}00`} />
          <stop offset="78%" stopColor={`${accent}55`} />
          <stop offset="100%" stopColor={`${coreColor}22`} />
        </radialGradient>
      </defs>
      <circle
        cx="50"
        cy="50"
        r="48"
        fill={`url(#dyson-glow-${uid})`}
        className="dyson-sphere-pulse"
      />
      {/* Outer structural ring */}
      <circle
        cx="50"
        cy="50"
        r="44"
        fill="none"
        stroke={selected ? "#4fd2ff" : accent}
        strokeWidth="1.4"
        strokeOpacity="0.85"
        strokeDasharray="6 4 2 4"
        className="dyson-sphere-spin-slow"
      />
      <circle
        cx="50"
        cy="50"
        r="38"
        fill="none"
        stroke={coreColor}
        strokeWidth="0.9"
        strokeOpacity="0.7"
        strokeDasharray="3 5"
        className="dyson-sphere-spin"
      />
      {/* Lattice struts */}
      {[0, 30, 60, 90, 120, 150].map((deg) => (
        <line
          key={deg}
          x1="50"
          y1="50"
          x2={50 + Math.cos((deg * Math.PI) / 180) * 44}
          y2={50 + Math.sin((deg * Math.PI) / 180) * 44}
          stroke={accent}
          strokeWidth="0.55"
          strokeOpacity="0.45"
        />
      ))}
      {/* Hab panels */}
      {[15, 75, 135, 195, 255, 315].map((deg) => {
        const rad = (deg * Math.PI) / 180;
        const x = 50 + Math.cos(rad) * 41;
        const y = 50 + Math.sin(rad) * 41;
        return (
          <rect
            key={deg}
            x={x - 2.2}
            y={y - 1.1}
            width="4.4"
            height="2.2"
            rx="0.4"
            fill={accent}
            fillOpacity="0.55"
            transform={`rotate(${deg} ${x} ${y})`}
          />
        );
      })}
    </svg>
  );
}

/**
 * Press–Teukolsky black hole bomb: chunky nested mirror facets that trap
 * bosonic waves for superradiant amplification (not solar collectors).
 */
function BlackHoleBombShell({
  size,
  selected,
}: {
  size: number;
  selected: boolean;
}) {
  const uid = useId().replace(/:/g, "");
  const rim = selected ? "#e9d5ff" : "#ddd6fe";
  const plate = selected ? "#c4b5fd" : "#a78bfa";
  const energy = "#22d3ee";
  const hot = "#f0abfc";

  /** Annular mirror facet path between r0–r1 spanning start→end degrees. */
  function facet(
    r0: number,
    r1: number,
    startDeg: number,
    endDeg: number,
  ): string {
    const toRad = (d: number) => (d * Math.PI) / 180;
    const p = (r: number, d: number) => {
      const a = toRad(d);
      return [50 + Math.cos(a) * r, 50 + Math.sin(a) * r] as const;
    };
    const [x0, y0] = p(r1, startDeg);
    const [x1, y1] = p(r1, endDeg);
    const [x2, y2] = p(r0, endDeg);
    const [x3, y3] = p(r0, startDeg);
    const large = endDeg - startDeg > 180 ? 1 : 0;
    return [
      `M ${x0} ${y0}`,
      `A ${r1} ${r1} 0 ${large} 1 ${x1} ${y1}`,
      `L ${x2} ${y2}`,
      `A ${r0} ${r0} 0 ${large} 0 ${x3} ${y3}`,
      "Z",
    ].join(" ");
  }

  const outerFacets = Array.from({ length: 10 }, (_, i) => {
    const span = 28;
    const gap = 8;
    const start = i * (span + gap) - 90;
    return facet(40, 47.5, start, start + span);
  });

  const midFacets = Array.from({ length: 8 }, (_, i) => {
    const span = 32;
    const gap = 13;
    const start = i * (span + gap) - 70;
    return facet(30, 36.5, start, start + span);
  });

  return (
    <svg
      className="absolute inset-0 pointer-events-none black-hole-bomb-shell z-[2]"
      viewBox="0 0 100 100"
      width={size}
      height={size}
      aria-hidden
    >
      <defs>
        <radialGradient id={`bhb-cavity-${uid}`} cx="50%" cy="50%" r="50%">
          <stop offset="28%" stopColor="#22d3ee00" />
          <stop offset="52%" stopColor="#22d3ee33" />
          <stop offset="72%" stopColor="#a78bfa55" />
          <stop offset="100%" stopColor="#f0abfc44" />
        </radialGradient>
        <linearGradient id={`bhb-plate-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f5f3ff" stopOpacity="0.95" />
          <stop offset="40%" stopColor={plate} stopOpacity="0.92" />
          <stop offset="100%" stopColor="#4c1d95" stopOpacity="0.88" />
        </linearGradient>
        <filter id={`bhb-glow-${uid}`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Cavity volume between mirrors */}
      <circle
        cx="50"
        cy="50"
        r="48"
        fill={`url(#bhb-cavity-${uid})`}
        className="bhb-cavity-pulse"
      />

      {/* Outer structural rail */}
      <circle
        cx="50"
        cy="50"
        r="48.5"
        fill="none"
        stroke={rim}
        strokeWidth="1.8"
        strokeOpacity="0.95"
      />
      <circle
        cx="50"
        cy="50"
        r="39"
        fill="none"
        stroke={energy}
        strokeWidth="1.2"
        strokeOpacity="0.75"
        strokeDasharray="3 5"
        className="bhb-wave-spin"
      />

      {/* Outer mirror facets — thick metallic plates */}
      <g className="bhb-mirror-spin-slow" filter={`url(#bhb-glow-${uid})`}>
        {outerFacets.map((d, i) => (
          <path
            key={`o-${i}`}
            d={d}
            fill={`url(#bhb-plate-${uid})`}
            stroke={rim}
            strokeWidth="0.7"
            strokeOpacity="0.95"
          />
        ))}
      </g>

      {/* Mid counter-rotating mirror ring */}
      <g className="bhb-mirror-spin-rev">
        {midFacets.map((d, i) => (
          <path
            key={`m-${i}`}
            d={d}
            fill={plate}
            fillOpacity="0.8"
            stroke={energy}
            strokeWidth="0.55"
            strokeOpacity="0.9"
          />
        ))}
      </g>

      {/* Inner mirror hoop near ergosphere */}
      <circle
        cx="50"
        cy="50"
        r="26"
        fill="none"
        stroke={hot}
        strokeWidth="2.4"
        strokeOpacity="0.85"
        className="bhb-mirror-spin"
      />
      <circle
        cx="50"
        cy="50"
        r="23.5"
        fill="none"
        stroke={rim}
        strokeWidth="1"
        strokeOpacity="0.7"
        strokeDasharray="6 3"
        className="bhb-mirror-spin-rev"
      />

      {/* Radial extractor spars + collector nodes */}
      {Array.from({ length: 8 }, (_, i) => {
        const deg = i * 45;
        const rad = (deg * Math.PI) / 180;
        const x1 = 50 + Math.cos(rad) * 26;
        const y1 = 50 + Math.sin(rad) * 26;
        const x2 = 50 + Math.cos(rad) * 47;
        const y2 = 50 + Math.sin(rad) * 47;
        return (
          <g key={`x-${i}`}>
            <line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={hot}
              strokeWidth="1.4"
              strokeOpacity="0.8"
            />
            <circle
              cx={x2}
              cy={y2}
              r="2.6"
              fill={energy}
              stroke={rim}
              strokeWidth="0.7"
              className="bhb-extractor-pulse"
            />
          </g>
        );
      })}
    </svg>
  );
}
