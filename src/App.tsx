import { useEffect } from "react";
import { AppShell } from "./components/AppShell";
import { useCampaignStore } from "./store/useCampaignStore";

function App() {
  const viewLevel = useCampaignStore((s) => s.viewLevel);
  const toggleEditMode = useCampaignStore((s) => s.toggleEditMode);
  const goBack = useCampaignStore((s) => s.goBack);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (e.key === "Escape") {
        goBack();
      }
      if (e.key === "e" || e.key === "E") {
        if (viewLevel === "galaxy") toggleEditMode();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewLevel, goBack, toggleEditMode]);

  return <AppShell />;
}

export default App;
