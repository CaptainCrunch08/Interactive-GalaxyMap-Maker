import type {
  Campaign,
  CampaignHyperlane,
  HyperlaneEdits,
  StarSystem,
} from "../types/campaign";
import { CLAIM_RADIUS } from "./territory";

export type Hyperlane = CampaignHyperlane;

/**
 * Local lane reach only — long cross-map bridges look messy.
 * Galaxy generation fills voids so stars stay within this range.
 */
export const HYPERLANE_MAX_DIST = CLAIM_RADIUS * 2.5;
/** Soft cap on lanes per system after the spanning tree. */
export const HYPERLANE_MAX_DEGREE = 4;
/** Target extra neighbors per star (beyond MST). */
const HYPERLANE_TARGET_DEGREE = 3;
/** Ignore pairs closer than this (stacked systems). */
const HYPERLANE_MIN_DIST = 48;

type Edge = {
  a: string;
  b: string;
  ax: number;
  ay: number;
  bx: number;
  by: number;
  dist: number;
};

function orient(ax: number, ay: number, bx: number, by: number, cx: number, cy: number) {
  const v = (by - ay) * (cx - bx) - (bx - ax) * (cy - by);
  if (Math.abs(v) < 1e-6) return 0;
  return v > 0 ? 1 : 2;
}

function onSegment(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
) {
  return (
    Math.min(ax, bx) - 1e-6 <= cx &&
    cx <= Math.max(ax, bx) + 1e-6 &&
    Math.min(ay, by) - 1e-6 <= cy &&
    cy <= Math.max(ay, by) + 1e-6
  );
}

/** True if segments AB and CD properly cross (shared endpoints don't count). */
export function segmentsCross(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
): boolean {
  const o1 = orient(ax, ay, bx, by, cx, cy);
  const o2 = orient(ax, ay, bx, by, dx, dy);
  const o3 = orient(cx, cy, dx, dy, ax, ay);
  const o4 = orient(cx, cy, dx, dy, bx, by);

  if (o1 !== o2 && o3 !== o4) {
    if (
      (ax === cx && ay === cy) ||
      (ax === dx && ay === dy) ||
      (bx === cx && by === cy) ||
      (bx === dx && by === dy)
    ) {
      return false;
    }
    return true;
  }

  if (o1 === 0 && onSegment(ax, ay, bx, by, cx, cy)) return true;
  if (o2 === 0 && onSegment(ax, ay, bx, by, dx, dy)) return true;
  if (o3 === 0 && onSegment(cx, cy, dx, dy, ax, ay)) return true;
  if (o4 === 0 && onSegment(cx, cy, dx, dy, bx, by)) return true;
  return false;
}

function edgeKey(a: string, b: string) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function crossesAny(edge: Edge, accepted: Edge[]): boolean {
  for (const other of accepted) {
    if (
      segmentsCross(
        edge.ax,
        edge.ay,
        edge.bx,
        edge.by,
        other.ax,
        other.ay,
        other.bx,
        other.by,
      )
    ) {
      return true;
    }
  }
  return false;
}

function allPairEdges(systems: StarSystem[], maxDist: number): Edge[] {
  const edges: Edge[] = [];
  for (let i = 0; i < systems.length; i++) {
    const a = systems[i]!;
    for (let j = i + 1; j < systems.length; j++) {
      const b = systems[j]!;
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      if (dist < HYPERLANE_MIN_DIST || dist > maxDist) continue;
      edges.push({
        a: a.id,
        b: b.id,
        ax: a.x,
        ay: a.y,
        bx: b.x,
        by: b.y,
        dist,
      });
    }
  }
  edges.sort((e1, e2) => e1.dist - e2.dist);
  return edges;
}

/**
 * Local hyperlane network: MST + nearby enrichment within HYPERLANE_MAX_DIST.
 * Generation is responsible for keeping stars close enough to connect.
 */
