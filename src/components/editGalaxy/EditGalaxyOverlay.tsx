import { useCampaignStore } from "../../store/useCampaignStore";
import { EditGalaxyFactionsPanel } from "./EditGalaxyFactionsPanel";
import { EditGalaxyContentsPanel } from "./EditGalaxyContentsPanel";
import { EditGalaxyEventsPanel } from "./EditGalaxyEventsPanel";

const TABS = [
  { id: "factions" as const, label: "Factions" },
  { id: "contents" as const, label: "Galaxy Contents" },
  { id: "events" as const, label: "Galactic Events" },
];

export function EditGalaxyOverlay() {
  const open = useCampaignStore((s) => s.galaxyEditorOpen);
  const tab = useCampaignStore((s) => s.galaxyEditorTab);
  const campaign = useCampaignStore((s) => s.campaign);
  const setGalaxyEditorTab = useCampaignStore((s) => s.setGalaxyEditorTab);
  const closeGalaxyEditor = useCampaignStore((s) => s.closeGalaxyEditor);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex bg-void/95 text-star"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-galaxy-title"
    >
      <aside className="w-52 shrink-0 flex flex-col border-r border-panel-border bg-[#070d14]">
        <div className="px-4 py-4 border-b border-panel-border">
          <h2
            id="edit-galaxy-title"
            className="font-display text-[10px] text-cyan uppercase tracking-[0.18em]"
          >
            Edit Galaxy
          </h2>
          <p className="text-[11px] text-muted mt-1 truncate" title={campaign.name}>
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
              onClick={() => setGalaxyEditorTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-panel-border">
          <button
            type="button"
            className="hud-btn w-full"
            onClick={() => closeGalaxyEditor()}
          >
            Close
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 min-h-0 flex flex-col">
        {tab === "factions" && <EditGalaxyFactionsPanel />}
        {tab === "contents" && <EditGalaxyContentsPanel />}
        {tab === "events" && <EditGalaxyEventsPanel />}
      </div>
    </div>
  );
}
