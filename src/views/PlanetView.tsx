import { PLANET_TYPE_LABELS } from "../types/campaign";
import { useCampaignStore } from "../store/useCampaignStore";

const TYPE_COLORS: Record<string, string> = {
  hive: "#9ca3af",
  forge: "#f59e0b",
  agri: "#4ade80",
  death: "#ef4444",
  shrine: "#a78bfa",
  custom: "#6b7280",
};

export function PlanetView() {
  const campaign = useCampaignStore((s) => s.campaign);
  const focusedPlanetId = useCampaignStore((s) => s.focusedPlanetId);
  const enterStrategic = useCampaignStore((s) => s.enterStrategic);

  const planet = campaign.planets.find((p) => p.id === focusedPlanetId);
  const system = planet
    ? campaign.systems.find((s) => s.id === planet.systemId)
    : undefined;
  const faction = planet?.controllingFactionId
    ? campaign.factions.find((f) => f.id === planet.controllingFactionId)
    : undefined;

  if (!planet) {
    return (
      <div className="h-full flex items-center justify-center text-muted">
        Planet not found.
      </div>
    );
  }

  const base = TYPE_COLORS[planet.type] ?? "#6b7280";
  const accent = faction?.color ?? base;

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
        <button
          type="button"
          className="relative rounded-full cursor-pointer border-0 p-0 group transition-transform hover:scale-[1.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan"
          style={{
            width: "min(52vmin, 380px)",
            height: "min(52vmin, 380px)",
            background: `
              radial-gradient(circle at 32% 28%, #ffffffaa 0%, transparent 18%),
              radial-gradient(circle at 40% 40%, ${base}ee 0%, ${base} 42%, #0a1018 100%)
            `,
            boxShadow: `
              inset -18px -12px 40px #00000088,
              0 0 40px ${accent}55,
              0 0 120px ${accent}22
            `,
            border: `2px solid ${accent}66`,
          }}
          onClick={() => enterStrategic(planet.id)}
          title="Enter strategic map"
          aria-label={`Enter strategic map for ${planet.name}`}
        >
          <div
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              background:
                "linear-gradient(115deg, transparent 40%, #00000055 78%, #00000099 100%)",
            }}
          />
          <span className="absolute inset-x-0 bottom-6 text-center text-[10px] font-display uppercase tracking-[0.18em] text-cyan/80 opacity-0 group-hover:opacity-100 transition-opacity">
            Strategic map
          </span>
        </button>

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
            {PLANET_TYPE_LABELS[planet.type]}
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
