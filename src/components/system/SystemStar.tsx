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
}: {
  color: string;
  highlight: string;
  selected: boolean;
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

  return (
    <>
      {/* Soft outer disc wash */}
      <span
        className="absolute rounded-full pointer-events-none system-bh-glow"
        style={{
          left: "-55%",
          top: "-55%",
          width: "210%",
          height: "210%",
          background: `radial-gradient(circle, ${color}00 38%, ${color}55 52%, ${highlight}33 62%, transparent 74%)`,
        }}
      />

      {/* Outer ring — violent spin */}
      <span
        className="absolute rounded-full pointer-events-none system-bh-disc system-bh-disc--outer"
        style={{
          left: "-38%",
          top: "-38%",
          width: "176%",
          height: "176%",
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
          left: "-26%",
          top: "-26%",
          width: "152%",
          height: "152%",
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
          left: "-45%",
          top: "-45%",
          width: "190%",
          height: "190%",
          overflow: "visible",
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
          left: "-40%",
          top: "-40%",
          width: "180%",
          height: "180%",
          overflow: "visible",
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
          left: "-42%",
          top: "-42%",
          width: "184%",
          height: "184%",
          overflow: "visible",
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

  return (
    <div
      className={`relative pointer-events-none system-star ${tempo}`}
      style={{
        width: size,
        height: size,
        ...cssVars,
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
          length={size * 2.8}
          baseWidth={Math.max(10, size * 0.55)}
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
  );
}
