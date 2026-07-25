import { useCampaignStore } from "../store/useCampaignStore";

export function Breadcrumbs() {
  const campaign = useCampaignStore((s) => s.campaign);
  const viewLevel = useCampaignStore((s) => s.viewLevel);
  const focusedSystemId = useCampaignStore((s) => s.focusedSystemId);
  const focusedPlanetId = useCampaignStore((s) => s.focusedPlanetId);
  const setViewLevel = useCampaignStore((s) => s.setViewLevel);
  const enterSystem = useCampaignStore((s) => s.enterSystem);
  const enterPlanet = useCampaignStore((s) => s.enterPlanet);
  const enterTimeline = useCampaignStore((s) => s.enterTimeline);

  const system = campaign.systems.find((s) => s.id === focusedSystemId);
  const planet = campaign.planets.find((p) => p.id === focusedPlanetId);

  const crumbClass =
    "text-cyan-dim hover:text-cyan transition-colors bg-transparent border-0 p-0 cursor-pointer font-display text-[11px] tracking-wide uppercase";

  return (
    <nav className="flex items-center gap-2 text-sm text-muted font-body">
      <button
        type="button"
        className={crumbClass + (viewLevel === "galaxy" ? " text-cyan" : "")}
        onClick={() => setViewLevel("galaxy")}
      >
        Galaxy
      </button>
      {viewLevel === "timeline" && (
        <>
          <span className="text-panel-border">/</span>
          <button
            type="button"
            className={crumbClass + " text-cyan"}
            onClick={() => enterTimeline()}
          >
            Timeline
          </button>
        </>
      )}
      {system && viewLevel !== "timeline" && (
        <>
          <span className="text-panel-border">/</span>
          <button
            type="button"
            className={
              crumbClass + (viewLevel === "system" ? " text-cyan" : "")
            }
            onClick={() => enterSystem(system.id)}
          >
            {system.name}
          </button>
        </>
      )}
      {planet &&
        (viewLevel === "planet" || viewLevel === "strategic") && (
          <>
            <span className="text-panel-border">/</span>
            <button
              type="button"
              className={
                crumbClass + (viewLevel === "planet" ? " text-cyan" : "")
              }
              onClick={() => enterPlanet(planet.id)}
            >
              {planet.name}
            </button>
          </>
        )}
      {viewLevel === "strategic" && (
        <>
          <span className="text-panel-border">/</span>
          <span className="text-cyan text-[11px] font-display uppercase tracking-wide">
            Strategic
          </span>
        </>
      )}
    </nav>
  );
}
