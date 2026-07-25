import { useMemo } from "react";
import type { Faction, Planet } from "../../types/campaign";
import { PLANET_TYPE_LABELS } from "../../types/campaign";
import { orbitAngleForIndex } from "../../lib/systemLayout";

interface AsteroidBeltRingProps {
  planet: Planet;
  /** Orbit radius in system world units. */
  radius: number;
  center: number;
  faction?: Faction;
  selected: boolean;
  mapScale: number;
  onNavigate: () => void;
}

type Rock = {
  angle: number;
  r: number;
  w: number;
  h: number;
  rot: number;
  color: string;
};

function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ROCK_COLORS = ["#6b6560", "#8a8278", "#4a4642", "#9a9088", "#5c554e"];

function buildRocks(planetId: string, orbitIndex: number, radius: number): Rock[] {
  const rng = mulberry32(hash(planetId + ":belt"));
  const count = 56 + Math.floor(rng() * 24);
  const rocks: Rock[] = [];
  const phase = orbitAngleForIndex(orbitIndex) * 0.2;

  for (let i = 0; i < count; i++) {
    const t = i / count;
    const clump = Math.sin(t * Math.PI * 9 + phase) * 0.12;
    const angle = t * Math.PI * 2 + phase + clump + (rng() - 0.5) * 0.08;
    if (rng() < 0.08) continue;
    const band = (rng() - 0.5) * radius * 0.1;
    rocks.push({
      angle,
      r: radius + band,
      w: 2 + rng() * 6,
      h: 1.5 + rng() * 4.5,
      rot: rng() * 360,
      color: ROCK_COLORS[Math.floor(rng() * ROCK_COLORS.length)]!,
    });
  }
  return rocks;
}

/** Asteroid ring in system view — click to enter belt POV or move a fleet here. */
export function AsteroidBeltRing({
  planet,
  radius,
  center,
  faction,
  selected,
  mapScale,
  onNavigate,
}: AsteroidBeltRingProps) {
  const orbitIndex =
    typeof planet.orbitIndex === "number" ? planet.orbitIndex : 0;
  const rocks = useMemo(
    () => buildRocks(planet.id, orbitIndex, radius),
    [planet.id, orbitIndex, radius],
  );

  const labelAngle = orbitAngleForIndex(orbitIndex);
  const labelX = center + Math.cos(labelAngle) * (radius + 18);
  const labelY = center + Math.sin(labelAngle) * (radius + 18);
  const showLabel = mapScale >= 0.5 || selected;
  const accent = faction?.color ?? "#9a9088";
  const size = radius * 2 + 28;
  const hitWidth = Math.max(16, radius * 0.1);

  return (
    <div className="absolute pointer-events-none" style={{ left: 0, top: 0 }}>
      <svg
        className="absolute overflow-visible"
        width={size}
        height={size}
        style={{
          left: center,
          top: center,
          transform: "translate(-50%, -50%)",
        }}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={selected ? `${accent}66` : "rgba(154,144,136,0.22)"}
          strokeWidth={selected ? 10 : 7}
          pointerEvents="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="transparent"
          strokeWidth={hitWidth}
          className="cursor-pointer"
          style={{ pointerEvents: "stroke" }}
          onClick={(e) => {
            e.stopPropagation();
            onNavigate();
          }}
        >
          <title>{`${planet.name} — ${PLANET_TYPE_LABELS.asteroid_belt}`}</title>
        </circle>
        {rocks.map((rock, i) => {
          const x = size / 2 + Math.cos(rock.angle) * rock.r;
          const y = size / 2 + Math.sin(rock.angle) * rock.r;
          return (
            <ellipse
              key={i}
              cx={x}
              cy={y}
              rx={rock.w / 2}
              ry={rock.h / 2}
              fill={rock.color}
              stroke="rgba(0,0,0,0.35)"
              strokeWidth={0.4}
              transform={`rotate(${rock.rot} ${x} ${y})`}
              opacity={0.88}
              pointerEvents="none"
            />
          );
        })}
      </svg>

      {showLabel && (
        <button
          type="button"
          className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center bg-transparent border-0 p-0 cursor-pointer pointer-events-auto z-[5]"
          style={{ left: labelX, top: labelY }}
          onClick={(e) => {
            e.stopPropagation();
            onNavigate();
          }}
        >
          <span className="text-[10px] leading-tight text-text whitespace-nowrap drop-shadow-[0_1px_2px_#000]">
            {planet.name}
          </span>
          <span className="text-[9px] leading-tight text-muted whitespace-nowrap">
            {PLANET_TYPE_LABELS.asteroid_belt}
          </span>
        </button>
      )}
    </div>
  );
}
