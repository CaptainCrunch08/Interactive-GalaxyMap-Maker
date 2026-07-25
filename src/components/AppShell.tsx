import { Breadcrumbs } from "./Breadcrumbs";
import { GalaxyMapsSidebar } from "./GalaxyMapsSidebar";
import { InspectorPanel } from "./InspectorPanel";
import { SiteTitle } from "./SiteTitle";
import { useCampaignStore } from "../store/useCampaignStore";
import { GalaxyView } from "../views/GalaxyView";
import { PlanetView } from "../views/PlanetView";
import { StrategicView } from "../views/StrategicView";
import { SystemView } from "../views/SystemView";
import { TimelineView } from "../views/TimelineView";

export function AppShell() {
  const viewLevel = useCampaignStore((s) => s.viewLevel);
  const goBack = useCampaignStore((s) => s.goBack);
  const toggleSideMenu = useCampaignStore((s) => s.toggleSideMenu);
  const sideMenuOpen = useCampaignStore((s) => s.sideMenuOpen);
  const inspectorOpen = useCampaignStore((s) => s.inspectorOpen);
  const toggleInspector = useCampaignStore((s) => s.toggleInspector);

  return (
    <div
      className={`h-full flex flex-col relative transition-[padding] duration-200 ${
        sideMenuOpen ? "pl-64" : ""
      }`}
    >
      <GalaxyMapsSidebar />
      <header className="shrink-0 hud-topbar flex items-center gap-3 px-3 py-2.5">
        <button
          type="button"
          className={`hud-btn shrink-0 ${sideMenuOpen ? "hud-btn-active" : ""}`}
          onClick={toggleSideMenu}
          title="Outliner — galaxy maps"
          aria-label="Toggle galaxy maps menu"
          aria-expanded={sideMenuOpen}
        >
          ☰ Maps
        </button>
        <SiteTitle />
        <span className="text-panel-border/80 hidden sm:inline text-xs">│</span>
        <Breadcrumbs />
        <div className="flex-1" />
        {viewLevel !== "galaxy" && (
          <button
            type="button"
            className="hud-btn"
            onClick={goBack}
            title="Back (Escape)"
          >
            ← Back
          </button>
        )}
        <button
          type="button"
          className={`hud-btn shrink-0 ${inspectorOpen ? "hud-btn-active" : ""}`}
          onClick={toggleInspector}
          title="Toggle details panel"
          aria-label="Toggle details panel"
          aria-expanded={inspectorOpen}
        >
          Details
        </button>
      </header>

      <div className="flex-1 flex min-h-0">
        <main className="flex-1 min-w-0 relative">
          {viewLevel === "galaxy" && <GalaxyView />}
          {viewLevel === "timeline" && <TimelineView />}
          {viewLevel === "system" && <SystemView />}
          {viewLevel === "planet" && <PlanetView />}
          {viewLevel === "strategic" && <StrategicView />}
        </main>
        {inspectorOpen && <InspectorPanel />}
      </div>
    </div>
  );
}
