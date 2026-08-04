import { useEffect } from "react";
import { AppShell } from "./components/AppShell";
import { useCampaignStore } from "./store/useCampaignStore";

function App() {
  const goBack = useCampaignStore((s) => s.goBack);
  const viewLevel = useCampaignStore((s) => s.viewLevel);
  const galaxyEditorOpen = useCampaignStore((s) => s.galaxyEditorOpen);
  const galaxyEditorTab = useCampaignStore((s) => s.galaxyEditorTab);
  const closeGalaxyEditor = useCampaignStore((s) => s.closeGalaxyEditor);
  const galaxyOverviewOpen = useCampaignStore((s) => s.galaxyOverviewOpen);
  const closeGalaxyOverview = useCampaignStore((s) => s.closeGalaxyOverview);
  const battleResolve = useCampaignStore((s) => s.battleResolve);
  const closeBattleResolve = useCampaignStore((s) => s.closeBattleResolve);
  const undoContentsEdit = useCampaignStore((s) => s.undoContentsEdit);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inField =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement;

      const isUndo =
        (e.key === "z" || e.key === "Z") &&
        (e.ctrlKey || e.metaKey) &&
        !e.shiftKey &&
        galaxyEditorOpen &&
        galaxyEditorTab === "contents";

      if (isUndo) {
        e.preventDefault();
        undoContentsEdit();
        return;
      }

      if (e.key === "Escape") {
        if (battleResolve) {
          closeBattleResolve();
          return;
        }
      }

      if (inField) return;

      if (e.key === "Escape") {
        if (
          galaxyEditorOpen &&
          galaxyEditorTab === "contents" &&
          viewLevel !== "galaxy"
        ) {
          goBack();
          return;
        }
        if (galaxyEditorOpen) {
          closeGalaxyEditor();
          return;
        }
        if (galaxyOverviewOpen) {
          closeGalaxyOverview();
          return;
        }
        goBack();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    goBack,
    viewLevel,
    galaxyEditorOpen,
    galaxyEditorTab,
    closeGalaxyEditor,
    galaxyOverviewOpen,
    closeGalaxyOverview,
    battleResolve,
    closeBattleResolve,
    undoContentsEdit,
  ]);

  return <AppShell />;
}

export default App;
