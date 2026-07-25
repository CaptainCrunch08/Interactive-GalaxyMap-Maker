import { useMemo } from "react";
import { PLANET_TYPE_LABELS } from "../types/campaign";
import {
  normalizeStarClass,
  starAppearance,
  starBodyGradient,
} from "../lib/stars";
import {
  PulsarJets,
  pulsarJetAngle,
} from "../components/galaxy/PulsarJets";
import { fleetsInOrbit, shipCount } from "../lib/fleets";
import { useCampaignStore } from "../store/useCampaignStore";

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

type NearRock = {
  left: number;
  top: number;
  w: number;
  h: number;
  rot: number;
  color: string;
  blur: number;
  opacity: number;
  z: number;
};

const ROCK_COLORS = ["#5c554e", "#7a746c", "#4a4642", "#9a9088", "#6b6560"];

function buildNearRocks(planetId: string): NearRock[] {
  const rng = mulberry32(hash(planetId + ":pov"));
  const rocks: NearRock[] = [];
  for (let i = 0; i < 28; i++) {
    const near = rng() > 0.35;
    rocks.push({
      left: rng() * 110 - 5,
      top: near ? 45 + rng() * 60 : 18 + rng() * 50,
      w: near ? 40 + rng() * 120 : 12 + rng() * 40,
      h: near ? 28 + rng() * 80 : 8 + rng() * 28,
      rot: rng() * 360,
      color: ROCK_COLORS[Math.floor(rng() * ROCK_COLORS.length)]!,
      blur: near ? 0 : 1 + rng() * 2,
      opacity: near ? 0.92 : 0.35 + rng() * 0.35,
      z: near ? 20 + Math.floor(rng() * 10) : 5 + Math.floor(rng() * 8),
    });
  }
  return rocks.sort((a, b) => a.z - b.z);
}

