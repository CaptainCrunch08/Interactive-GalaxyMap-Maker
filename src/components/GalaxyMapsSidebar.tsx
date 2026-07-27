import { useEffect, useState } from "react";
import { useCampaignStore } from "../store/useCampaignStore";
import { NewGalaxyDialog } from "./NewGalaxyDialog";
import type { GalaxySize } from "../lib/generateGalaxy";

type LeaveAction =
  | { kind: "switch"; mapId: string }
  | { kind: "create"; options: { kind: "empty" | "generated"; size?: GalaxySize } }
  | { kind: "delete"; mapId: string; name: string };

export function GalaxyMapsSidebar() {
  const sideMenuOpen = useCampaignStore((s) => s.sideMenuOpen);
  const mapOrder = useCampaignStore((s) => s.mapOrder);
  const maps = useCampaignStore((s) => s.maps);
  const activeMapId = useCampaignStore((s) => s.activeMapId);
  const campaign = useCampaignStore((s) => s.campaign);
  const isDirty = useCampaignStore((s) => s.isDirty);
  const switchMap = useCampaignStore((s) => s.switchMap);
  const createMap = useCampaignStore((s) => s.createMap);
  const deleteMap = useCampaignStore((s) => s.deleteMap);
  const saveGalaxy = useCampaignStore((s) => s.saveGalaxy);
  const setCampaignName = useCampaignStore((s) => s.setCampaignName);
  const toggleSideMenu = useCampaignStore((s) => s.toggleSideMenu);
  const [newGalaxyOpen, setNewGalaxyOpen] = useState(false);
  const [leaveAction, setLeaveAction] = useState<LeaveAction | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!useCampaignStore.getState().isDirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  const runLeaveAction = (action: LeaveAction) => {
    if (action.kind === "switch") switchMap(action.mapId);
    else if (action.kind === "create") createMap(action.options);
    else deleteMap(action.mapId);
  };

  const requestLeave = (action: LeaveAction) => {
    if (!isDirty) {
      runLeaveAction(action);
      return;
    }
    setLeaveAction(action);
  };

  if (!sideMenuOpen) return null;

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-20 bg-void/60 md:hidden"
        aria-label="Close galaxy list"
        onClick={toggleSideMenu}
      />
      <aside className="absolute left-0 top-0 bottom-0 z-30 w-64 flex flex-col border-r hud-side shadow-lg">
        <div className="flex items-center justify-between px-4 py-3 border-b border-panel-border">
          <h2 className="font-display text-[10px] text-cyan uppercase tracking-[0.18em]">
            Outliner
          </h2>
          <button
            type="button"
            className="text-muted hover:text-cyan text-lg leading-none px-1"
            onClick={toggleSideMenu}
            title="Close menu"
            aria-label="Close menu"
          >
            ×
          </button>
        </div>

        <div className="px-3 pt-3 pb-1 flex items-center justify-between gap-2">
          <p className="text-[10px] font-display uppercase tracking-wider text-muted">
            Galaxy maps
          </p>
          {isDirty && (
            <span className="text-[9px] uppercase tracking-wider text-brass">
              Unsaved
            </span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
          {mapOrder.map((id) => {
            const map = maps[id];
            if (!map) return null;
            const active = id === activeMapId;
            return (
              <div key={id} className="group flex items-center gap-0.5">
                <button
                  type="button"
                  className={`outliner-item flex-1 min-w-0 ${active ? "outliner-item-active" : ""}`}
                  onClick={() => {
                    if (id === activeMapId) return;
                    requestLeave({ kind: "switch", mapId: id });
                  }}
                >
                  <span className="block truncate">
                    {map.name}
                    {active && isDirty ? " •" : ""}
                  </span>
                </button>
                {mapOrder.length > 1 && (
                  <button
                    type="button"
                    className="shrink-0 opacity-0 group-hover:opacity-100 text-muted hover:text-crimson text-xs px-1.5"
                    title="Remove map"
                    onClick={() =>
                      setPendingDelete({ id, name: map.name })
                    }
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="p-3 border-t border-panel-border space-y-2">
          <button
            type="button"
            className={`hud-btn w-full ${isDirty ? "hud-btn-active" : ""}`}
            onClick={() => saveGalaxy()}
            title="Download this galaxy as a JSON file"
          >
            {isDirty ? "Save galaxy…" : "Save galaxy"}
          </button>
          <button
            type="button"
            className="hud-btn w-full"
            onClick={() => setNewGalaxyOpen(true)}
          >
            + New galaxy map
          </button>
          <label className="block text-[10px] font-display uppercase tracking-wider text-muted">
            Rename active
          </label>
          <input
            className="hud-input"
            value={maps[activeMapId]?.name ?? ""}
            onChange={(e) => setCampaignName(e.target.value)}
          />
        </div>
      </aside>

      <NewGalaxyDialog
        open={newGalaxyOpen}
        onCancel={() => setNewGalaxyOpen(false)}
        onConfirm={(options) => {
          setNewGalaxyOpen(false);
          requestLeave({ kind: "create", options });
        }}
      />

      {pendingDelete && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-void/75"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-galaxy-title"
        >
          <div className="hud-panel w-full max-w-sm p-4 shadow-xl space-y-4">
            <h2
              id="delete-galaxy-title"
              className="font-display text-sm text-cyan uppercase tracking-[0.14em]"
            >
              Delete galaxy
            </h2>
            <p className="text-xs text-muted leading-relaxed">
              Are you sure you want to delete{" "}
              <span className="text-star">{pendingDelete.name}</span>? This
              cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className="hud-btn flex-1"
                onClick={() => setPendingDelete(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="hud-btn flex-1 text-crimson border-crimson/40"
                onClick={() => {
                  const { id, name } = pendingDelete;
                  setPendingDelete(null);
                  if (id === activeMapId && isDirty) {
                    requestLeave({ kind: "delete", mapId: id, name });
                  } else {
                    deleteMap(id);
                  }
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {leaveAction && (
        <div
          className="fixed inset-0 z-[85] flex items-center justify-center p-4 bg-void/75"
          role="dialog"
          aria-modal="true"
          aria-labelledby="leave-galaxy-title"
        >
          <div className="hud-panel w-full max-w-sm p-4 shadow-xl space-y-4">
            <h2
              id="leave-galaxy-title"
              className="font-display text-sm text-cyan uppercase tracking-[0.14em]"
            >
              Unsaved changes
            </h2>
            <p className="text-xs text-muted leading-relaxed">
              Save{" "}
              <span className="text-star">{campaign.name}</span> before
              leaving this galaxy? A JSON file will download to your computer.
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                className="hud-btn w-full hud-btn-active"
                onClick={() => {
                  const action = leaveAction;
                  setLeaveAction(null);
                  saveGalaxy();
                  // Allow download to start, then leave
                  window.setTimeout(() => runLeaveAction(action), 50);
                }}
              >
                Save and continue
              </button>
              <button
                type="button"
                className="hud-btn w-full"
                onClick={() => {
                  const action = leaveAction;
                  setLeaveAction(null);
                  runLeaveAction(action);
                }}
              >
                Don&apos;t save
              </button>
              <button
                type="button"
                className="hud-btn w-full"
                onClick={() => setLeaveAction(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