export function buildHyperlanes(systems: StarSystem[]): Hyperlane[] {
  if (systems.length < 2) return [];

  const edges = allPairEdges(systems, HYPERLANE_MAX_DIST);

  const degree = new Map<string, number>();
  for (const s of systems) degree.set(s.id, 0);

  const accepted: Edge[] = [];
  const acceptedKeys = new Set<string>();

  const tryAdd = (
    edge: Edge,
    opts: { allowCross: boolean; ignoreDegree: boolean; maxDegree?: number },
  ) => {
    const key = edgeKey(edge.a, edge.b);
    if (acceptedKeys.has(key)) return false;
    const da = degree.get(edge.a) ?? 0;
    const db = degree.get(edge.b) ?? 0;
    const cap = opts.maxDegree ?? HYPERLANE_MAX_DEGREE;
    if (!opts.ignoreDegree && (da >= cap || db >= cap)) return false;
    if (!opts.allowCross && crossesAny(edge, accepted)) return false;
    accepted.push(edge);
    acceptedKeys.add(key);
    degree.set(edge.a, da + 1);
    degree.set(edge.b, db + 1);
    return true;
  };

  const parent = new Map<string, string>();
  const find = (id: string): string => {
    const stored = parent.get(id) ?? id;
    if (stored !== id) {
      const root = find(stored);
      parent.set(id, root);
      return root;
    }
    return id;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (const s of systems) parent.set(s.id, s.id);

  // Spanning tree within local reach
  for (const edge of edges) {
    if (find(edge.a) === find(edge.b)) continue;
    if (tryAdd(edge, { allowCross: true, ignoreDegree: true })) {
      union(edge.a, edge.b);
    }
  }

  // Enrich toward a few local neighbors
  for (const edge of edges) {
    const da = degree.get(edge.a) ?? 0;
    const db = degree.get(edge.b) ?? 0;
    if (da >= HYPERLANE_TARGET_DEGREE && db >= HYPERLANE_TARGET_DEGREE) {
      continue;
    }
    tryAdd(edge, {
      allowCross: true,
      ignoreDegree: false,
      maxDegree: HYPERLANE_TARGET_DEGREE,
    });
  }

  // Extra short non-crossing lanes
  for (const edge of edges) {
    tryAdd(edge, {
      allowCross: false,
      ignoreDegree: false,
      maxDegree: HYPERLANE_MAX_DEGREE,
    });
  }

  return accepted.map((e) => ({
    id: laneKey(e.a, e.b),
    a: e.a,
    b: e.b,
  }));
}

function pruneEdits(
  edits: HyperlaneEdits,
  systems: StarSystem[],
): HyperlaneEdits {
  const ids = new Set(systems.map((s) => s.id));
  const added = edits.added.filter(
    (l) =>
      l.a !== l.b &&
      ids.has(l.a) &&
      ids.has(l.b),
  );
  const addedKeys = new Set(added.map((l) => laneKey(l.a, l.b)));
  const removed = edits.removed.filter((k) => {
    const [a, b] = k.split("__");
    if (!a || !b) return false;
    // Drop removals for missing systems; keep if both still exist.
    return ids.has(a) && ids.has(b) && !addedKeys.has(k);
  });
  return { added, removed };
}

function normalizeLane(a: string, b: string): Hyperlane {
  const k = laneKey(a, b);
  return a < b ? { id: k, a, b } : { id: k, a: b, b: a };
}

function dedupeLanes(lanes: Hyperlane[]): Hyperlane[] {
  const have = new Set<string>();
  const out: Hyperlane[] = [];
  for (const lane of lanes) {
    if (lane.a === lane.b) continue;
    const n = normalizeLane(lane.a, lane.b);
    if (have.has(n.id)) continue;
    have.add(n.id);
    out.push(n);
  }
  return out;
}

function filterLanesToSystems(
  lanes: Hyperlane[],
  systems: StarSystem[],
): Hyperlane[] {
  const ids = new Set(systems.map((s) => s.id));
  return dedupeLanes(
    lanes.filter((l) => ids.has(l.a) && ids.has(l.b) && l.a !== l.b),
  );
}

/**
 * New lanes that attach `newSystemId` to the existing network without
 * removing or rewriting any prior edges.
 */
export function lanesConnectingNewSystem(
  existingLanes: Hyperlane[],
  systems: StarSystem[],
  newSystemId: string,
): Hyperlane[] {
  const byId = new Map(systems.map((s) => [s.id, s]));
  const neu = byId.get(newSystemId);
  if (!neu || systems.length < 2) return [];

  const degree = new Map<string, number>();
  for (const s of systems) degree.set(s.id, 0);

  const accepted: Edge[] = [];
  const acceptedKeys = new Set<string>();

  for (const lane of existingLanes) {
    const a = byId.get(lane.a);
    const b = byId.get(lane.b);
    if (!a || !b || lane.a === lane.b) continue;
    const key = laneKey(lane.a, lane.b);
    if (acceptedKeys.has(key)) continue;
    accepted.push({
      a: lane.a,
      b: lane.b,
      ax: a.x,
      ay: a.y,
      bx: b.x,
      by: b.y,
      dist: Math.hypot(b.x - a.x, b.y - a.y),
    });
    acceptedKeys.add(key);
    degree.set(lane.a, (degree.get(lane.a) ?? 0) + 1);
    degree.set(lane.b, (degree.get(lane.b) ?? 0) + 1);
  }

  const candidates: Edge[] = [];
  for (const other of systems) {
    if (other.id === newSystemId) continue;
    const dist = Math.hypot(other.x - neu.x, other.y - neu.y);
    if (dist < HYPERLANE_MIN_DIST || dist > HYPERLANE_MAX_DIST) continue;
    candidates.push({
      a: newSystemId,
      b: other.id,
      ax: neu.x,
      ay: neu.y,
      bx: other.x,
      by: other.y,
      dist,
    });
  }
  candidates.sort((e1, e2) => e1.dist - e2.dist);

  const created: Hyperlane[] = [];

  const tryAdd = (
    edge: Edge,
    opts: { allowCross: boolean; ignoreDegree: boolean; maxDegree?: number },
  ) => {
    const key = edgeKey(edge.a, edge.b);
    if (acceptedKeys.has(key)) return false;
    const da = degree.get(edge.a) ?? 0;
    const db = degree.get(edge.b) ?? 0;
    const cap = opts.maxDegree ?? HYPERLANE_MAX_DEGREE;
    if (!opts.ignoreDegree && (da >= cap || db >= cap)) return false;
    if (!opts.allowCross && crossesAny(edge, accepted)) return false;
    accepted.push(edge);
    acceptedKeys.add(key);
    degree.set(edge.a, da + 1);
    degree.set(edge.b, db + 1);
    created.push(normalizeLane(edge.a, edge.b));
    return true;
  };

  // Guarantee a link when anything is in range (even if neighbors are full).
  for (const edge of candidates) {
    if (tryAdd(edge, { allowCross: true, ignoreDegree: true })) break;
  }
  for (const edge of candidates) {
    tryAdd(edge, {
      allowCross: true,
      ignoreDegree: false,
      maxDegree: HYPERLANE_TARGET_DEGREE,
    });
  }
  for (const edge of candidates) {
    tryAdd(edge, {
      allowCross: false,
      ignoreDegree: false,
      maxDegree: HYPERLANE_MAX_DEGREE,
    });
  }
  return created;
}

/** Bake a sticky lane list onto the campaign (clears incremental edits). */
export function campaignWithBakedHyperlanes(
  campaign: Campaign,
  lanes: Hyperlane[],
): Campaign {
  const next: Campaign = {
    ...campaign,
    hyperlanes: filterLanesToSystems(lanes, campaign.systems),
  };
  delete next.hyperlaneEdits;
  return next;
}

/**
 * Place a star: keep every existing lane, only append links for the new system.
 */
export function campaignWithSystemPlaced(
  campaign: Campaign,
  system: StarSystem,
): Campaign {
  const priorLanes = getCampaignHyperlanes(campaign);
  const systems = [...campaign.systems, system];
  const extra = lanesConnectingNewSystem(priorLanes, systems, system.id);
  const next: Campaign = {
    ...campaign,
    systems,
    hyperlanes: dedupeLanes([...priorLanes, ...extra]),
  };
  delete next.hyperlaneEdits;
  return next;
}

/** True when the campaign has any persistent lane overrides / bake. */
export function hasHyperlaneEdits(
  campaign: Pick<Campaign, "hyperlanes" | "hyperlaneEdits">,
): boolean {
  if (campaign.hyperlaneEdits) {
    const e = campaign.hyperlaneEdits;
    return e.added.length > 0 || e.removed.length > 0;
  }
  return campaign.hyperlanes !== undefined;
}

/**
 * Convert a legacy full `hyperlanes` bake into incremental edits vs current auto.
 * Prefer baking sticky graphs instead; kept for older saves.
 */
export function migrateLegacyHyperlanes(
  systems: StarSystem[],
  baked: Hyperlane[],
): HyperlaneEdits {
  const auto = buildHyperlanes(systems);
  const autoKeys = new Set(auto.map((l) => laneKey(l.a, l.b)));
  const bakedNorm = filterLanesToSystems(baked, systems);
  const bakedKeys = new Set(bakedNorm.map((l) => l.id));
  const added = bakedNorm.filter((l) => !autoKeys.has(l.id));
  const removed = auto
    .map((l) => laneKey(l.a, l.b))
    .filter((k) => !bakedKeys.has(k));
  return pruneEdits({ added, removed }, systems);
}

/**
 * Sticky network: baked `hyperlanes` when present, else live auto.
 * Optional `hyperlaneEdits` still layer on top for older incremental saves.
 */
export function getCampaignHyperlanes(campaign: Campaign): Hyperlane[] {
  const systems = campaign.systems;
  const ids = new Set(systems.map((s) => s.id));

  const base: Hyperlane[] = campaign.hyperlanes
    ? filterLanesToSystems(campaign.hyperlanes, systems)
    : buildHyperlanes(systems);

  const edits = campaign.hyperlaneEdits
    ? pruneEdits(campaign.hyperlaneEdits, systems)
    : null;
  if (!edits) return base;

  const removed = new Set(edits.removed);
  const result: Hyperlane[] = [];
  const have = new Set<string>();

  for (const lane of base) {
    const k = laneKey(lane.a, lane.b);
    if (removed.has(k)) continue;
    result.push({ id: k, a: lane.a, b: lane.b });
    have.add(k);
  }
  for (const lane of edits.added) {
    const k = laneKey(lane.a, lane.b);
    if (!ids.has(lane.a) || !ids.has(lane.b) || lane.a === lane.b) continue;
    if (have.has(k) || removed.has(k)) continue;
    result.push({ id: k, a: lane.a, b: lane.b });
    have.add(k);
  }
  return result;
}

/** Apply a user-drawn lane (bake sticky network). */
export function campaignWithHyperlaneAdded(
  campaign: Campaign,
  a: string,
  b: string,
): Campaign | null {
  if (a === b) return null;
  const ids = new Set(campaign.systems.map((s) => s.id));
  if (!ids.has(a) || !ids.has(b)) return null;
  const resolved = getCampaignHyperlanes(campaign);
  const k = laneKey(a, b);
  if (resolved.some((l) => laneKey(l.a, l.b) === k)) return null;
  return campaignWithBakedHyperlanes(campaign, [
    ...resolved,
    normalizeLane(a, b),
  ]);
}

/** Remove a lane from the sticky network (bakes if needed). */
export function campaignWithHyperlaneRemoved(
  campaign: Campaign,
  laneId: string,
): Campaign {
  const resolved = getCampaignHyperlanes(campaign);
  const lane = resolved.find(
    (l) => l.id === laneId || laneKey(l.a, l.b) === laneId,
  );
  if (!lane) return campaign;
  const k = laneKey(lane.a, lane.b);
  return campaignWithBakedHyperlanes(
    campaign,
    resolved.filter((l) => laneKey(l.a, l.b) !== k),
  );
}

/** Clear bake/edits so lanes rebuild from current star positions. */
export function campaignWithHyperlanesReset(campaign: Campaign): Campaign {
  const next = { ...campaign };
  delete next.hyperlanes;
  delete next.hyperlaneEdits;
  return next;
}

/** Drop edits that reference a deleted system. */
export function campaignWithSystemHyperlanesPruned(
  campaign: Campaign,
  deletedSystemId: string,
): Campaign {
  return campaignWithSystemsHyperlanesPruned(campaign, [deletedSystemId]);
}

/** Drop lanes / edits that reference any of the deleted systems. */
export function campaignWithSystemsHyperlanesPruned(
  campaign: Campaign,
  deletedSystemIds: Iterable<string>,
): Campaign {
  const deleted = new Set(deletedSystemIds);
  if (deleted.size === 0) return campaign;
  if (!campaign.hyperlaneEdits && !campaign.hyperlanes) return campaign;

  const systems = campaign.systems.filter((s) => !deleted.has(s.id));
  const next: Campaign = { ...campaign, systems };

  if (campaign.hyperlanes) {
    next.hyperlanes = filterLanesToSystems(campaign.hyperlanes, systems);
  }

  if (campaign.hyperlaneEdits) {
    const nextEdits = pruneEdits(campaign.hyperlaneEdits, systems);
    next.hyperlaneEdits =
      nextEdits.added.length > 0 || nextEdits.removed.length > 0
        ? nextEdits
        : undefined;
  }

  return next;
}

/** Adjacency list from hyperlane endpoints. */
export function hyperlaneAdjacency(
  systems: StarSystem[],
  lanes?: Hyperlane[],
): Map<string, string[]> {
  const graph = new Map<string, string[]>();
  for (const s of systems) graph.set(s.id, []);
  const edges = lanes ?? buildHyperlanes(systems);
  for (const lane of edges) {
    graph.get(lane.a)?.push(lane.b);
    graph.get(lane.b)?.push(lane.a);
  }
  return graph;
}

/**
 * Shortest hyperlane hop count between two systems.
 * Returns `Infinity` when disconnected.
 */
export function systemHopDistance(
  systems: StarSystem[],
  fromId: string,
  toId: string,
  lanes?: Hyperlane[],
): number {
  if (fromId === toId) return 0;
  const adj = hyperlaneAdjacency(systems, lanes);
  if (!adj.has(fromId) || !adj.has(toId)) return Number.POSITIVE_INFINITY;

  const queue: string[] = [fromId];
  const dist = new Map<string, number>([[fromId, 0]]);
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++]!;
    const d = dist.get(cur)!;
    for (const next of adj.get(cur) ?? []) {
      if (dist.has(next)) continue;
      const nd = d + 1;
      if (next === toId) return nd;
      dist.set(next, nd);
      queue.push(next);
    }
  }
  return Number.POSITIVE_INFINITY;
}

export function laneKey(a: string, b: string): string {
  return a < b ? `${a}__${b}` : `${b}__${a}`;
}

export function hyperlaneEndpoints(
  lane: Hyperlane,
  systems: StarSystem[],
): { x1: number; y1: number; x2: number; y2: number } | null {
  const a = systems.find((s) => s.id === lane.a);
  const b = systems.find((s) => s.id === lane.b);
  if (!a || !b) return null;
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
}
