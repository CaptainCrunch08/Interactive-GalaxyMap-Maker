import { useEffect } from "react";
import {
  PLANET_CLASSIFICATION_LABELS,
  PLANET_TYPE_LABELS,
} from "../types/campaign";
import { useCampaignStore } from "../store/useCampaignStore";
import { AsteroidBeltView } from "./AsteroidBeltView";
import { WarpGateGlobe } from "../components/warpGate/WarpGateGlobe";
import { atmosphereColor } from "../lib/planetTexture";
import { resolvePlanetVisualModelId } from "../lib/planetModels";

export function PlanetView() {
  const campaign = useCampaignStore((s) => s.campaign);
  const focusedPlanetId = useCampaignStore((s) => s.focusedPlanetId);
  const selectedPlanetId = useCampaignStore((s) => s.selectedPlanetId);
  const focusedSystemId = useCampaignStore((s) => s.focusedSystemId);
  const enterStrategic = useCampaignStore((s) => s.enterStrategic);
  const enterSystem = useCampaignStore((s) => s.enterSystem);
  const setViewLevel = useCampaignStore((s) => s.setViewLevel);

  const planetId = focusedPlanetId ?? selectedPlanetId;
  const planet = planetId
    ? campaign.planets.find((p) => p.id === planetId)
    : undefined;
  const system = planet
    ? campaign.systems.find((s) => s.id === planet.systemId)
    : undefined;
  const faction = planet?.controllingFactionId
    ? campaign.factions.find((f) => f.id === planet.controllingFactionId)
    : undefined;

  // Recover if focus was lost (HMR, map switch, deleted planet, etc.)
  useEffect(() => {
    if (planet) return;
    const systemId =
      focusedSystemId ??
      campaign.planets.find((p) => p.id === planetId)?.systemId;
    if (systemId && campaign.systems.some((s) => s.id === systemId)) {
      enterSystem(systemId);
    } else {
      setViewLevel("galaxy");
    }
  }, [
    planet,
    planetId,
    focusedSystemId,
    campaign.planets,
    campaign.systems,
    enterSystem,
    setViewLevel,
  ]);

  if (!planet) {
    return (
      <div className="h-full flex items-center justify-center text-muted">
        Returning to map…
      </div>
    );
  }

  if (planet.type === "asteroid_belt") {
    return <AsteroidBeltView />;
  }

  if (planet.type === "warp_gate") {
    const owner = faction;
    const linkedId = planet.linkedGateId;
    const linked = linkedId
      ? campaign.planets.find((p) => p.id === linkedId)
      : undefined;
    const linkedSys = linked
      ? campaign.systems.find((s) => s.id === linked.systemId)
      : undefined;
    const accent = owner?.color ?? "#4fd2ff";
    return (
      <div className="relative h-full w-full galaxy-bg overflow-hidden flex flex-col items-center justify-center">
        <div className="galaxy-nebula pointer-events-none absolute inset-0 opacity-70" />
        <div
          className="pointer-events-none absolute rounded-full"
          style={{
            width: "min(70vmin, 520px)",
            height: "min(70vmin, 520px)",
            background: `radial-gradient(circle, ${accent}33 0%, transparent 68%)`,
            filter: "blur(10px)",
          }}
        />
        <div className="relative z-[1] flex flex-col items-center gap-5 px-6 w-full max-w-xl">
          <div
            className="relative w-full"
            style={{ height: "min(52vh, 420px)" }}
          >
            <WarpGateGlobe
              accentColor={accent}
              onClick={() => enterStrategic(planet.id)}
            />
          </div>
          <div className="text-center space-y-2 max-w-lg">
            <p className="text-[10px] font-display uppercase tracking-[0.2em] text-muted">
              Warp terminus
            </p>
            <h1 className="font-display text-3xl text-star">{planet.name}</h1>
            <p className="text-sm text-brass">
              {owner
                ? `Controlled by ${owner.name}`
                : "Unclaimed — open transit"}
            </p>
            <p className="text-xs text-muted leading-relaxed">
              {linked
                ? `Paired with ${linked.name}${linkedSys ? ` in ${linkedSys.name}` : ""}.`
                : "No stable pair — transit will dump fleets at a random system."}{" "}
              Ownership is decided solely by the Relay Crown on the station deck.
            </p>
            <button
              type="button"
              className="hud-btn hud-btn-active mt-2"
              onClick={() => enterStrategic(planet.id)}
            >
              Enter station deck
            </button>
          </div>
        </div>
      </div>
    );
  }

  const accent = faction?.color ?? atmosphereColor(planet.classification);
  const classLabel =
    PLANET_CLASSIFICATION_LABELS[planet.classification] ??
    PLANET_CLASSIFICATION_LABELS.earthlike;
  const visualModelId = resolvePlanetVisualModelId(
    planet.classification,
    planet.visualModelId,
    planet.id,
  );

  return (
    <div className="relative h-full w-full galaxy-bg overflow-hidden flex items-center justify-center">
      <div className="galaxy-nebula pointer-events-none absolute inset-0 opacity-80" />

      <div
        className="absolute rounded-full pointer-events-none"
        style={{
          width: "min(70vmin, 520px)",
          height: "min(70vmin, 520px)",
          background: `radial-gradient(circle, ${accent}33 0%, transparent 68%)`,
          filter: "blur(8px)",
        }}
      />

      <div className="relative z-[1] flex flex-col items-center gap-6 px-6">
        <div className="relative group">
          <PlanetGlobe
            planetId={planet.id}
            classification={planet.classification}
            visualModelId={visualModelId}
            accentColor={accent}
            className="w-[min(52vmin,380px)] h-[min(52vmin,380px)] rounded-full overflow-hidden shadow-[0_0_60px_rgba(0,0,0,0.45)] transition-transform hover:scale-[1.03] focus-within:ring-2 focus-within:ring-cyan"
            onClick={() => enterStrategic(planet.id)}
          />
          <span className="absolute inset-x-0 bottom-6 text-center text-[10px] font-display uppercase tracking-[0.18em] text-cyan/80 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            Strategic map
          </span>
        </div>

        <div className="text-center max-w-md pointer-events-none">
          <p className="text-[10px] font-display uppercase tracking-[0.2em] text-muted mb-1">
            {system?.name ?? "Unknown system"}
          </p>
          <h1
            className="font-display text-3xl sm:text-4xl text-star mb-2"
            style={{ color: accent }}
          >
            {planet.name}
          </h1>
          <p className="text-sm text-brass">
            {PLANET_TYPE_LABELS[planet.type]} · {classLabel}
            {faction ? ` · ${faction.name}` : " · Unclaimed"}
          </p>
          <p className="text-[11px] text-muted mt-3">
            Click the planet to open the strategic hex map
          </p>
        </div>
      </div>
    </div>
  );
}
