import { useCampaignStore } from "../../store/useCampaignStore";
import { StrategicOverviewPanel } from "./StrategicOverviewPanel";
import { FactionsOverviewPanel } from "./FactionsOverviewPanel";
import { PlanetsOverviewPanel } from "./PlanetsOverviewPanel";
import { CharactersOverviewPanel } from "./CharactersOverviewPanel";

const TABS = [
  { id: "strategic" as const, label: "Strategic Overview" },
  { id: "factions" as const, label: "Factions" },
  { id: "planets" as const, label: "Planets" },
  { id: "characters" as const, label: "Characters" },
];

export function GalacticOverviewOverlay() {
  const open = useCampaignStore((s) => s.galaxyOverviewOpen);
  const tab = useCampaignStore((s) => s.galaxyOverviewTab);
  const campaign = useCampaignStore((s) => s.campaign);
  const setGalaxyOverviewTab = useCampaignStore((s) => s.setGalaxyOverviewTab);
  const closeGalaxyOverview = useCampaignStore((s) => s.closeGalaxyOverview);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex bg-void/95 text-star"
      role="dialog"
      aria-modal="true"
      aria-labelledby="galactic-overview-title"
    >
      <aside className="w-52 shrink-0 flex flex-col border-r border-panel-border bg-[#070d14]">
        <div className="px-4 py-4 border-b border-panel-border">
          <h2
            id="galactic-overview-title"
            className="font-display text-[10px] text-brass uppercase tracking-[0.18em]"
          >
            Galactic Overview
          </h2>
          <p
            className="text-[11px] text-muted mt-1 truncate"
            title={campaign.name}
          >
            {campaign.name}
          </p>
        </div>
        <nav className="flex-1 p-2 space-y-0.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`outliner-item w-full text-left ${
                tab === t.id ? "outliner-item-active" : ""
              }`}
              onClick={() => setGalaxyOverviewTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-panel-border">
          <button
            type="button"
            className="hud-btn w-full"
            onClick={() => closeGalaxyOverview()}
          >
            Close
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 min-h-0 flex flex-col">
        {tab === "strategic" && <StrategicOverviewPanel />}
        {tab === "factions" && <FactionsOverviewPanel />}
        {tab === "planets" && <PlanetsOverviewPanel />}
        {tab === "characters" && <CharactersOverviewPanel />}
      </div>
    </div>
  );
}
