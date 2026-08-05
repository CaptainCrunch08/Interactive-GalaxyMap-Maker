import { useMemo, useState } from "react";
import {
  PLANET_TYPE_LABELS,
  STRUCTURE_KIND_LABELS,
  normalizeCampaignPlay,
} from "../types/campaign";
import { useCampaignStore } from "../store/useCampaignStore";
import { flatHexPath, flatHexToPixel } from "../lib/hex";
import {
  buildStationGrid,
  nearestStationTile,
  stationTilesInRange,
  STATION_HEX_RADIUS,
} from "../lib/stationHex";
import {
  armyMovementRemaining,
  ARMY_MOVE_RANGE,
  playMoveBlockReason,
} from "../lib/play";
import {
  findRelayCrown,
  linkedWarpGate,
  placeArmyOnStationTile,
  warpGateController,
} from "../lib/warpGates";
import { getFactionById } from "../lib/territory";
import { armyStrength } from "../lib/battleResolve";

const HEX_SIZE = 28;

export function StationMapView() {
  const campaign = useCampaignStore((s) => s.campaign);
  const focusedPlanetId = useCampaignStore((s) => s.focusedPlanetId);
  const selectedPlanetId = useCampaignStore((s) => s.selectedPlanetId);
  const selectedArmyId = useCampaignStore((s) => s.selectedArmyId);
  const selectArmy = useCampaignStore((s) => s.selectArmy);
  const moveArmy = useCampaignStore((s) => s.moveArmy);
  const seizeRelayCrown = useCampaignStore((s) => s.seizeRelayCrown);
  const boardWarpGate = useCampaignStore((s) => s.boardWarpGate);
  const playMoveHint = useCampaignStore((s) => s.playMoveHint);

  const planetId = focusedPlanetId ?? selectedPlanetId;
  const planet = planetId
    ? campaign.planets.find((p) => p.id === planetId)
    : undefined;

  const [hoverTile, setHoverTile] = useState<number | null>(null);

  const grid = useMemo(() => buildStationGrid(STATION_HEX_RADIUS), []);
  const play = normalizeCampaignPlay(campaign.play);

  const layout = useMemo(() => {
    const pts = grid.tiles.map((t, i) => {
      const p = flatHexToPixel(t.q, t.r, HEX_SIZE);
      return { i, ...p };
    });
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of pts) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    const pad = HEX_SIZE * 1.4;
    return {
      pts,
      width: maxX - minX + pad * 2,
      height: maxY - minY + pad * 2,
      ox: -minX + pad,
      oy: -minY + pad,
    };
  }, [grid.tiles]);

  if (!planet || planet.type !== "warp_gate") {
    return (
      <div className="h-full flex items-center justify-center text-muted">
        No warp gate station loaded.
      </div>
    );
  }

  const ownerId = warpGateController(planet);
  const owner = getFactionById(campaign, ownerId);
  const linked = linkedWarpGate(campaign, planet);
  const linkedSystem = linked
    ? campaign.systems.find((s) => s.id === linked.systemId)
    : undefined;
  const crown = findRelayCrown(planet);
  const structuresByTile = new Map(
    (planet.structures ?? []).map((s) => [s.tileIndex, s]),
  );
  const armies = planet.armies ?? [];
  const selectedArmy = armies.find((a) => a.id === selectedArmyId);
  const selectedTile = selectedArmy
    ? nearestStationTile(selectedArmy.dir)
    : null;
  const moveBlock = selectedArmy
    ? playMoveBlockReason(
        campaign,
        selectedArmy.factionId,
        selectedArmy.id,
        "army",
      )
    : null;
  const remaining =
    selectedArmy && play.active && !moveBlock
      ? armyMovementRemaining(play, selectedArmy.id)
      : selectedArmy && !play.active
        ? ARMY_MOVE_RANGE
        : 0;
  const reach =
    selectedTile != null && remaining > 0
      ? stationTilesInRange(selectedTile, remaining)
      : new Set<number>();

  const canSeize =
    !!selectedArmy &&
    !!crown &&
    selectedTile === crown.tileIndex &&
    crown.controllingFactionId !== selectedArmy.factionId;

  const onTileClick = (tileIndex: number) => {
    const armyHere = armies.find(
      (a) => nearestStationTile(a.dir) === tileIndex,
    );
    if (armyHere) {
      selectArmy(armyHere.id);
      return;
    }
    if (!selectedArmy) return;
    if (play.active && moveBlock) return;
    if (play.active && !reach.has(tileIndex) && tileIndex !== selectedTile) {
      return;
    }
    moveArmy(planet.id, selectedArmy.id, placeArmyOnStationTile(tileIndex));
  };

  return (
    <div className="relative h-full w-full galaxy-bg overflow-hidden flex flex-col">
      <div className="galaxy-nebula pointer-events-none absolute inset-0 opacity-40" />

      <div className="relative z-[1] shrink-0 px-4 pt-3 pb-1 text-center">
        <p className="text-[10px] font-display uppercase tracking-[0.2em] text-muted">
          Warp gate station · flat survey
        </p>
        <h1 className="font-display text-xl text-star">{planet.name}</h1>
        <p className="text-xs text-brass mt-0.5">
          {PLANET_TYPE_LABELS.warp_gate}
          {owner ? ` · Controlled by ${owner.name}` : " · Unclaimed"}
          {linked
            ? ` · Linked to ${linked.name}${linkedSystem ? ` (${linkedSystem.name})` : ""}`
            : " · Unstable / unlinked"}
          {` · ${armies.length} detachments`}
        </p>
        {playMoveHint && (
          <p className="text-[11px] text-brass mt-1">{playMoveHint}</p>
        )}
      </div>

      <div className="relative z-[1] flex-1 min-h-0 flex items-center justify-center p-3">
        <svg
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          className="max-w-full max-h-full w-auto h-auto drop-shadow-lg"
          role="img"
          aria-label="Warp gate station map"
        >
          <defs>
            <radialGradient id="station-floor" cx="50%" cy="50%" r="65%">
              <stop offset="0%" stopColor="#1a2838" />
              <stop offset="100%" stopColor="#0a1018" />
            </radialGradient>
          </defs>
          <rect
            width={layout.width}
            height={layout.height}
            fill="url(#station-floor)"
          />
          {layout.pts.map(({ i, x, y }) => {
            const cx = x + layout.ox;
            const cy = y + layout.oy;
            const st = structuresByTile.get(i);
            const isCrown = st?.kind === "relay_crown";
            const inReach = reach.has(i);
            const hovered = hoverTile === i;
            const selected = selectedTile === i;
            const fill = isCrown
              ? owner?.color
                ? `${owner.color}55`
                : "#e8c54744"
              : st
                ? "#2a3a4a"
                : "#121a24";
            const stroke = selected
              ? "#4fd2ff"
              : inReach
                ? "#4fd2ff88"
                : hovered
                  ? "#9eb0c0"
                  : isCrown
                    ? "#e8c547"
                    : "#3a4a5a";
            return (
              <g key={i}>
                <path
                  d={flatHexPath(cx, cy, HEX_SIZE * 0.95)}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={selected || isCrown ? 2.2 : 1}
                  className="cursor-pointer"
                  onMouseEnter={() => setHoverTile(i)}
                  onMouseLeave={() => setHoverTile(null)}
                  onClick={() => onTileClick(i)}
                />
                {st && (
                  <text
                    x={cx}
                    y={cy + (isCrown ? -6 : 0)}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill={isCrown ? "#e8c547" : "#9eb0c0"}
                    fontSize={isCrown ? 9 : 7}
                    className="pointer-events-none font-display uppercase"
                  >
                    {isCrown
                      ? "CROWN"
                      : (STRUCTURE_KIND_LABELS[st.kind] ?? st.kind).slice(0, 8)}
                  </text>
                )}
              </g>
            );
          })}
          {armies.map((army) => {
            const tile = nearestStationTile(army.dir);
            const pt = layout.pts[tile];
            if (!pt) return null;
            const fac = getFactionById(campaign, army.factionId);
            const cx = pt.x + layout.ox;
            const cy = pt.y + layout.oy;
            const active = army.id === selectedArmyId;
            return (
              <g
                key={army.id}
                className="cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  selectArmy(army.id);
                }}
              >
                <circle
                  cx={cx}
                  cy={cy + 8}
                  r={active ? 9 : 7}
                  fill={fac?.color ?? "#4fd2ff"}
                  stroke={active ? "#fff" : "#0a1018"}
                  strokeWidth={active ? 2 : 1}
                />
                <text
                  x={cx}
                  y={cy + 22}
                  textAnchor="middle"
                  fill="#e8f0f8"
                  fontSize={8}
                  className="pointer-events-none"
                >
                  {army.name.slice(0, 12)}
                </text>
                <title>
                  {army.name} · STR {armyStrength(army)}
                </title>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="relative z-[2] shrink-0 flex flex-wrap items-center justify-center gap-2 px-4 pb-4">
        <button
          type="button"
          className="hud-btn"
          onClick={() => boardWarpGate(planet.id)}
        >
          Board from orbit
        </button>
        {canSeize && selectedArmy && (
          <button
            type="button"
            className="hud-btn hud-btn-active"
            onClick={() => seizeRelayCrown(planet.id, selectedArmy.id)}
          >
            Seize Relay Crown
          </button>
        )}
        {selectedArmy && (
          <span className="text-[10px] text-muted uppercase tracking-wider">
            {play.active
              ? moveBlock ??
                `Movement ${remaining}/${ARMY_MOVE_RANGE} · click a highlighted hex`
              : "Edit mode · click hexes to reposition"}
          </span>
        )}
      </div>
    </div>
  );
}
