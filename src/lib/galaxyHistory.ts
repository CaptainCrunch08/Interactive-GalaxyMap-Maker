import type {
  Campaign,
  Fleet,
  GalaxyHistoryFleet,
  GalaxyHistoryFrame,
} from "../types/campaign";
import { getSystemOwnership } from "./territory";

export function emptyTimeline(): { frames: GalaxyHistoryFrame[]; events: [] } {
  return { frames: [], events: [] };
}

export function ensureTimeline(campaign: Campaign): Campaign {
  return {
    ...campaign,
    timeline: {
      frames: campaign.timeline?.frames ?? [],
      events: campaign.timeline?.events ?? [],
    },
  };
}

export function nextFrameTimeSec(frames: GalaxyHistoryFrame[]): number {
  if (frames.length === 0) return 0;
  let max = 0;
  for (const f of frames) max = Math.max(max, f.timeSec);
  return max + 1;
}

export function snapshotGalaxyFrame(
  campaign: Campaign,
  opts?: { id?: string; timeSec?: number; label?: string },
): GalaxyHistoryFrame {
  const systemOwners: Record<string, string> = {};
  const contestedSystems: Record<string, string[]> = {};

  for (const system of campaign.systems) {
    const own = getSystemOwnership(campaign, system.id);
    if (own.status === "owned") {
      systemOwners[system.id] = own.factions[0].id;
    } else if (own.status === "contested") {
      contestedSystems[system.id] = own.factions.map((f) => f.id);
    }
  }

  const fleets: GalaxyHistoryFleet[] = (campaign.fleets ?? []).map((f) => ({
    id: f.id,
    name: f.name,
    factionId: f.factionId,
    location: { ...f.location },
  }));

  return {
    id: opts?.id ?? crypto.randomUUID(),
    timeSec: opts?.timeSec ?? 0,
    label: opts?.label,
    systemOwners,
    contestedSystems,
    fleets,
  };
}

function sortedEntries(rec: Record<string, string>): string {
  return Object.keys(rec)
    .sort()
    .map((k) => `${k}=${rec[k]}`)
    .join("|");
}

function sortedContested(rec: Record<string, string[]>): string {
  return Object.keys(rec)
    .sort()
    .map((k) => `${k}=${[...(rec[k] ?? [])].sort().join(",")}`)
    .join("|");
}

function fleetKey(f: GalaxyHistoryFleet): string {
  const loc =
    f.location.kind === "orbit"
      ? `orbit:${f.location.systemId}:${f.location.planetId}`
      : `system:${f.location.systemId}`;
  return `${f.id}:${f.factionId}:${loc}`;
}

/** Compare ownership + fleet poses (ignore id, timeSec, label). */
export function framesEqual(
  a: GalaxyHistoryFrame,
  b: GalaxyHistoryFrame,
): boolean {
  if (sortedEntries(a.systemOwners) !== sortedEntries(b.systemOwners)) {
    return false;
  }
  if (sortedContested(a.contestedSystems) !== sortedContested(b.contestedSystems)) {
    return false;
  }
  const af = [...a.fleets].map(fleetKey).sort().join(";");
  const bf = [...b.fleets].map(fleetKey).sort().join(";");
  return af === bf;
}

/**
 * Build a view-only campaign for timelapse playback: live layout + frame
 * ownership/fleets. Does not mutate the stored campaign.
 */
export function campaignAtFrame(
  live: Campaign,
  frame: GalaxyHistoryFrame | null,
): Campaign {
  if (!frame) {
    return {
      ...live,
      fleets: [],
    };
  }

  const systems = live.systems.map((sys) => {
    const contested = frame.contestedSystems[sys.id];
    if (contested && contested.length >= 2) {
      return { ...sys, controllingFactionId: undefined };
    }
    const owner = frame.systemOwners[sys.id];
    return {
      ...sys,
      controllingFactionId: owner,
    };
  });

  const planets = live.planets.map((p) => {
    const contested = frame.contestedSystems[p.systemId];
    if (contested && contested.length >= 2) {
      const siblings = live.planets
        .filter((x) => x.systemId === p.systemId)
        .sort((a, b) => a.orbitIndex - b.orbitIndex);
      const idx = Math.max(
        0,
        siblings.findIndex((x) => x.id === p.id),
      );
      const factionId = contested[idx % contested.length];
      return { ...p, controllingFactionId: factionId };
    }
    const owner = frame.systemOwners[p.systemId];
    return {
      ...p,
      controllingFactionId: owner,
    };
  });

  const fleets: Fleet[] = frame.fleets.map((f) => {
    const liveFleet = (live.fleets ?? []).find((x) => x.id === f.id);
    return {
      id: f.id,
      name: f.name,
      factionId: f.factionId,
      location: f.location,
      ships: liveFleet?.ships ?? [],
      notes: liveFleet?.notes ?? "",
    };
  });

  return {
    ...live,
    systems,
    planets,
    fleets,
  };
}

export function frameAtTime(
  frames: GalaxyHistoryFrame[],
  timeSec: number,
): GalaxyHistoryFrame | null {
  if (frames.length === 0) return null;
  const sorted = [...frames].sort((a, b) => a.timeSec - b.timeSec);
  let current: GalaxyHistoryFrame | null = null;
  for (const f of sorted) {
    if (f.timeSec <= timeSec + 1e-6) current = f;
    else break;
  }
  return current ?? sorted[0]!;
}

export function timelineSpan(
  frames: GalaxyHistoryFrame[],
  events: { timeSec: number }[],
): number {
  let max = 30;
  for (const f of frames) max = Math.max(max, f.timeSec);
  for (const e of events) max = Math.max(max, e.timeSec);
  return Math.max(max, 1);
}

/** Append a frame when ownership/fleets changed (or always if force). */
export function withHistoryCapture(
  campaign: Campaign,
  opts?: { force?: boolean; label?: string },
): Campaign {
  const existingFrames = campaign.timeline?.frames ?? [];
  const events = campaign.timeline?.events ?? [];
  const snap = snapshotGalaxyFrame(campaign, {
    timeSec: nextFrameTimeSec(existingFrames),
    label: opts?.label,
  });
  const last = existingFrames[existingFrames.length - 1];
  if (!opts?.force && last && framesEqual(last, snap)) {
    return {
      ...campaign,
      timeline: { frames: existingFrames, events },
    };
  }
  return {
    ...campaign,
    timeline: {
      frames: [...existingFrames, snap].sort((a, b) => a.timeSec - b.timeSec),
      events,
    },
  };
}
