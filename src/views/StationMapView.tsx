import { useMemo, useState } from "react";
import {
  PLANET_TYPE_LABELS,
  STRUCTURE_KIND_LABELS,
  normalizeCampaignPlay,
} from "../types/campaign";
import { useCampaignStore } from "../store/useCampaignStore";
import {
  buildStationGrid,
  nearestStationTile,
  stationTileCoord,
  stationTilesInRange,
  STATION_GRID_COLS,
  STATION_GRID_ROWS,
} from "../lib/stationHex";
import { buildStationMaze } from "../lib/stationMaze";
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
import {
  armyStrength,
  engageTargetsForStationArmy,
} from "../lib/battleResolve";

const TILE = 18;
const GAP = 1;

export function StationMapView() {
  const campaign = useCampaignStore((s) => s.campaign);
  const focusedPlanetId = useCampaignStore((s) => s.focusedPlanetId);
  const selectedPlanetId = useCampaignStore((s) => s.selectedPlanetId);
  const selectedArmyId = useCampaignStore((s) => s.selectedArmyId);
  const selectArmy = useCampaignStore((s) => s.selectArmy);
  const moveArmy = useCampaignStore((s) => s.moveArmy);
  const seizeRelayCrown = useCampaignStore((s) => s.seizeRelayCrown);
  const boardWarpGate = useCampaignStore((s) => s.boardWarpGate);
  const openBattleResolve = useCampaignStore((s) => s.openBattleResolve);
  const playMoveHint = useCampaignStore((s) => s.playMoveHint);

  const planetId = focusedPlanetId ?? selectedPlanetId;
  const planet = planetId
    ? campaign.planets.find((p) => p.id === planetId)
    : undefined;

  const [hoverTile, setHoverTile] = useState<number | null>(null);

  const grid = useMemo(() => buildStationGrid(), []);
  const maze = useMemo(
    () => (planet ? buildStationMaze(planet.id) : null),
    [planet?.id],
  );
  const play = normalizeCampaignPlay(campaign.play);

  const layout = useMemo(() => {
    const step = TILE + GAP;
    const width = STATION_GRID_COLS * step + 24;
    const height = STATION_GRID_ROWS * step + 24;
    const ox = 12;
    const oy = 12;
    const pts = Array.from({ length: grid.tileCount }, (_, i) => {
      const { x, y } = stationTileCoord(i);
      return {
        i,
        x: ox + x * step,
        y: oy + y * step,
      };
    });
    return { pts, width, height, step };
  }, [grid.tileCount]);

  if (!planet || planet.type !== "warp_gate" || !maze) {
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
    ? nearestStationTile(selectedArmy.dir, undefined, maze.walkable)
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
      ? stationTilesInRange(
          selectedTile,
          remaining,
          undefined,
          maze.walkable,
        )
      : new Set<number>();

  const engageArmyId =
    play.active && selectedArmy && !moveBlock ? selectedArmy.id : null;
  const engageTargets = engageArmyId
    ? engageTargetsForStationArmy(armies, engageArmyId, planet.id)
    : new Map<number, string[]>();
  const fightTiles = new Set(engageTargets.keys());

  const canSeize =
    !!selectedArmy &&
    !!crown &&
    selectedTile === crown.tileIndex &&
    crown.controllingFactionId !== selectedArmy.factionId;

  const onTileClick = (tileIndex: number) => {
    if (!maze.walkable.has(tileIndex)) return;

    // Engage rival on fightable tile (Play mode).
    if (engageArmyId && fightTiles.has(tileIndex)) {
      const rivals = engageTargets.get(tileIndex) ?? [];
      if (rivals.length) {
        openBattleResolve(planet.id, engageArmyId, rivals[0]!);
        return;
      }
    }

    const armyHere = armies.find(
      (a) =>
        nearestStationTile(a.dir, undefined, maze.walkable) === tileIndex,
    );
    if (armyHere) {
      if (
        engageArmyId &&
        armyHere.id !== engageArmyId &&
        armyHere.factionId !== selectedArmy?.factionId &&
        fightTiles.has(tileIndex)
      ) {
        openBattleResolve(planet.id, engageArmyId, armyHere.id);
        return;
      }
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

  const chamberGlow = (notes: string | undefined, fallback: string) => {
    const m = notes?.match(/#[0-9a-fA-F]{6}/);
    return m?.[0] ?? fallback;
  };

  return (
    <div className="relative h-full w-full galaxy-bg overflow-hidden flex flex-col">
      <div className="galaxy-nebula pointer-events-none absolute inset-0 opacity-40" />

      <div className="relative z-[1] shrink-0 px-4 pt-3 pb-1 text-center">
        <p className="text-[10px] font-display uppercase tracking-[0.2em] text-muted">
          Warp gate station · corridor maze
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
        <p className="text-[10px] text-muted mt-1 max-w-xl mx-auto leading-snug">
          {engageArmyId
            ? "Red tiles are valid fights — click a highlighted rival to open the battle report · Move up to 3 tiles per turn"
            : "Enter at the bottom boarding locks (orbit fleet or transport cargo BP), push through the corridors, seize the Relay Crown."}
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
          aria-label="Warp gate station corridor map"
        >
          <defs>
            <pattern
              id="station-grid-bg"
              width="8"
              height="8"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 8 0 L 0 0 0 8"
                fill="none"
                stroke="#1a1a1a"
                strokeWidth="0.6"
                opacity="0.7"
              />
            </pattern>
            <filter id="glow-blue" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3.5" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Black void with subtle grid */}
          <rect width={layout.width} height={layout.height} fill="#000000" />
          <rect
            width={layout.width}
            height={layout.height}
            fill="url(#station-grid-bg)"
          />

          {/* Corridors */}
          {layout.pts.map(({ i, x, y }) => {
            if (!maze.walkable.has(i)) return null;
            const st = structuresByTile.get(i);
            const isCrown = st?.kind === "relay_crown";
            const isDock = maze.dockTiles.includes(i);
            const isChamber = maze.chamberTiles.includes(i);
            const inReach = reach.has(i);
            const isFight = fightTiles.has(i);
            const hovered = hoverTile === i;
            const selected = selectedTile === i;
            const glow = isCrown
              ? owner?.color ?? "#e8c547"
              : isChamber
                ? chamberGlow(st?.notes, "#3b82f6")
                : null;

            return (
              <g key={i}>
                {glow && (
                  <rect
                    x={x - 2}
                    y={y - 2}
                    width={TILE + 4}
                    height={TILE + 4}
                    rx={3}
                    fill={glow}
                    opacity={0.35}
                    filter="url(#glow-blue)"
                    className="pointer-events-none"
                  />
                )}
                <rect
                  x={x}
                  y={y}
                  width={TILE}
                  height={TILE}
                  rx={2}
                  fill={
                    isFight
                      ? "#5c1a1a"
                      : isCrown
                        ? "#3f3a2a"
                        : isDock
                          ? "#1e293b"
                          : isChamber
                            ? "#273244"
                            : "#4b5563"
                  }
                  stroke={
                    selected
                      ? "#4fd2ff"
                      : isFight
                        ? "#ef4444"
                        : inReach
                          ? "#4fd2ff99"
                          : hovered
                            ? "#94a3b8"
                            : isCrown
                              ? "#e8c547"
                              : isDock
                                ? "#f87171"
                                : "#1f2937"
                  }
                  strokeWidth={
                    selected || isCrown || isDock || isFight ? 1.8 : 1
                  }
                  className="cursor-pointer"
                  onMouseEnter={() => setHoverTile(i)}
                  onMouseLeave={() => setHoverTile(null)}
                  onClick={() => onTileClick(i)}
                />
                {/* Floor plating lines */}
                <path
                  d={`M ${x + 3} ${y + TILE / 2} H ${x + TILE - 3}`}
                  stroke="#111827"
                  strokeWidth={0.6}
                  opacity={0.35}
                  className="pointer-events-none"
                />
                {isDock && (
                  <>
                    <path
                      d={`M ${x + TILE / 2} ${y + 4} L ${x + 5} ${y + TILE - 4} L ${x + TILE - 5} ${y + TILE - 4} Z`}
                      fill="none"
                      stroke="#f87171"
                      strokeWidth={1.2}
                      className="pointer-events-none"
                    />
                    <text
                      x={x + TILE / 2}
                      y={y + TILE / 2 + 2}
                      textAnchor="middle"
                      fill="#fecaca"
                      fontSize={6}
                      fontFamily="var(--font-display)"
                      className="pointer-events-none"
                    >
                      IN
                    </text>
                  </>
                )}
                {isCrown && (
                  <text
                    x={x + TILE / 2}
                    y={y + TILE / 2 + 2}
                    textAnchor="middle"
                    fill="#fde68a"
                    fontSize={6}
                    fontFamily="var(--font-display)"
                    className="pointer-events-none"
                  >
                    CROWN
                  </text>
                )}
                {st && (
                  <title>
                    {`${st.name} · ${STRUCTURE_KIND_LABELS[st.kind] ?? st.kind}`}
                  </title>
                )}
              </g>
            );
          })}

          {/* Armies */}
          {armies.map((army) => {
            const tile = nearestStationTile(
              army.dir,
              undefined,
              maze.walkable,
            );
            const pt = layout.pts[tile];
            if (!pt) return null;
            const fac = getFactionById(campaign, army.factionId);
            const cx = pt.x + TILE / 2;
            const cy = pt.y + TILE / 2;
            const selected = army.id === selectedArmyId;
            const canEngageHere =
              !!engageArmyId &&
              army.id !== engageArmyId &&
              fightTiles.has(tile) &&
              (engageTargets.get(tile) ?? []).includes(army.id);
            return (
              <g
                key={army.id}
                className="cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  if (canEngageHere && engageArmyId) {
                    openBattleResolve(planet.id, engageArmyId, army.id);
                    return;
                  }
                  selectArmy(army.id);
                }}
              >
                {canEngageHere && (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={10}
                    fill="none"
                    stroke="#ef4444"
                    strokeWidth={1.5}
                    opacity={0.9}
                    className="pointer-events-none"
                  />
                )}
                <circle
                  cx={cx}
                  cy={cy}
                  r={selected ? 7 : 5.5}
                  fill={fac?.color ?? "#4fd2ff"}
                  stroke={selected ? "#fff" : canEngageHere ? "#ef4444" : "#0a1018"}
                  strokeWidth={selected || canEngageHere ? 2 : 1.2}
                />
                <title>
                  {`${army.name} · ${armyStrength(army)}% · ${fac?.name ?? "Unknown"}${canEngageHere ? " · Click to engage" : ""}`}
                </title>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="relative z-[1] shrink-0 flex flex-wrap items-center justify-center gap-2 px-3 pb-3">
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
          <span className="text-[10px] text-muted">
            {selectedArmy.name}
            {play.active
              ? ` · ${remaining}/${ARMY_MOVE_RANGE} tiles left`
              : ""}
          </span>
        )}
      </div>
    </div>
  );
}
