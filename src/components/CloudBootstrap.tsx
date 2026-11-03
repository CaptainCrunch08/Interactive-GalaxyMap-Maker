import { useEffect, useState, type ReactNode } from "react";
import { CloudApiError, fetchMe } from "../lib/cloudMapsApi";
import {
  enableCloudSync,
  hydrateMapsFromCloud,
  uploadLocalMapsToCloud,
} from "../lib/cloudSync";
import { useCampaignStore } from "../store/useCampaignStore";

type Phase =
  | { kind: "loading"; message: string }
  | { kind: "migrate"; email: string }
  | { kind: "error"; message: string }
  | { kind: "ready"; email: string };

function waitForPersistHydration(): Promise<void> {
  const api = useCampaignStore.persist;
  if (api.hasHydrated()) return Promise.resolve();
  return new Promise((resolve) => {
    const unsub = api.onFinishHydration(() => {
      unsub();
      resolve();
    });
  });
}

/** True when this browser already had zustand-persisted maps before cloud. */
function hasPersistedLocalMaps(): boolean {
  try {
    const raw = localStorage.getItem("galaxy-campaign-map");
    if (!raw) return false;
    const parsed = JSON.parse(raw) as {
      state?: { maps?: Record<string, unknown>; mapOrder?: string[] };
    };
    const order = parsed.state?.mapOrder;
    const maps = parsed.state?.maps;
    return Array.isArray(order) && order.length > 0 && !!maps && Object.keys(maps).length > 0;
  } catch {
    return false;
  }
}

export function CloudBootstrap({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>({
    kind: "loading",
    message: "Signing you in…",
  });

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      try {
        setPhase({ kind: "loading", message: "Signing you in…" });
        await waitForPersistHydration();
        if (cancelled) return;

        setPhase({ kind: "loading", message: "Checking session…" });
        const me = await fetchMe();
        if (cancelled) return;

        setPhase({ kind: "loading", message: "Loading cloud maps…" });
        const { empty } = await hydrateMapsFromCloud();
        if (cancelled) return;

        if (empty && hasPersistedLocalMaps()) {
          setPhase({ kind: "migrate", email: me.email });
          return;
        }

        if (empty) {
          await uploadLocalMapsToCloud();
          if (cancelled) return;
        }

        setPhase({ kind: "ready", email: me.email });
      } catch (err) {
        if (cancelled) return;
        let message = "Failed to start cloud sync";
        if (err instanceof CloudApiError) {
          message =
            err.status === 401
              ? "Sign-in required. Open this site through Cloudflare Access, or set VITE_DEV_AUTH_EMAIL for local API development."
              : err.message;
        } else if (err instanceof TypeError) {
          message =
            "Cannot reach /api. Run `npm run pages:dev` (port 8788) alongside Vite, or open the Wrangler URL after building.";
        } else if (err instanceof Error) {
          message = err.message;
        }
        setPhase({ kind: "error", message });
      }
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (phase.kind !== "ready") return;
    return enableCloudSync();
  }, [phase.kind]);

  const finishMigrate = async (upload: boolean) => {
    setPhase({
      kind: "loading",
      message: upload ? "Uploading local maps…" : "Starting…",
    });
    try {
      if (upload) {
        await uploadLocalMapsToCloud();
      }
      const me = await fetchMe();
      setPhase({ kind: "ready", email: me.email });
    } catch (err) {
      setPhase({
        kind: "error",
        message: err instanceof Error ? err.message : "Migration failed",
      });
    }
  };

  if (phase.kind === "ready") {
    return (
      <>
        <div className="pointer-events-none fixed bottom-2 right-3 z-[60] text-[9px] font-display uppercase tracking-wider text-muted/80">
          {phase.email}
        </div>
        {children}
      </>
    );
  }

  if (phase.kind === "migrate") {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-void p-6">
        <div className="hud-panel w-full max-w-md p-5 space-y-4 shadow-xl">
          <h1 className="font-display text-sm text-cyan uppercase tracking-[0.16em]">
            Upload local maps?
          </h1>
          <p className="text-xs text-muted leading-relaxed">
            This browser has galaxy maps saved locally, and your cloud account (
            <span className="text-star">{phase.email}</span>) has none yet.
            Upload them so they sync across devices?
          </p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              className="hud-btn w-full hud-btn-active"
              onClick={() => void finishMigrate(true)}
            >
              Upload local maps to cloud
            </button>
            <button
              type="button"
              className="hud-btn w-full"
              onClick={() => void finishMigrate(false)}
            >
              Keep browsing without uploading
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-void p-6">
      <div className="hud-panel w-full max-w-sm p-5 space-y-3 shadow-xl text-center">
        <h1 className="font-display text-sm text-cyan uppercase tracking-[0.16em]">
          Galaxy Map Maker
        </h1>
        {phase.kind === "loading" ? (
          <p className="text-xs text-muted">{phase.message}</p>
        ) : (
          <>
            <p className="text-xs text-crimson leading-relaxed">{phase.message}</p>
            <button
              type="button"
              className="hud-btn w-full"
              onClick={() => window.location.reload()}
            >
              Retry
            </button>
          </>
        )}
      </div>
    </div>
  );
}
