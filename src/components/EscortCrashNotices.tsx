import { useCampaignStore } from "../store/useCampaignStore";

/** Popup stack after escorts are destroyed and detachments crash-land. */
export function EscortCrashNotices() {
  const notices = useCampaignStore((s) => s.escortCrashNotices);
  const clear = useCampaignStore((s) => s.clearEscortCrashNotices);
  if (notices.length === 0) return null;

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-void/70 p-4">
      <div className="w-full max-w-md rounded border border-panel-border bg-panel p-5 space-y-3 shadow-xl">
        <h3 className="font-display text-lg text-star">Crash landing</h3>
        <ul className="space-y-2">
          {notices.map((msg, i) => (
            <li key={`${msg}-${i}`} className="text-sm text-star leading-snug">
              {msg}
            </li>
          ))}
        </ul>
        <button type="button" className="hud-btn w-full" onClick={clear}>
          Continue
        </button>
      </div>
    </div>
  );
}