/** POV from inside an asteroid belt looking toward the system star. */
export function AsteroidBeltView() {
  const campaign = useCampaignStore((s) => s.campaign);
  const focusedPlanetId = useCampaignStore((s) => s.focusedPlanetId);
  const updatePlanet = useCampaignStore((s) => s.updatePlanet);
  const selectFleet = useCampaignStore((s) => s.selectFleet);
  const selectedFleetId = useCampaignStore((s) => s.selectedFleetId);

  const planet = campaign.planets.find((p) => p.id === focusedPlanetId);
  const system = planet
    ? campaign.systems.find((s) => s.id === planet.systemId)
    : undefined;
  const faction = planet?.controllingFactionId
    ? campaign.factions.find((f) => f.id === planet.controllingFactionId)
    : undefined;

  const rocks = useMemo(
    () => (planet ? buildNearRocks(planet.id) : []),
    [planet?.id],
  );

  const beltFleets = useMemo(() => {
    if (!planet || !system) return [];
    return fleetsInOrbit(campaign.fleets ?? [], system.id, planet.id);
  }, [campaign.fleets, planet, system]);

  if (!planet || planet.type !== "asteroid_belt" || !system) {
    return (
      <div className="h-full flex items-center justify-center text-muted">
        Asteroid belt not found.
      </div>
    );
  }

  const starClass = normalizeStarClass(system.starClass);
  const star = starAppearance(starClass);
  const accent = faction?.color ?? "#9a9088";

  return (
    <div className="relative h-full w-full overflow-hidden galaxy-bg">
      <div className="galaxy-nebula pointer-events-none absolute inset-0 opacity-90" />

      {/* Deep space vignette + perspective floor of dust */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse 70% 50% at 50% 42%, ${star.corona}22 0%, transparent 55%),
            linear-gradient(180deg, transparent 40%, rgba(20,18,16,0.55) 72%, rgba(8,8,10,0.92) 100%)
          `,
        }}
      />

      {/* Distant star */}
      <div
        className="pointer-events-none absolute left-1/2 top-[38%] -translate-x-1/2 -translate-y-1/2"
        style={{ width: 72, height: 72 }}
      >
        {starClass === "pulsar" && (
          <PulsarJets
            length={160}
            baseWidth={18}
            color={star.color}
            highlight={star.highlight}
            angleDeg={pulsarJetAngle(system.id)}
          />
        )}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: starBodyGradient(starClass),
            boxShadow: `0 0 40px ${star.color}aa, 0 0 120px ${star.corona}66, 0 0 200px ${star.corona}33`,
          }}
        />
      </div>

      {/* Mid-field dust motes */}
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage: `
            radial-gradient(1px 1px at 20% 50%, #fff8, transparent),
            radial-gradient(1.5px 1.5px at 70% 55%, #fffc, transparent),
            radial-gradient(1px 1px at 40% 70%, #fff6, transparent),
            radial-gradient(1px 1px at 85% 40%, #fff5, transparent)
          `,
        }}
      />

      {/* Near asteroids (POV) */}
      {rocks.map((rock, i) => (
        <div
          key={i}
          className="pointer-events-none absolute rounded-[40%]"
          style={{
            left: `${rock.left}%`,
            top: `${rock.top}%`,
            width: rock.w,
            height: rock.h,
            background: `radial-gradient(circle at 30% 30%, ${rock.color}cc, ${rock.color} 55%, #1a1816)`,
            transform: `rotate(${rock.rot}deg)`,
            filter: rock.blur ? `blur(${rock.blur}px)` : undefined,
            opacity: rock.opacity,
            zIndex: rock.z,
            boxShadow: "inset -6px -4px 12px #0008",
          }}
        />
      ))}

      {/* Fleets parked in the belt */}
      {beltFleets.length > 0 && (
        <div className="absolute left-1/2 top-[48%] -translate-x-1/2 z-30 flex flex-wrap justify-center gap-2 max-w-md px-4">
          {beltFleets.map((fleet) => {
            const fac = campaign.factions.find((f) => f.id === fleet.factionId);
            const color = fac?.color ?? "#4fd2ff";
            return (
              <button
                key={fleet.id}
                type="button"
                className={`hud-btn text-[10px] py-1 px-2 flex items-center gap-1.5 ${
                  selectedFleetId === fleet.id ? "hud-btn-active" : ""
                }`}
                style={{ borderColor: `${color}88` }}
                onClick={() => selectFleet(fleet.id)}
                title={`${fleet.name} · ${shipCount(fleet)} ships`}
              >
                <span
                  className="inline-block w-2.5 h-2.5 rotate-45 shrink-0"
                  style={{ background: color }}
                />
                {fleet.name}
              </button>
            );
          })}
        </div>
      )}

      {/* Title + rename / notes */}
      <div className="absolute inset-x-0 bottom-0 z-40 p-4 sm:p-6 pointer-events-none">
        <div className="hud-panel max-w-lg mx-auto p-4 space-y-3 pointer-events-auto">
          <p className="text-[10px] font-display uppercase tracking-[0.2em] text-muted">
            {system.name} · {PLANET_TYPE_LABELS.asteroid_belt}
            {faction ? ` · ${faction.name}` : ""}
          </p>
          <label className="block text-[10px] uppercase tracking-wide text-muted">
            Name
          </label>
          <input
            className="hud-input font-display text-lg text-star"
            value={planet.name}
            onChange={(e) =>
              updatePlanet(planet.id, { name: e.target.value })
            }
            style={{ borderColor: `${accent}55` }}
          />
          <label className="block text-[10px] uppercase tracking-wide text-muted">
            Notes
          </label>
          <textarea
            className="hud-input min-h-[5rem] resize-y text-sm"
            placeholder="Belt notes, mining claims, hazards…"
            value={planet.notes}
            onChange={(e) =>
              updatePlanet(planet.id, { notes: e.target.value })
            }
          />
        </div>
      </div>
    </div>
  );
}
