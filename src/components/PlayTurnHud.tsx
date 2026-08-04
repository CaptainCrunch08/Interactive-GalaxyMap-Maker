import { useEffect, useState } from "react";
import { normalizeCampaignPlay } from "../types/campaign";
import { useCampaignStore } from "../store/useCampaignStore";

export function PlayTurnHud() {
  const campaign = useCampaignStore((s) => s.campaign);
  const playMoveHint = useCampaignStore((s) => s.playMoveHint);
  const startPlayCampaign = useCampaignStore((s) => s.startPlayCampaign);
  const stopPlayCampaign = useCampaignStore((s) => s.stopPlayCampaign);
  const endTurn = useCampaignStore((s) => s.endTurn);
  const clearPlayMoveHint = useCampaignStore((s) => s.clearPlayMoveHint);
  const [confirmEnd, setConfirmEnd] = useState(false);

  const play = normalizeCampaignPlay(campaign.play);
  const hasFactions = campaign.factions.length > 0;
  const activeFaction = play.activeFactionId
    ? campaign.factions.find((f) => f.id === play.activeFactionId)
    : undefined;

  useEffect(() => {
    if (!playMoveHint) return;
    const t = window.setTimeout(() => clearPlayMoveHint(), 3500);
    return () => window.clearTimeout(t);
  }, [playMoveHint, clearPlayMoveHint]);

  useEffect(() => {
    if (!play.active) setConfirmEnd(false);
  }, [play.active]);

  return (
    <div className="flex items-center gap-2 shrink-0">
      {!play.active ? (
        <button
          type="button"
          className="hud-btn"
          disabled={!hasFactions}
          title={
            hasFactions
              ? "Start hotseat campaign — only the active faction can move units"
              : "Add factions in Maps → Edit Galaxy first"
          }
          onClick={() => startPlayCampaign()}
        >
          Start campaign
        </button>
      ) : (
        <>
          <div className="hud-panel flex items-center gap-2 px-2.5 py-1 text-[11px]">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full shrink-0 border border-white/25"
              style={{ background: activeFaction?.color ?? "#6a8296" }}
              aria-hidden
            />
            <span className="text-muted whitespace-nowrap">
              Round {play.round}
            </span>
            <span className="text-cyan font-display uppercase tracking-wider whitespace-nowrap">
              {activeFaction?.name ?? "—"}
            </span>
          </div>
          <button
            type="button"
            className="hud-btn"
            onClick={() => endTurn()}
            title="End turn and pass to the next faction"
          >
            End turn
          </button>
          {confirmEnd ? (
            <span className="flex items-center gap-1">
              <button
                type="button"
                className="hud-btn text-crimson"
                onClick={() => {
                  stopPlayCampaign();
                  setConfirmEnd(false);
                }}
              >
                Confirm end
              </button>
              <button
                type="button"
                className="hud-btn"
                onClick={() => setConfirmEnd(false)}
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              type="button"
              className="hud-btn"
              onClick={() => setConfirmEnd(true)}
              title="Leave Play mode (map data is kept)"
            >
              End campaign
            </button>
          )}
        </>
      )}
      {playMoveHint && (
        <span
          className="hidden md:inline text-[11px] text-brass max-w-[16rem] truncate"
          title={playMoveHint}
        >
          {playMoveHint}
        </span>
      )}
    </div>
  );
}
