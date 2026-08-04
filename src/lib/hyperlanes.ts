import type { Campaign, CampaignHyperlane, StarSystem } from "../types/campaign";
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
    id: edgeKey(e.a, e.b),
    a: e.a,
    b: e.b,
  }));
}

/** Prefer persisted manual lanes; otherwise auto-generate. */
export function getCampaignHyperlanes(campaign: Campaign): Hyperlane[] {
  if (campaign.hyperlanes) {
    const ids = new Set(campaign.systems.map((s) => s.id));
    return campaign.hyperlanes.filter((l) => ids.has(l.a) && ids.has(l.b));
  }
  return buildHyperlanes(campaign.systems);
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
